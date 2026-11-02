/**
 * End-to-end check of the authoritative table against a real local Nakama
 * (`docker compose up -d`, module freshly built). The scenarios run in order.
 *
 * Quick match: two guest clients quick-match into one table, bots backfill the
 * other two seats, both humans play legal moves from their own snapshots,
 * client B drops mid-round and comes back to the same seat, and the game is
 * played to the end.
 *
 * Display names ride along: both guests pick a name before quick match (and A
 * first sees a too-short and a profane name rejected), each sees the other's
 * name in `players[seat].name`, B renames before dropping and A sees the new
 * name once B reclaims the seat, and a third change within the hour is
 * rate-limited (429). Device ids include the run time, so every run starts
 * from fresh accounts with no rename cooldown.
 *
 * Private table: A creates a table and joins with the code, B finds it by code
 * and joins, a newcomer without the code is refused, B switches seats, A
 * leaves (B becomes host) and rejoins, B starts (bots fill the empty seats), C
 * joins by code mid-game as a standing member (no view, no hand), takes over a
 * bot seat and plays. Everyone leaves; the code dies once the empty table
 * closes. A fresh user D is rate-limited after 10 bad codes. With `--full` the
 * private game is played to the end, the table returns to its room and the
 * host starts a second game with a different deal.
 *
 * Recent players ride along with quick match: once the game finishes, each
 * human's `social/recent_players` record lists the other human and no bots.
 * A second short quick match then checks the leave path: B leaves right after
 * the deal and gets a record at once, A only when A leaves too.
 *
 * Friends: two fresh guests get friend-code usernames. A adds B by code (typed
 * lowercase), B gets the -2 notification and accepts, A gets -3, and both list
 * each other as friends. Over social sockets they follow each other, see each
 * other online and A sees B's status change. A removes B, B blocks A (A's new
 * request is dropped silently), B unblocks and a fresh request works. With
 * `--limits` (or `--full`) a fresh sender fills its 50 outgoing requests and
 * the 51st is refused with 429 friend_outgoing_limit.
 *
 * Invites: two fresh guests become mutual friends (A adds B by friend code, B
 * accepts), A creates and joins a private table and invites B. A second
 * identical invite is a no-op (`sent: false`); B receives exactly one
 * TABLE_INVITE notification (on the social socket and in the persistent inbox,
 * with a well-formed `TableInviteContent`) and joins by its code into the room.
 * An invite from a stranger is refused with invite_not_friend (400), an unknown
 * code with invite_room_not_found (404), and a caller who is not in that room
 * with invite_not_member (403). Invites run with `--invite` or `--full`, and
 * alone with `--invite-only`.
 *
 * Run: `pnpm --filter @chkobba/server e2e [-- --full] [-- --limits]
 * [-- --private-only | --quick-only | --friends-only | --invite-only]
 * [-- --invite]`.
 * Exits 0 on success, 1 on failure.
 * Env: NAKAMA_HOST (127.0.0.1), NAKAMA_PORT (7350), NAKAMA_KEY (defaultkey),
 * E2E_TIMEOUT_MS (overall cap; default is the sum of the selected scenarios'
 * budgets: quick match 12 min plus 2 min for the leaver game, private 6 min or
 * 18 min with --full, friends 3 min plus 2 min with --limits, invites 3 min).
 */
import {
  Client,
  type MatchData,
  type Notification,
  type Presence,
  type Session,
  type Socket,
  type StatusPresenceEvent,
  type StorageObject,
} from '@heroiclabs/nakama-js';
import { chooseCut, createBot, type GameEvent, type PlayerView } from '@chkobba/rules';
import {
  ERROR_CODES,
  FRIEND_LIMITS,
  FRIEND_STATE,
  NOTIFICATION_CODES,
  OpCode,
  RECENT_PLAYERS_KEY,
  SOCIAL_COLLECTION,
  isFriendCode,
  type FriendErrorCode,
  type InviteRpcErrorCode,
  type PresenceStatus,
  ROOM_JOIN_CODE_KEY,
  ROOM_RESET_MS,
  type NameErrorCode,
  TABLE_PHASES,
  isRoomCode,
  type CutIntent,
  type ErrorCode,
  type LogEntry,
  type PlayIntent,
  type PlayerInfo,
  type RoomInfo,
  type RoomMember,
  type RoomRpcErrorCode,
  type SitIntent,
  type Snapshot,
  type TableInviteContent,
} from '@chkobba/protocol';

const HOST = process.env.NAKAMA_HOST ?? '127.0.0.1';
const PORT = process.env.NAKAMA_PORT ?? '7350';
const SERVER_KEY = process.env.NAKAMA_KEY ?? 'defaultkey';

const ARGS = new Set(process.argv.slice(2));
const FULL = ARGS.has('--full');
const ONLY_QUICK = ARGS.has('--quick-only');
const ONLY_PRIVATE = ARGS.has('--private-only');
const ONLY_FRIENDS = ARGS.has('--friends-only');
const ONLY_INVITE = ARGS.has('--invite-only');
const ONLY_DIRECTORY = ARGS.has('--directory-only');
const RUN_QUICK = !ONLY_PRIVATE && !ONLY_FRIENDS && !ONLY_INVITE && !ONLY_DIRECTORY;
const RUN_PRIVATE = !ONLY_QUICK && !ONLY_FRIENDS && !ONLY_INVITE && !ONLY_DIRECTORY;
const RUN_FRIENDS = !ONLY_QUICK && !ONLY_PRIVATE && !ONLY_INVITE && !ONLY_DIRECTORY;
/** Invites: its own section, off by default and on with `--invite` or `--full`. */
const RUN_INVITE = ONLY_INVITE || ARGS.has('--invite') || FULL;
/** Players directory: its own section, on with `--directory-only` or `--full`. */
const RUN_DIRECTORY = ONLY_DIRECTORY || FULL;
/** The 61st-search rate-limit check; part of the directory scenario. */
const RUN_DIRECTORY_LIMITS = RUN_DIRECTORY && (ARGS.has('--limits') || FULL);
/** The 51-account outgoing-limit check; part of the friends scenario. */
const RUN_LIMITS = RUN_FRIENDS && (ARGS.has('--limits') || FULL);

/** A quick-match game to 21 takes ~5-8 min at server pacing. */
const QUICK_BUDGET_MS = 12 * 60 * 1000;
/** Private short run: ~1 min of setup and play, then the 60 s empty-table close. */
const PRIVATE_BUDGET_MS = (FULL ? 18 : 6) * 60 * 1000;
/** Leaver game: up to 25 s of backfill, then two leaves and their record writes. */
const LEAVER_BUDGET_MS = 2 * 60 * 1000;
/** Friends: a few dozen REST and socket round trips; the limit check adds 52 sign-ups. */
const FRIENDS_BUDGET_MS = (RUN_LIMITS ? 5 : 3) * 60 * 1000;
/** Invites: two sign-ins, a friend handshake, one table and a handful of calls. */
const INVITE_BUDGET_MS = 3 * 60 * 1000;
/** Directory: a few dozen claim, search, profile and block calls (the limit check adds 61 searches). */
const DIRECTORY_BUDGET_MS = (RUN_DIRECTORY_LIMITS ? 4 : 2) * 60 * 1000;
const OVERALL_TIMEOUT_MS = Number(
  process.env.E2E_TIMEOUT_MS ??
    (RUN_QUICK ? QUICK_BUDGET_MS + LEAVER_BUDGET_MS : 0) +
      (RUN_PRIVATE ? PRIVATE_BUDGET_MS : 0) +
      (RUN_FRIENDS ? FRIENDS_BUDGET_MS : 0) +
      (RUN_INVITE ? INVITE_BUDGET_MS : 0) +
      (RUN_DIRECTORY ? DIRECTORY_BUDGET_MS : 0),
);

const SEAT_COUNT = 4;
/** `Snapshot.seat` of a standing private-table member. */
const STANDING_SEAT = -1;
/** Server backfills 15 s after the first human sits; leave headroom for tick alignment. */
const BACKFILL_TIMEOUT_MS = 25_000;
/** Plays seen in round 1 before client B is dropped. */
const PLAYS_BEFORE_DROP = 4;
const QUICK_MATCH_ATTEMPTS = 5;
/**
 * Mirrors `EMPTY_TIMEOUT_MS` in `src/match/tableMatch.ts` (not imported: that
 * module needs the nkruntime ambient types, which the scripts tsconfig lacks).
 */
const EMPTY_TIMEOUT_MS = 60_000;
/** Plays C makes after taking over a bot seat in the short private run. */
const TAKEOVER_PLAYS = 2;
/** Mirrors `LOOKUP_FAILURE_LIMIT` in `src/rpc/roomLimits.ts`. */
const LOOKUP_FAILURE_LIMIT = 10;
/** Keys that would leak hidden state if they ever showed up in a client's snapshot. */
const HIDDEN_KEYS = ['hands', 'stock', 'deck', 'rng'];
/** The only keys a room member entry may carry (a user id for social actions, never a session id). */
const MEMBER_KEYS: ReadonlySet<string> = new Set(['name', 'seat', 'isHost', 'userId']);
/** Errors that mean the script or server disagree about legality, not a benign race. */
const FATAL_ERRORS: ReadonlySet<ErrorCode> = new Set<ErrorCode>(['bad_opcode', 'bad_payload', 'illegal_move', 'not_seated']);
/** gRPC status codes the account hook and room RPCs return, and the HTTP statuses they map to. */
const GRPC_INVALID_ARGUMENT = 3;
const GRPC_NOT_FOUND = 5;
const GRPC_PERMISSION_DENIED = 7;
const GRPC_RESOURCE_EXHAUSTED = 8;
const GRPC_FAILED_PRECONDITION = 9;
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_TOO_MANY_REQUESTS = 429;

class E2eFailure extends Error {}

function check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new E2eFailure(message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(message: string): void {
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1).padStart(6);
  console.log(`[${elapsed}s] ${message}`);
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

// ---------------------------------------------------------------------------
// Decoding: everything off the socket is untrusted, so check the shape first.

type UnknownRecord = { readonly [key: string]: unknown };

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function isSeat(value: unknown): value is number {
  return isInt(value) && value >= 0 && value < SEAT_COUNT;
}

function isPlayerInfo(value: unknown): value is PlayerInfo {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    typeof value.isBot === 'boolean' &&
    typeof value.away === 'boolean' &&
    typeof value.connected === 'boolean'
  );
}

function isLogEntry(value: unknown): value is LogEntry {
  return isRecord(value) && isInt(value.seq) && isRecord(value.event) && typeof value.event.type === 'string';
}

/** Checks the PlayerView fields this script relies on. */
function isPlayerView(value: unknown): value is PlayerView {
  if (!isRecord(value)) return false;
  const cut = value.cut;
  return (
    isSeat(value.seat) &&
    typeof value.phase === 'string' &&
    isInt(value.round) &&
    isSeat(value.turn) &&
    Array.isArray(value.hand) &&
    // Empty while cutting: hands are only dealt once the cut is resolved.
    Array.isArray(value.handCounts) &&
    value.handCounts.every(isInt) &&
    Array.isArray(value.table) &&
    isInt(value.stockCount) &&
    Array.isArray(value.legalMoves) &&
    Array.isArray(value.scores) &&
    (cut === null || (isRecord(cut) && isSeat(cut.seat) && (cut.card === null || isRecord(cut.card)))) &&
    (value.winner === null || value.winner === 0 || value.winner === 1)
  );
}

function isRoomMember(value: unknown): value is RoomMember {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    (value.seat === null || isSeat(value.seat)) &&
    typeof value.isHost === 'boolean'
  );
}

function isRoomInfo(value: unknown): value is RoomInfo {
  if (!isRecord(value)) return false;
  const scores = value.scores;
  return (
    typeof value.code === 'string' &&
    Array.isArray(value.members) &&
    value.members.every(isRoomMember) &&
    isInt(value.you) &&
    (scores === null || (Array.isArray(scores) && scores.length === 2 && scores.every(isInt))) &&
    (value.resetAt === null || isInt(value.resetAt))
  );
}

const TABLE_PHASE_SET: ReadonlySet<unknown> = new Set<unknown>(TABLE_PHASES);
const ERROR_CODE_SET: ReadonlySet<unknown> = new Set<unknown>(ERROR_CODES);

function isSnapshot(value: unknown): value is Snapshot {
  return (
    isRecord(value) &&
    // A standing member of a private table has seat -1 and must carry `room`.
    (isSeat(value.seat) || (value.seat === STANDING_SEAT && value.room !== undefined)) &&
    TABLE_PHASE_SET.has(value.phase) &&
    (value.view === null || isPlayerView(value.view)) &&
    Array.isArray(value.players) &&
    value.players.length === SEAT_COUNT &&
    value.players.every((p: unknown) => p === null || isPlayerInfo(p)) &&
    Array.isArray(value.log) &&
    value.log.every(isLogEntry) &&
    isInt(value.serverTime) &&
    (value.room === undefined || isRoomInfo(value.room))
  );
}

function parseJson(data: Uint8Array): unknown {
  return JSON.parse(new TextDecoder().decode(data));
}

function parseErrorCode(value: unknown): ErrorCode | null {
  if (!isRecord(value) || !ERROR_CODE_SET.has(value.code)) return null;
  const code = ERROR_CODES.find((c) => c === value.code);
  return code ?? null;
}

/** What a REST call answered: 200 with its payload on success, else the HTTP status and error body. */
interface HttpOutcome {
  readonly status: number;
  readonly body: unknown;
}

/** nakama-js rejects a failed REST call with the fetch `Response` itself. */
function isFetchResponse(value: unknown): value is Response {
  return isRecord(value) && typeof value.status === 'number' && typeof value.json === 'function';
}

/** Checks a rejected call: exact HTTP status and `{ code, message }` body. */
function expectRejected(owner: string, outcome: HttpOutcome, status: number, grpcCode: number, message: string): void {
  const body = JSON.stringify(outcome.body);
  check(outcome.status === status, `${owner}: expected HTTP ${status} ${message}, got ${outcome.status} ${body}`);
  check(
    isRecord(outcome.body) && outcome.body.code === grpcCode && outcome.body.message === message,
    `${owner}: expected body {"code":${grpcCode},"message":"${message}"}, got ${body}`,
  );
}

function expectNameRejected(owner: string, outcome: HttpOutcome, status: number, grpcCode: number, message: NameErrorCode): void {
  expectRejected(owner, outcome, status, grpcCode, message);
}

function expectRoomRejected(owner: string, outcome: HttpOutcome, status: number, grpcCode: number, message: RoomRpcErrorCode): void {
  expectRejected(owner, outcome, status, grpcCode, message);
}

function expectNameAccepted(owner: string, name: string, outcome: HttpOutcome): void {
  check(outcome.status === HTTP_OK, `${owner}: renaming to "${name}" failed with ${outcome.status} ${JSON.stringify(outcome.body)}`);
}

/** Hidden-information invariants every snapshot must satisfy. */
function assertPrivate(owner: string, raw: unknown, snapshot: Snapshot): void {
  check(isRecord(raw), `${owner}: snapshot is not an object`);
  for (const key of HIDDEN_KEYS) check(!(key in raw), `${owner}: snapshot exposes "${key}"`);
  const room = snapshot.room;
  if (room !== undefined) {
    for (const member of room.members) {
      for (const key of Object.keys(member)) check(MEMBER_KEYS.has(key), `${owner}: room member exposes "${key}"`);
    }
    const you = room.members[room.you];
    check(you !== undefined, `${owner}: room.you ${room.you} is not a member index`);
    const expectedSeat = snapshot.seat === STANDING_SEAT ? null : snapshot.seat;
    check(you.seat === expectedSeat, `${owner}: own member entry has seat ${String(you.seat)}, snapshot seat ${snapshot.seat}`);
  }
  const view = snapshot.view;
  if (snapshot.seat === STANDING_SEAT) {
    check(view === null, `${owner}: standing member got a view`);
    check(isRecord(raw) && raw.view === null, `${owner}: standing member's raw view is not null`);
    return;
  }
  if (view === null) return;
  check(isRecord(raw.view), `${owner}: view is not an object`);
  for (const key of HIDDEN_KEYS) check(!(key in raw.view), `${owner}: view exposes "${key}"`);
  check(view.seat === snapshot.seat, `${owner}: view seat ${view.seat} != snapshot seat ${snapshot.seat}`);
  const ownCount = view.handCounts[view.seat] ?? 0;
  check(view.hand.length === ownCount, `${owner}: hand has ${view.hand.length} cards but handCounts says ${String(ownCount)}`);
  if (view.cut !== null && view.cut.seat !== view.seat) {
    check(view.cut.card === null, `${owner}: sees seat ${view.cut.seat}'s cut card`);
  }
  if (view.turn !== view.seat) check(view.legalMoves.length === 0, `${owner}: has legal moves out of turn`);
}

// ---------------------------------------------------------------------------
// One human player: a device login, a socket, and a bot brain for its own seat.

const client = new Client(SERVER_KEY, HOST, PORT, false, 7000, false);

type IntentPayload = CutIntent | PlayIntent | SitIntent | null;

class Player {
  readonly label: string;
  readonly deviceId: string;
  private session: Session | null = null;
  private socket: Socket | null = null;
  matchId: string | null = null;
  snapshot: Snapshot | null = null;
  snapshotCount = 0;
  firstSnapshot: Snapshot | null = null;
  /** Every public log entry received, in seq order. */
  readonly events: LogEntry[] = [];
  readonly errors: ErrorCode[] = [];
  autoplay = false;
  /** PLAY intents this client sent (as opposed to a bot playing its seat). */
  playsSent = 0;
  /** True once any snapshot with seat -1 arrived; standing snapshots never carry a view. */
  sawStanding = false;
  /** First round-1 hand seen per game, keyed by the number of `dealerDrawn` events received so far. */
  readonly openingHands = new Map<number, string>();
  private lastActionKey: string | null = null;
  private readonly brain = createBot('normal');
  /** First fatal problem seen inside a socket callback; rethrown by the main flow. */
  failure: Error | null = null;
  onSnapshot: ((player: Player, snapshot: Snapshot) => void) | null = null;

  constructor(label: string, deviceId: string) {
    this.label = label;
    this.deviceId = deviceId;
  }

  get userId(): string {
    check(this.session !== null, `${this.label}: not signed in`);
    return this.session.user_id ?? '';
  }

  get seat(): number {
    check(this.snapshot !== null, `${this.label}: no snapshot yet`);
    return this.snapshot.seat;
  }

  /** The room info of the latest snapshot; fails on a public table or before any snapshot. */
  get room(): RoomInfo {
    const room = this.snapshot?.room;
    check(room !== undefined, `${this.label}: latest snapshot has no room`);
    return room;
  }

  async connect(): Promise<void> {
    this.session = await client.authenticateDevice(this.deviceId, true);
    const socket = client.createSocket(false, false);
    socket.onmatchdata = (data: MatchData) => this.handleData(data);
    socket.ondisconnect = () => undefined;
    await socket.connect(this.session, true);
    this.socket = socket;
  }

  /** Sets the display name through the account API; rejections come back as an outcome, not a throw. */
  async rename(displayName: string): Promise<HttpOutcome> {
    check(this.session !== null, `${this.label}: not signed in`);
    try {
      await client.updateAccount(this.session, { display_name: displayName });
      return { status: HTTP_OK, body: {} };
    } catch (error) {
      return this.failedCall('updateAccount', error);
    }
  }

  /** Calls an RPC; success resolves `{ status: 200, body: payload }`, a rejection its status and error body. */
  async rpc(id: string, payload: object): Promise<HttpOutcome> {
    check(this.session !== null, `${this.label}: not signed in`);
    try {
      const response = await client.rpc(this.session, id, payload);
      return { status: HTTP_OK, body: response.payload ?? null };
    } catch (error) {
      return this.failedCall(id, error);
    }
  }

  private async failedCall(what: string, error: unknown): Promise<HttpOutcome> {
    if (!isFetchResponse(error)) throw new E2eFailure(`${this.label}: ${what} failed: ${String(error)}`);
    const body: unknown = await error.json().catch(() => null);
    return { status: error.status, body };
  }

  /** User ids listed in this player's `social/recent_players` record (empty before any write). */
  async recentPlayerIds(): Promise<string[]> {
    check(this.session !== null, `${this.label}: not signed in`);
    return readRecentPlayerIds(this.label, this.session);
  }

  async quickMatch(): Promise<string> {
    check(this.session !== null, `${this.label}: not signed in`);
    const response = await client.rpc(this.session, 'quick_match', {});
    const payload: unknown = response.payload;
    check(isRecord(payload) && typeof payload.matchId === 'string', `${this.label}: malformed quick_match response`);
    return payload.matchId;
  }

  /** Joins `matchId`; resolves false when the table rejected us as full. */
  async join(matchId: string): Promise<boolean> {
    const rejected = await this.joinWith(matchId);
    if (rejected === null) return true;
    if (rejected === 'table_full') return false;
    throw new E2eFailure(`${this.label}: joinMatch(${matchId}) failed: ${rejected}`);
  }

  /** Joins `matchId` with optional join metadata; resolves null on success, else the reject message. */
  async joinWith(matchId: string, metadata?: { [key: string]: string }): Promise<string | null> {
    check(this.socket !== null, `${this.label}: no socket`);
    try {
      await this.socket.joinMatch(matchId, undefined, metadata);
    } catch (error) {
      return isRecord(error) && typeof error.message === 'string' ? error.message : String(error);
    }
    this.matchId = matchId;
    return null;
  }

  /** Leaves the match on purpose (the socket stays up). */
  async leave(): Promise<void> {
    this.autoplay = false;
    const socket = this.socket;
    const matchId = this.matchId;
    if (socket === null || matchId === null) return;
    this.matchId = null;
    await socket.leaveMatch(matchId);
  }

  /** Drops the socket without leaving the match, like a lost connection. */
  drop(): void {
    this.autoplay = false;
    const socket = this.socket;
    if (socket === null) return;
    socket.onmatchdata = () => undefined;
    socket.disconnect(false);
    this.socket = null;
  }

  close(): void {
    this.drop();
  }

  private handleData(data: MatchData): void {
    try {
      if (data.op_code === OpCode.SNAPSHOT) this.handleSnapshot(parseJson(data.data));
      else if (data.op_code === OpCode.ERROR) this.handleError(parseJson(data.data));
      else if (data.op_code === OpCode.EMOTE_SHOWN) return;
      else throw new E2eFailure(`${this.label}: unexpected opcode ${data.op_code}`);
    } catch (error) {
      this.failure ??= error instanceof Error ? error : new Error(String(error));
    }
  }

  private handleSnapshot(raw: unknown): void {
    check(isSnapshot(raw), `${this.label}: malformed snapshot ${JSON.stringify(raw).slice(0, 2000)}`);
    assertPrivate(this.label, raw, raw);
    const lastSeq = this.events.length > 0 ? (this.events[this.events.length - 1]?.seq ?? 0) : 0;
    for (const entry of raw.log) {
      if (entry.seq > lastSeq) this.events.push(entry);
    }
    if (raw.seat === STANDING_SEAT) this.sawStanding = true;
    this.recordOpeningHand(raw);
    this.snapshot = raw;
    this.firstSnapshot ??= raw;
    this.snapshotCount++;
    this.onSnapshot?.(this, raw);
    if (this.autoplay) this.act(raw);
  }

  private recordOpeningHand(snapshot: Snapshot): void {
    const view = snapshot.view;
    if (view === null || view.phase !== 'playing' || view.round !== 1) return;
    const game = this.events.filter((entry) => entry.event.type === 'dealerDrawn').length;
    if (this.openingHands.has(game)) return;
    const hand = view.hand.map((card) => JSON.stringify(card)).sort();
    this.openingHands.set(game, `seat ${view.seat}: ${hand.join(' ')}`);
  }

  private handleError(raw: unknown): void {
    const code = parseErrorCode(raw);
    check(code !== null, `${this.label}: malformed error ${JSON.stringify(raw)}`);
    this.errors.push(code);
    check(!FATAL_ERRORS.has(code), `${this.label}: server rejected an intent with ${code}`);
    // A benign race (e.g. a bot played for us first): allow the same decision point to be retried.
    this.lastActionKey = null;
  }

  /** Acts on the latest snapshot now (snapshots only arrive on change, so it may already be our move). */
  poke(): void {
    if (this.autoplay && this.snapshot !== null) this.act(this.snapshot);
  }

  /** Plays for this seat when the snapshot says it is our move. */
  private act(snapshot: Snapshot): void {
    const view = snapshot.view;
    if (snapshot.phase !== 'playing' || view === null || this.matchId === null || this.socket === null) return;
    const lastSeq = this.events[this.events.length - 1]?.seq ?? 0;
    if (view.phase === 'cutting' && view.cut !== null && view.cut.seat === view.seat && view.cut.card !== null) {
      const key = `cut:${view.round}:${lastSeq}`;
      if (key === this.lastActionKey) return;
      this.lastActionKey = key;
      const intent: CutIntent = { keep: chooseCut(this.brain, view) };
      this.send(OpCode.CUT, intent);
      return;
    }
    if (view.phase === 'playing' && view.turn === view.seat && view.legalMoves.length > 0) {
      const key = `play:${view.round}:${view.stockCount}:${view.hand.length}`;
      if (key === this.lastActionKey) return;
      this.lastActionKey = key;
      const move = this.brain.chooseMove(view);
      const intent: PlayIntent = { cardId: move.cardId, capture: move.capture };
      this.playsSent++;
      this.send(OpCode.PLAY, intent);
    }
  }

  /** SIT (`{ seat }`) or START (no payload) on a private table. */
  sendRoomIntent(opCode: typeof OpCode.SIT | typeof OpCode.START, payload: SitIntent | null): void {
    check(this.socket !== null && this.matchId !== null, `${this.label}: not in a match`);
    this.send(opCode, payload);
  }

  private send(opCode: number, payload: IntentPayload): void {
    const socket = this.socket;
    const matchId = this.matchId;
    if (socket === null || matchId === null) return;
    socket.sendMatchState(matchId, opCode, payload === null ? '' : JSON.stringify(payload)).catch((error: unknown) => {
      // Sends racing a deliberate drop are expected; anything else is a failure.
      if (this.socket !== null) this.failure ??= new E2eFailure(`${this.label}: send failed: ${String(error)}`);
    });
  }
}

// ---------------------------------------------------------------------------
// Waiting helpers.

const players: Player[] = [];

function rethrowCallbackFailures(): void {
  for (const player of players) if (player.failure !== null) throw player.failure;
}

async function waitFor<T>(description: string, timeoutMs: number, probe: () => T | null | undefined | false): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    rethrowCallbackFailures();
    const result = probe();
    if (result !== null && result !== undefined && result !== false) return result;
    if (Date.now() > deadline) throw new E2eFailure(`timed out after ${timeoutMs} ms waiting for ${description}`);
    await sleep(100);
  }
}

/** Like `waitFor`, for probes that need a round trip (REST reads); polls every `intervalMs`. */
async function waitForAsync<T>(
  description: string,
  timeoutMs: number,
  probe: () => Promise<T | null | undefined | false>,
  intervalMs = 300,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    rethrowCallbackFailures();
    const result = await probe();
    if (result !== null && result !== undefined && result !== false) return result;
    if (Date.now() > deadline) throw new E2eFailure(`timed out after ${timeoutMs} ms waiting for ${description}`);
    await sleep(intervalMs);
  }
}

/** Runs a REST call that must succeed; a rejection fails the run with its HTTP status and body. */
async function expectOk<T>(owner: string, what: string, call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (!isFetchResponse(error)) throw new E2eFailure(`${owner}: ${what} failed: ${String(error)}`);
    const body: unknown = await error.json().catch(() => null);
    throw new E2eFailure(`${owner}: ${what} failed with ${error.status} ${JSON.stringify(body)}`);
  }
}

/** Runs a REST call whose rejection is an expected outcome: 200 `{}` on success, else its status and error body. */
async function outcomeOf(owner: string, what: string, call: () => Promise<unknown>): Promise<HttpOutcome> {
  try {
    await call();
    return { status: HTTP_OK, body: {} };
  } catch (error) {
    if (!isFetchResponse(error)) throw new E2eFailure(`${owner}: ${what} failed: ${String(error)}`);
    const body: unknown = await error.json().catch(() => null);
    return { status: error.status, body };
  }
}

/**
 * Flattens `social/recent_players` into the listed user ids. Every entry must
 * carry a string `userId`: bots have none, so a bot in the record fails here.
 * nakama-js parses `value`, but accept a JSON string too.
 */
function recentIdsOf(owner: string, objects: readonly StorageObject[] | undefined): string[] {
  const ids: string[] = [];
  for (const object of objects ?? []) {
    if (object.collection !== SOCIAL_COLLECTION || object.key !== RECENT_PLAYERS_KEY) continue;
    check(object.permission_write === undefined || object.permission_write === 0, `${owner}: recent_players is client-writable`);
    const value: unknown = typeof object.value === 'string' ? JSON.parse(object.value) : object.value;
    check(isRecord(value) && Array.isArray(value.tables), `${owner}: malformed recent_players ${JSON.stringify(value)}`);
    for (const table of value.tables) {
      check(isRecord(table) && isInt(table.endedAt) && Array.isArray(table.players), `${owner}: malformed recent table ${JSON.stringify(table)}`);
      for (const entry of table.players) {
        check(isRecord(entry) && typeof entry.userId === 'string' && entry.userId !== '', `${owner}: recent entry without a userId ${JSON.stringify(entry)}`);
        ids.push(entry.userId);
      }
    }
  }
  return ids;
}

async function readRecentPlayerIds(owner: string, session: Session): Promise<string[]> {
  const result = await expectOk(owner, 'readStorageObjects', () =>
    client.readStorageObjects(session, {
      object_ids: [{ collection: SOCIAL_COLLECTION, key: RECENT_PLAYERS_KEY, user_id: session.user_id }],
    }),
  );
  return recentIdsOf(owner, result.objects);
}

/** Waits for `player`'s record to list `otherId`, then checks it lists only known humans and never the owner. */
async function expectRecentPlayers(player: Player, otherId: string, humanIds: ReadonlySet<string>): Promise<string[]> {
  const ids = await waitForAsync(`${player.label}'s recent_players to list ${otherId}`, 10_000, async () => {
    const listed = await player.recentPlayerIds();
    return listed.includes(otherId) ? listed : null;
  });
  for (const id of ids) {
    check(id !== player.userId, `${player.label}: recent_players lists its owner`);
    check(humanIds.has(id), `${player.label}: recent_players lists ${id}, not one of the humans at the table`);
  }
  return ids;
}

type EventOf<K extends GameEvent['type']> = Extract<GameEvent, { type: K }>;

function isEventOf<K extends GameEvent['type']>(event: GameEvent, type: K): event is EventOf<K> {
  return event.type === type;
}

function eventsOf<K extends GameEvent['type']>(player: Player, type: K): EventOf<K>[] {
  const found: EventOf<K>[] = [];
  for (const entry of player.events) if (isEventOf(entry.event, type)) found.push(entry.event);
  return found;
}

function seatActed(player: Player, seat: number, afterSeq: number): boolean {
  return player.events.some(
    (entry) =>
      entry.seq > afterSeq &&
      ((entry.event.type === 'cardPlayed' && entry.event.seat === seat) ||
        (entry.event.type === 'cutResolved' && entry.event.seat === seat)),
  );
}

function playsBy(player: Player, seat: number, afterSeq: number): number {
  return player.events.filter((e) => e.seq > afterSeq && e.event.type === 'cardPlayed' && e.event.seat === seat).length;
}

function lastSeqOf(player: Player): number {
  return player.events[player.events.length - 1]?.seq ?? 0;
}

function describePlayers(snapshot: Snapshot): string {
  return snapshot.players.map((p, i) => `${i}:${p === null ? '-' : p.isBot ? 'bot' : p.name}`).join(' ');
}

// ---------------------------------------------------------------------------
// Scenario 1: quick match.

const startedAt = Date.now();

async function quickMatchInto(player: Player, wanted: string): Promise<void> {
  for (let attempt = 1; attempt <= QUICK_MATCH_ATTEMPTS; attempt++) {
    const matchId = await player.quickMatch();
    if (matchId === wanted && (await player.join(matchId))) return;
    log(`${player.label}: quick_match attempt ${attempt} gave ${matchId === wanted ? 'table_full' : `another table ${matchId}`}; retrying`);
    await sleep(1000);
  }
  throw new E2eFailure(`${player.label}: could not quick-match into ${wanted} after ${QUICK_MATCH_ATTEMPTS} attempts`);
}

function describeScores(view: PlayerView): string {
  return `${view.scores[0] ?? '?'}-${view.scores[1] ?? '?'}`;
}

async function runQuickMatch(): Promise<string[]> {
  const scenarioStart = Date.now();
  // Fresh device ids per run: new accounts, so no rename cooldown carries over.
  const runId = `e2e-${Date.now()}`;
  const a = new Player('A', `${runId}-a`);
  const b = new Player('B', `${runId}-b`);
  players.push(a, b);
  // A short per-run tag keeps the names recognisable and within 3-16 letters/digits/spaces.
  // Digits only, so the tag can never spell a blocked word.
  const tag = String(Date.now()).slice(-4);
  const aName = `E2E Alpha ${tag}`;
  const bName = `E2E Beta ${tag}`;
  const bRenamed = `E2E Beta2 ${tag}`;

  // 1. Distinct fresh guests.
  await a.connect();
  await b.connect();
  check(a.userId !== '' && b.userId !== '' && a.userId !== b.userId, 'A and B must be distinct users');
  log(`signed in A=${a.userId} B=${b.userId}`);

  // 1b. Names: rejected names are judged before the cooldown and record nothing, then each picks a name (first pick).
  expectNameRejected('A', await a.rename('ab'), HTTP_BAD_REQUEST, GRPC_INVALID_ARGUMENT, 'name_too_short');
  expectNameRejected('A', await a.rename(`Hitler ${tag}`), HTTP_BAD_REQUEST, GRPC_INVALID_ARGUMENT, 'name_not_allowed');
  log('A: "ab" rejected with 400 name_too_short, a profane name with 400 name_not_allowed');
  expectNameAccepted('A', aName, await a.rename(aName));
  expectNameAccepted('B', bName, await b.rename(bName));
  log(`names picked: A="${aName}" B="${bName}"`);

  // 2. Same table, different seats.
  const matchId = await a.quickMatch();
  check(await a.join(matchId), `A: table ${matchId} was full on creation`);
  await waitFor('A first snapshot', 5000, () => a.snapshot);
  await sleep(1500); // let Nakama index the table label for B's quick_match
  await quickMatchInto(b, matchId);
  await waitFor('B first snapshot', 5000, () => b.snapshot);
  check(a.seat !== b.seat, `A and B share seat ${a.seat}`);
  log(`match ${matchId}: A seat ${a.seat}, B seat ${b.seat}`);

  // 3. Backfill: two bots and the game starts.
  const started = await waitFor('bot backfill and game start', BACKFILL_TIMEOUT_MS, () => {
    const s = a.snapshot;
    return s !== null && s.phase !== 'waiting' && s.view !== null ? s : null;
  });
  const bots = started.players.filter((p) => p !== null && p.isBot).length;
  const humans = started.players.filter((p) => p !== null && !p.isBot).length;
  check(bots === 2 && humans === 2, `expected 2 bots + 2 humans, got ${bots} bots + ${humans} humans`);
  log(`game started: ${started.players.map((p, i) => `${i}:${p?.isBot ? 'bot' : p?.name ?? '-'}`).join(' ')}`);

  // 3b. Each human sees the other's picked name (and its own) in the snapshot.
  for (const [viewer, seat, name] of [
    [a, b.seat, bName],
    [b, a.seat, aName],
    [a, a.seat, aName],
    [b, b.seat, bName],
  ] as const) {
    await waitFor(`${viewer.label} to see "${name}" at seat ${seat}`, 5000, () => viewer.snapshot?.players[seat]?.name === name);
  }
  log(`A sees B as "${bName}", B sees A as "${aName}"`);

  // 4. Both humans play.
  let roundsLogged = 0;
  const reportRounds = (player: Player): void => {
    if (player !== a) return;
    const ended = eventsOf(a, 'roundEnded');
    while (roundsLogged < ended.length) {
      const event = ended[roundsLogged];
      roundsLogged++;
      if (event) log(`round ${roundsLogged} ended: scores ${event.scores[0]}-${event.scores[1]}`);
    }
  };
  a.onSnapshot = reportRounds;
  a.autoplay = true;
  b.autoplay = true;
  a.poke();
  b.poke();

  // 5. Drop B mid round 1, a bot covers, B comes back to the same seat.
  const bSeat = b.seat;
  await waitFor(`${PLAYS_BEFORE_DROP} plays in round 1`, 60_000, () => {
    const view = a.snapshot?.view;
    return a.snapshot?.phase === 'playing' && view?.phase === 'playing' && eventsOf(a, 'cardPlayed').length >= PLAYS_BEFORE_DROP;
  });
  // B's first rename after the pick is allowed straight away; the table picks it up when B reclaims the seat.
  expectNameAccepted('B', bRenamed, await b.rename(bRenamed));
  log(`B renamed "${bName}" -> "${bRenamed}" (second change, allowed)`);
  // Taken after the rename's round trip, so B's own plays during it don't count as the bot covering.
  const roundAtDrop = a.snapshot?.view?.round ?? 0;
  const seqAtDrop = a.events[a.events.length - 1]?.seq ?? 0;
  b.drop();
  log(`dropped B's socket in round ${roundAtDrop} after ${eventsOf(a, 'cardPlayed').length} plays`);
  await waitFor(`A to see seat ${bSeat} disconnected`, 10_000, () => a.snapshot?.players[bSeat]?.connected === false);
  log(`A sees seat ${bSeat} connected:false`);
  await waitFor(`a bot to act for seat ${bSeat}`, 45_000, () => seatActed(a, bSeat, seqAtDrop));
  log(`a bot acted for seat ${bSeat} while B was away`);

  const b2 = new Player('B2', b.deviceId);
  players.push(b2);
  await b2.connect();
  check(b2.userId === b.userId, `B reconnected as a different user (${b2.userId} != ${b.userId})`);
  check(await b2.join(matchId), `B could not rejoin ${matchId}: table_full`);
  const resumed = await waitFor('B first snapshot after rejoin', 5000, () => b2.firstSnapshot);
  check(resumed.seat === bSeat, `B rejoined at seat ${resumed.seat}, expected ${bSeat}`);
  check(resumed.view !== null, 'B rejoin snapshot has no view');
  check(resumed.log[0]?.seq === 1, `B rejoin snapshot is not a full log (first seq ${String(resumed.log[0]?.seq)})`);
  await waitFor(`A to see seat ${bSeat} connected again`, 10_000, () => a.snapshot?.players[bSeat]?.connected === true);
  log(`B rejoined seat ${bSeat} with a full snapshot (${resumed.log.length} log entries); A sees connected:true`);
  b2.autoplay = true;
  b2.poke();

  // 5b. The reclaimed seat carries B's new name; a third change within the hour is rate-limited.
  await waitFor(`A to see "${bRenamed}" at seat ${bSeat}`, 10_000, () => a.snapshot?.players[bSeat]?.name === bRenamed);
  await waitFor(`B2 to see "${bRenamed}" at its own seat`, 10_000, () => b2.snapshot?.players[bSeat]?.name === bRenamed);
  log(`after reconnect A sees seat ${bSeat} as "${bRenamed}"`);
  expectNameRejected('B2', await b2.rename(`E2E Beta3 ${tag}`), HTTP_TOO_MANY_REQUESTS, GRPC_RESOURCE_EXHAUSTED, 'name_rate_limited');
  log('B2: third name change within the hour rejected with 429 name_rate_limited');

  // 6. Play to the end.
  const remaining = QUICK_BUDGET_MS - (Date.now() - scenarioStart);
  await waitFor('the game to finish', remaining, () => a.snapshot?.phase === 'finished' && b2.snapshot?.phase === 'finished');
  for (const p of [a, b2]) {
    const ended = eventsOf(p, 'gameEnded');
    check(ended.length === 1, `${p.label}: expected one gameEnded event, saw ${ended.length}`);
    check(p.snapshot?.view?.winner !== null && p.snapshot?.view?.winner !== undefined, `${p.label}: finished without a winner`);
  }
  const final = eventsOf(a, 'gameEnded')[0];
  check(final !== undefined, 'A: no gameEnded event');
  const finalView = a.snapshot?.view;
  check(finalView !== null && finalView !== undefined, 'A: no final view');
  const myTeam = a.seat % 2;
  const fatal = [...a.errors, ...b.errors, ...b2.errors];

  // 7. Recent players: each human's record lists the other human, and only humans (bots carry no userId).
  const humanIds: ReadonlySet<string> = new Set([a.userId, b.userId]);
  const aRecent = await expectRecentPlayers(a, b.userId, humanIds);
  const bRecent = await expectRecentPlayers(b2, a.userId, humanIds);
  log(`recent players: A lists ${aRecent.length} entr${aRecent.length === 1 ? 'y' : 'ies'} (B), B lists ${bRecent.length} (A); no bots`);

  for (const p of [a, b, b2]) p.close();
  return [
    'quick match: PASSED',
    `  match:    ${matchId}`,
    `  seats:    A=${a.seat} B=${bSeat} (B rejoined same seat), bots=${bots}`,
    `  names:    A="${aName}" B="${bName}" -> "${bRenamed}" (seen by A after reconnect); 400/429 rejections checked`,
    `  recent:   A and B list each other, no bots`,
    `  rounds:   ${eventsOf(a, 'roundEnded').length}`,
    `  result:   team ${final.winner} won ${describeScores(finalView)} (A is team ${myTeam})`,
    `  plays:    ${eventsOf(a, 'cardPlayed').length}, snapshots A=${a.snapshotCount} B=${b.snapshotCount + b2.snapshotCount}`,
    `  errors:   ${fatal.length === 0 ? 'none' : fatal.join(', ')}`,
    `  duration: ${seconds(Date.now() - scenarioStart)}`,
  ];
}

/**
 * A short quick match: B leaves right after the deal (socket still up) and its
 * record is written at once, listing A; A, still seated, has none until A
 * leaves too. Nobody plays: the game only has to be under way.
 */
async function runLeaverGame(): Promise<string[]> {
  const scenarioStart = Date.now();
  const runId = `e2e-leave-${Date.now()}`;
  const a = new Player('LA', `${runId}-a`);
  const b = new Player('LB', `${runId}-b`);
  players.push(a, b);
  await a.connect();
  await b.connect();
  check(a.userId !== b.userId, 'leaver: A and B must be distinct users');

  const matchId = await a.quickMatch();
  check(await a.join(matchId), `LA: table ${matchId} was full on creation`);
  await waitFor('LA first snapshot', 5000, () => a.snapshot);
  await sleep(1500); // let Nakama index the table label for B's quick_match
  await quickMatchInto(b, matchId);
  await waitFor('LB first snapshot', 5000, () => b.snapshot);
  await waitFor('the leaver game to start', BACKFILL_TIMEOUT_MS, () => {
    const s = a.snapshot;
    return s !== null && s.phase !== 'waiting' && s.view !== null;
  });
  log(`leaver: game started on ${matchId} (LA seat ${a.seat}, LB seat ${b.seat})`);
  check((await b.recentPlayerIds()).length === 0, 'LB: has a recent_players record before leaving');

  await b.leave();
  const leftAt = Date.now();
  const humanIds: ReadonlySet<string> = new Set([a.userId, b.userId]);
  await expectRecentPlayers(b, a.userId, humanIds);
  const bWrittenAfter = Date.now() - leftAt;
  check((await a.recentPlayerIds()).length === 0, 'LA: has a recent_players record while still seated');
  log(`leaver: LB's record lists LA ${seconds(bWrittenAfter)} after leaving; LA, still seated, has none`);

  await a.leave();
  await expectRecentPlayers(a, b.userId, humanIds);
  log("leaver: after LA left, LA's record lists LB");
  for (const p of [a, b]) p.close();
  return [
    'leaver game: PASSED',
    `  match:    ${matchId}`,
    `  records:  LB written ${seconds(bWrittenAfter)} after leaving mid-game; LA only after its own leave; no bots`,
    `  duration: ${seconds(Date.now() - scenarioStart)}`,
  ];
}

// ---------------------------------------------------------------------------
// Scenario 2: private table.

interface CreatedTable {
  readonly matchId: string;
  readonly code: string;
}

function parseCreated(outcome: HttpOutcome): CreatedTable {
  const body = outcome.body;
  check(outcome.status === HTTP_OK, `create_private_table failed: ${outcome.status} ${JSON.stringify(body)}`);
  check(
    isRecord(body) && typeof body.matchId === 'string' && typeof body.code === 'string' && isRoomCode(body.code),
    `create_private_table: malformed response ${JSON.stringify(body)}`,
  );
  return { matchId: body.matchId, code: body.code };
}

function parseFound(owner: string, outcome: HttpOutcome): string {
  const body = outcome.body;
  check(outcome.status === HTTP_OK, `${owner}: join_by_code failed: ${outcome.status} ${JSON.stringify(body)}`);
  check(isRecord(body) && typeof body.matchId === 'string', `${owner}: join_by_code malformed response ${JSON.stringify(body)}`);
  return body.matchId;
}

function codeMetadata(code: string): { [key: string]: string } {
  return { [ROOM_JOIN_CODE_KEY]: code };
}

function own(player: Player): RoomMember {
  const room = player.room;
  const member = room.members[room.you];
  check(member !== undefined, `${player.label}: no own member entry`);
  return member;
}

/** 10 bad codes are refused with 400; the 11th lookup (even a valid code) is rate-limited with 429. */
async function checkLookupRateLimit(d: Player, validCode: string): Promise<void> {
  for (let i = 1; i <= LOOKUP_FAILURE_LIMIT; i++) {
    expectRoomRejected(`D lookup ${i}`, await d.rpc('join_by_code', { code: `bad-${i}` }), HTTP_BAD_REQUEST, GRPC_INVALID_ARGUMENT, 'room_bad_code');
  }
  expectRoomRejected('D lookup 11', await d.rpc('join_by_code', { code: validCode }), HTTP_TOO_MANY_REQUESTS, GRPC_RESOURCE_EXHAUSTED, 'room_rate_limited');
  log(`D: ${LOOKUP_FAILURE_LIMIT} bad codes refused with 400 room_bad_code, the 11th lookup (a live code) with 429 room_rate_limited`);
}

async function runPrivate(full: boolean): Promise<string[]> {
  const scenarioStart = Date.now();
  const deadline = scenarioStart + PRIVATE_BUDGET_MS;
  const runId = `e2e-priv-${Date.now()}`;
  const a = new Player('PA', `${runId}-a`);
  const b = new Player('PB', `${runId}-b`);
  const c = new Player('PC', `${runId}-c`);
  const d = new Player('PD', `${runId}-d`);
  players.push(a, b, c, d);
  const tag = String(Date.now()).slice(-4);
  const aName = `E2E Host ${tag}`;
  const bName = `E2E Mate ${tag}`;
  const cName = `E2E Late ${tag}`;

  for (const p of [a, b, c, d]) await p.connect();
  check(new Set([a.userId, b.userId, c.userId, d.userId]).size === 4, 'private: users must be distinct');
  for (const [p, name] of [
    [a, aName],
    [b, bName],
    [c, cName],
  ] as const) {
    expectNameAccepted(p.label, name, await p.rename(name));
  }
  log(`private: signed in PA="${aName}" PB="${bName}" PC="${cName}" PD`);

  // 1. A creates the table and joins with its code: seat 0, host, waiting.
  const { matchId, code } = parseCreated(await a.rpc('create_private_table', {}));
  log(`private: created ${matchId}`);
  const aJoin = await a.joinWith(matchId, codeMetadata(code));
  check(aJoin === null, `PA: join with the code refused: ${String(aJoin)}`);
  await waitFor('PA first room snapshot', 5000, () => a.snapshot?.room !== undefined);
  check(a.snapshot?.phase === 'waiting', `PA: expected phase waiting, got ${String(a.snapshot?.phase)}`);
  check(a.room.code === code, 'PA: room code differs from the created one');
  check(a.seat === 0 && own(a).isHost, `PA: expected seat 0 as host, got seat ${a.seat} host ${String(own(a).isHost)}`);
  check(a.snapshot?.backfillAt === null, 'PA: a private table must not schedule a backfill');

  // 2. B resolves the code (typed lowercase with a dash) and joins: seat 1, not host.
  const typed = `${code.slice(0, 3).toLowerCase()}-${code.slice(3).toLowerCase()}`;
  const bFound = parseFound('PB', await b.rpc('join_by_code', { code: typed }));
  check(bFound === matchId, `PB: join_by_code gave ${bFound}, expected ${matchId}`);
  const bJoin = await b.joinWith(matchId, codeMetadata(code));
  check(bJoin === null, `PB: join with the code refused: ${String(bJoin)}`);
  await waitFor('PB first room snapshot', 5000, () => b.snapshot?.room !== undefined);
  check(b.seat === 1 && !own(b).isHost, `PB: expected seat 1 not host, got seat ${b.seat} host ${String(own(b).isHost)}`);
  await waitFor(`PA to see "${bName}" at seat 1`, 5000, () => a.snapshot?.players[1]?.name === bName && a.room.members.length === 2);
  log(`private: PA seat 0 (host), PB seat 1 via "${typed}"; both snapshots carry room`);

  // 3. The match id alone is not enough: no code and a wrong code are both refused as room_not_found.
  const noCode = await c.joinWith(matchId);
  check(noCode === 'room_not_found', `PC: join without a code gave ${String(noCode)}, expected room_not_found`);
  const wrong = code === 'AAAAAA' ? 'BBBBBB' : 'AAAAAA';
  const wrongCode = await c.joinWith(matchId, codeMetadata(wrong));
  check(wrongCode === 'room_not_found', `PC: join with a wrong code gave ${String(wrongCode)}, expected room_not_found`);
  check(c.matchId === null && c.snapshot === null, 'PC: got into the table without the code');
  log('private: a newcomer with the match id but no code (or a wrong one) is refused with room_not_found');

  // 4. B switches to seat 2 (A's partner).
  b.sendRoomIntent(OpCode.SIT, { seat: 2 });
  await waitFor('PB to sit at seat 2', 5000, () => b.snapshot?.seat === 2 && b.snapshot.players[1] === null);
  await waitFor('PA to see PB at seat 2', 5000, () => a.snapshot?.players[2]?.name === bName && a.snapshot.players[1] === null);
  log('private: PB switched to seat 2');

  // 5. A leaves the waiting room: B becomes host; A rejoins with the code as a member and auto-sits.
  await a.leave();
  await waitFor('PB to become host after PA left', 5000, () => {
    const s = b.snapshot;
    return s?.room !== undefined && s.room.members.length === 1 && own(b).isHost && s.players[0] === null;
  });
  log('private: PA left the waiting room; PB is host, seat 0 is free');
  const aCount = a.snapshotCount;
  const aRejoin = await a.joinWith(matchId, codeMetadata(code));
  check(aRejoin === null, `PA: rejoin with the code refused: ${String(aRejoin)}`);
  await waitFor('PA snapshot after rejoining', 5000, () => a.snapshotCount > aCount && a.snapshot?.room?.members.length === 2);
  check(a.seat === 0 && !own(a).isHost, `PA: rejoined at seat ${a.seat} host ${String(own(a).isHost)}, expected seat 0 not host`);
  check(a.room.members[0]?.name === bName && a.room.members[1]?.name === aName, 'PA: members not in join order (PB, PA)');
  log('private: PA rejoined as a member, auto-sat at seat 0, PB stays host');

  // 6. A non-host START is refused; the host's START fills seats 1 and 3 with bots and deals.
  a.sendRoomIntent(OpCode.START, null);
  await waitFor('PA to get not_host', 5000, () => a.errors.includes('not_host'));
  check(a.snapshot?.phase === 'waiting', 'PA: a non-host START changed the phase');
  b.sendRoomIntent(OpCode.START, null);
  const started = await waitFor('the private game to start', 10_000, () => {
    const s = a.snapshot;
    return s !== null && s.phase === 'playing' && s.view !== null ? s : null;
  });
  check(
    started.players[1]?.isBot === true && started.players[3]?.isBot === true && started.players[0]?.isBot === false && started.players[2]?.isBot === false,
    `private: expected humans at 0+2 and bots at 1+3, got ${describePlayers(started)}`,
  );
  check(a.room.scores !== null, 'PA: room.scores is null during a game');
  log(`private: PB started the game (${started.view?.phase}): ${describePlayers(started)}`);
  a.autoplay = true;
  b.autoplay = true;
  a.poke();
  b.poke();

  // 7. C joins by code mid-game: standing, no view, scores in room.
  await waitFor('a few plays before PC arrives', 60_000, () => eventsOf(a, 'cardPlayed').length >= 2);
  const cFound = parseFound('PC', await c.rpc('join_by_code', { code }));
  check(cFound === matchId, `PC: join_by_code gave ${cFound}, expected ${matchId}`);
  const cJoin = await c.joinWith(matchId, codeMetadata(code));
  check(cJoin === null, `PC: join with the code refused: ${String(cJoin)}`);
  const standing = await waitFor('PC standing snapshot', 5000, () => c.snapshot);
  check(standing.seat === STANDING_SEAT, `PC: expected seat -1, got ${standing.seat}`);
  check(standing.view === null, 'PC: standing member got a view');
  check(standing.phase !== 'waiting', `PC: expected an in-game phase, got ${standing.phase}`);
  check(standing.room?.scores !== null && standing.room?.scores !== undefined, 'PC: standing snapshot has no room scores');
  check(standing.log.length > 0, 'PC: standing snapshot has no public log');
  log(`private: PC joined mid-game standing (seat -1, view null, scores ${standing.room.scores.join('-')}, ${standing.log.length} log entries)`);

  // 8. C takes over a bot seat and plays its turns.
  const cSeat = standing.players.findIndex((p) => p !== null && p.isBot);
  check(cSeat >= 0, 'PC: no bot seat to take over');
  const seqAtTakeover = lastSeqOf(a);
  c.autoplay = true;
  c.sendRoomIntent(OpCode.SIT, { seat: cSeat });
  await waitFor(`PC to take over seat ${cSeat}`, 5000, () => c.snapshot?.seat === cSeat && c.snapshot.view !== null);
  check(c.sawStanding, 'PC: never saw a standing snapshot');
  await waitFor(`PA to see "${cName}" at seat ${cSeat}`, 5000, () => {
    const p = a.snapshot?.players[cSeat];
    return p !== null && p !== undefined && !p.isBot && p.name === cName;
  });
  c.poke();
  log(`private: PC took over bot seat ${cSeat}`);
  await waitFor(`PC to play ${TAKEOVER_PLAYS} turns`, 120_000, () => c.playsSent >= TAKEOVER_PLAYS && playsBy(a, cSeat, seqAtTakeover) >= TAKEOVER_PLAYS);
  log(`private: PC played ${c.playsSent} cards from seat ${cSeat}`);

  const extra: string[] = [];
  if (full) extra.push(...(await playPrivateToEnd(a, b, c, cSeat, code, deadline)));

  // 9. Everyone leaves; the code stays live until the empty table closes, then 404.
  for (const p of [a, b, c]) await p.leave();
  const leftAt = Date.now();
  check(parseFound('PA', await a.rpc('join_by_code', { code })) === matchId, 'PA: code stopped resolving right after everyone left');
  log('private: everyone left; the code still resolves while the empty table waits to close');
  const rateLimit = checkLookupRateLimit(d, code);
  await sleep(EMPTY_TIMEOUT_MS - 2000);
  let dead: number | null = null;
  while (dead === null) {
    rethrowCallbackFailures();
    const outcome = await a.rpc('join_by_code', { code });
    if (outcome.status === HTTP_OK) {
      check(Date.now() - leftAt < EMPTY_TIMEOUT_MS + 40_000, 'PA: code still resolves 40 s after the empty timeout');
      await sleep(2000);
      continue;
    }
    expectRoomRejected('PA', outcome, HTTP_NOT_FOUND, GRPC_NOT_FOUND, 'room_not_found');
    dead = Date.now() - leftAt;
  }
  check(dead >= EMPTY_TIMEOUT_MS - 3000, `PA: code died after ${seconds(dead)}, before the ${seconds(EMPTY_TIMEOUT_MS)} empty timeout`);
  log(`private: code returns 404 room_not_found ${seconds(dead)} after everyone left`);
  await rateLimit;

  const fatal = [...a.errors, ...b.errors, ...c.errors];
  for (const p of [a, b, c, d]) p.close();
  return [
    `private table${full ? ' (--full)' : ''}: PASSED`,
    `  match:    ${matchId}`,
    `  seats:    PA=0 PB=2 (switched from 1), PC took over bot seat ${cSeat}`,
    `  plays:    ${eventsOf(a, 'cardPlayed').length} seen by PA, PC sent ${c.playsSent}`,
    ...extra,
    `  closed:   code 404 ${seconds(dead)} after everyone left`,
    `  errors:   ${fatal.length === 0 ? 'none' : fatal.join(', ')} (not_host expected once)`,
    `  duration: ${seconds(Date.now() - scenarioStart)}`,
  ];
}

/** --full: the private game to its end, the return to the room, and a second game with a new deal. */
async function playPrivateToEnd(a: Player, b: Player, c: Player, cSeat: number, code: string, deadline: number): Promise<string[]> {
  let roundsLogged = 0;
  a.onSnapshot = () => {
    const ended = eventsOf(a, 'roundEnded');
    while (roundsLogged < ended.length) {
      const event = ended[roundsLogged];
      roundsLogged++;
      if (event) log(`private: round ${roundsLogged} ended: scores ${event.scores[0]}-${event.scores[1]}`);
    }
  };
  const gameStart = Date.now();
  await waitFor('the private game to finish', deadline - Date.now() - 3 * 60_000, () =>
    [a, b, c].every((p) => p.snapshot?.phase === 'finished'),
  );
  const finishedAt = Date.now();
  a.onSnapshot = null;
  const ended = eventsOf(a, 'gameEnded');
  check(ended.length === 1, `PA: expected one gameEnded event, saw ${ended.length}`);
  const final = ended[0];
  check(final !== undefined, 'PA: no gameEnded event');
  const resetAt = a.room.resetAt;
  check(resetAt !== null, 'PA: finished private snapshot has no resetAt');
  log(`private: game over after ${seconds(finishedAt - gameStart)}, team ${final.winner} won ${final.scores[0]}-${final.scores[1]}`);

  // Back to the room after ROOM_RESET_MS: humans keep seats, the bot seat is empty, same code and host.
  await waitFor('the return to the room', ROOM_RESET_MS + 10_000, () => [a, b, c].every((p) => p.snapshot?.phase === 'waiting'));
  const resetDelay = Date.now() - finishedAt;
  check(resetDelay >= ROOM_RESET_MS - 2000, `private: returned to the room after ${seconds(resetDelay)}, before ROOM_RESET_MS`);
  const waiting = a.snapshot;
  check(waiting !== null, 'PA: no snapshot after the reset');
  const botSeatLeft = cSeat === 1 ? 3 : 1;
  check(a.room.code === code, 'PA: room code changed on reset');
  check(a.seat === 0 && b.seat === 2 && c.seat === cSeat, `private: seats after reset PA=${a.seat} PB=${b.seat} PC=${c.seat}`);
  check(waiting.players[botSeatLeft] === null, `private: bot seat ${botSeatLeft} not emptied: ${describePlayers(waiting)}`);
  check(waiting.players.every((p) => p === null || !p.isBot), `private: a bot survived the reset: ${describePlayers(waiting)}`);
  check(waiting.view === null && a.room.scores === null && a.room.resetAt === null, 'PA: waiting room still carries game data');
  check(own(b).isHost, 'PB: lost host on reset');
  log(`private: back in the room ${seconds(resetDelay)} after game over: ${describePlayers(waiting)}`);

  // Second game: the host starts again and it deals differently.
  const firstDeal = a.openingHands.get(1);
  const firstDraw = JSON.stringify(eventsOf(a, 'dealerDrawn')[0]?.draws);
  const playsBefore = eventsOf(a, 'cardPlayed').length;
  b.autoplay = true;
  a.autoplay = true;
  c.autoplay = true;
  b.sendRoomIntent(OpCode.START, null);
  const second = await waitFor('the second game to deal', 30_000, () => {
    const s = a.snapshot;
    return s?.phase === 'playing' && a.openingHands.has(2) ? s : null;
  });
  check(eventsOf(a, 'dealerDrawn').length === 2, 'PA: expected a second dealerDrawn event');
  const secondDeal = a.openingHands.get(2);
  const secondDraw = JSON.stringify(eventsOf(a, 'dealerDrawn')[1]?.draws);
  check(firstDeal !== undefined && secondDeal !== undefined, 'PA: missing an opening hand');
  check(firstDeal !== secondDeal || firstDraw !== secondDraw, 'private: the second game dealt exactly like the first');
  check(second.players[botSeatLeft]?.isBot === true, `private: second game did not fill seat ${botSeatLeft} with a bot`);
  await waitFor('a few plays in the second game', 60_000, () => eventsOf(a, 'cardPlayed').length >= playsBefore + 4);
  log(`private: second game started with a different deal (PA ${firstDeal} -> ${secondDeal})`);
  return [
    `  game 1:   ${roundsLogged} rounds, team ${final.winner} won ${final.scores[0]}-${final.scores[1]} in ${seconds(finishedAt - gameStart)}`,
    `  reset:    back to the room after ${seconds(resetDelay)}, seats kept, bot seat ${botSeatLeft} emptied`,
    `  game 2:   started by the host with a different deal`,
  ];
}

// ---------------------------------------------------------------------------
// Scenario 3: friends.

/** Social sockets accept 4096-byte messages; the app follows at most 50 ids per call. */
const FOLLOW_CHUNK = 50;
/** How long to wait before concluding that a dropped request sent no notification. */
const QUIET_MS = 2000;

/** A guest with a REST session and an optional social socket (status on), as the app's SocialSocket uses. */
class SocialUser {
  readonly label: string;
  readonly deviceId: string;
  private sessionValue: Session | null = null;
  private socket: Socket | null = null;
  /** Every notification pushed over the social socket. */
  readonly socketNotifications: Notification[] = [];
  /** Every status presence event received, own sessions included. */
  readonly statusEvents: StatusPresenceEvent[] = [];

  constructor(label: string, deviceId: string) {
    this.label = label;
    this.deviceId = deviceId;
  }

  get session(): Session {
    check(this.sessionValue !== null, `${this.label}: not signed in`);
    return this.sessionValue;
  }

  get userId(): string {
    return this.session.user_id ?? '';
  }

  /** The username, which the server makes the player's friend code. */
  get friendCode(): string {
    return this.session.username ?? '';
  }

  async signIn(): Promise<void> {
    this.sessionValue = await client.authenticateDevice(this.deviceId, true);
  }

  /** Calls an RPC; success resolves `{ status: 200, body: payload }`, a rejection its status and error body. */
  async rpc(id: string, payload: object): Promise<HttpOutcome> {
    try {
      const response = await client.rpc(this.session, id, payload);
      return { status: HTTP_OK, body: response.payload ?? null };
    } catch (error) {
      if (!isFetchResponse(error)) throw new E2eFailure(`${this.label}: ${id} failed: ${String(error)}`);
      const body: unknown = await error.json().catch(() => null);
      return { status: error.status, body };
    }
  }

  /** Connects a socket that shows the user online (`createStatus` true) and records pushes. */
  async connectSocial(): Promise<void> {
    const socket = client.createSocket(false, false);
    socket.onnotification = (notification: Notification) => this.socketNotifications.push(notification);
    socket.onstatuspresence = (event: StatusPresenceEvent) => this.statusEvents.push(event);
    socket.ondisconnect = () => undefined;
    await socket.connect(this.session, true);
    this.socket = socket;
  }

  /** Sets the display name through the account API (the same call `beforeUpdateAccount` screens). */
  async rename(displayName: string): Promise<HttpOutcome> {
    try {
      await client.updateAccount(this.session, { display_name: displayName });
      return { status: HTTP_OK, body: null };
    } catch (error) {
      if (!isFetchResponse(error)) throw new E2eFailure(`${this.label}: updateAccount failed: ${String(error)}`);
      const body: unknown = await error.json().catch(() => null);
      return { status: error.status, body };
    }
  }

  addFriends(ids: readonly string[], usernames: readonly string[] = []): Promise<HttpOutcome> {
    return outcomeOf(this.label, 'addFriends', () => client.addFriends(this.session, [...ids], [...usernames]));
  }

  async deleteFriend(userId: string): Promise<void> {
    await expectOk(this.label, 'deleteFriends', () => client.deleteFriends(this.session, [userId]));
  }

  async block(userId: string): Promise<void> {
    await expectOk(this.label, 'blockFriends', () => client.blockFriends(this.session, [userId]));
  }

  /** Every edge as `userId -> state` (one page of 100 is plenty here). */
  async friendStates(): Promise<Map<string, number>> {
    const result = await expectOk(this.label, 'listFriends', () => client.listFriends(this.session, undefined, 100));
    const states = new Map<string, number>();
    for (const friend of result.friends ?? []) {
      const id = friend.user?.id;
      check(typeof id === 'string' && isInt(friend.state), `${this.label}: malformed friend ${JSON.stringify(friend)}`);
      states.set(id, friend.state);
    }
    return states;
  }

  async listedNotifications(): Promise<Notification[]> {
    const result = await expectOk(this.label, 'listNotifications', () => client.listNotifications(this.session, 100));
    return result.notifications ?? [];
  }

  /** Ids of every notification seen so far, from the socket and the inbox. */
  async seenNotificationIds(): Promise<Set<string>> {
    const ids = new Set<string>();
    for (const n of [...this.socketNotifications, ...(await this.listedNotifications())]) if (n.id !== undefined) ids.add(n.id);
    return ids;
  }

  /** A notification with `code` from `senderId` not in `seen`, from the socket first, else the inbox; null when none. */
  async findNotification(code: number, senderId: string, seen: ReadonlySet<string>): Promise<{ via: string } | null> {
    const matches = (n: Notification): boolean => n.code === code && n.sender_id === senderId && !seen.has(n.id ?? '');
    if (this.socketNotifications.some(matches)) return { via: 'socket' };
    if ((await this.listedNotifications()).some(matches)) return { via: 'inbox' };
    return null;
  }

  /** Follows `ids` in chunks, as the app does; resolves the online presences the server returned. */
  async follow(ids: readonly string[]): Promise<Presence[]> {
    const socket = this.socket;
    check(socket !== null, `${this.label}: no social socket`);
    const presences: Presence[] = [];
    for (let i = 0; i < ids.length; i += FOLLOW_CHUNK) {
      const status = await socket.followUsers(ids.slice(i, i + FOLLOW_CHUNK));
      // `presences` is undefined when none of them is online.
      presences.push(...(status.presences ?? []));
    }
    return presences;
  }

  async setStatus(status: string): Promise<void> {
    check(this.socket !== null, `${this.label}: no social socket`);
    await this.socket.updateStatus(status);
  }

  close(): void {
    const socket = this.socket;
    this.socket = null;
    socket?.disconnect(false);
  }
}

const socialUsers: SocialUser[] = [];

function presenceStatus(presence: Presence): unknown {
  const raw: unknown = presence;
  return isRecord(raw) ? raw.status : undefined;
}

function expectFriendRejected(owner: string, outcome: HttpOutcome, status: number, grpcCode: number, message: FriendErrorCode): void {
  expectRejected(owner, outcome, status, grpcCode, message);
}

function expectFriendAccepted(owner: string, outcome: HttpOutcome): void {
  check(outcome.status === HTTP_OK, `${owner}: addFriends failed with ${outcome.status} ${JSON.stringify(outcome.body)}`);
}

function describeState(state: number | undefined): string {
  return state === undefined ? 'none' : String(state);
}

async function expectState(owner: SocialUser, other: SocialUser, expected: number | undefined): Promise<void> {
  const states = await owner.friendStates();
  const actual = states.get(other.userId);
  check(actual === expected, `${owner.label}: edge to ${other.label} is ${describeState(actual)}, expected ${describeState(expected)}`);
}

async function expectNoEdges(owner: SocialUser): Promise<void> {
  const states = await owner.friendStates();
  check(states.size === 0, `${owner.label}: expected an empty friends list, got ${JSON.stringify([...states])}`);
}

async function runFriends(): Promise<string[]> {
  const scenarioStart = Date.now();
  const runId = `e2e-friends-${Date.now()}`;
  const a = new SocialUser('FA', `${runId}-a`);
  const b = new SocialUser('FB', `${runId}-b`);
  socialUsers.push(a, b);

  // 1. Fresh guests get friend-code usernames.
  await a.signIn();
  await b.signIn();
  check(a.userId !== '' && b.userId !== '' && a.userId !== b.userId, 'friends: FA and FB must be distinct users');
  for (const u of [a, b]) check(isFriendCode(u.friendCode), `${u.label}: username "${u.friendCode}" is not a friend code`);
  log(`friends: FA=${a.userId} code ${a.friendCode}, FB=${b.userId} code ${b.friendCode}`);
  await a.connectSocial();
  await b.connectSocial();

  // 2. A adds B by code, typed lowercase: the hook normalizes it. B gets -2 and accepts; A gets -3.
  const bSeen = await b.seenNotificationIds();
  expectFriendAccepted('FA', await a.addFriends([], [b.friendCode.toLowerCase()]));
  await expectState(a, b, FRIEND_STATE.REQUEST_SENT);
  await expectState(b, a, FRIEND_STATE.REQUEST_RECEIVED);
  const request = await waitForAsync('FB to get the -2 friend request', 10_000, () =>
    b.findNotification(NOTIFICATION_CODES.FRIEND_REQUEST, a.userId, bSeen),
  );
  log(`friends: FA added FB by "${b.friendCode.toLowerCase()}"; FB got -2 via ${request.via}`);
  const aSeen = await a.seenNotificationIds();
  expectFriendAccepted('FB', await b.addFriends([a.userId]));
  const accept = await waitForAsync('FA to get the -3 accept', 10_000, () =>
    a.findNotification(NOTIFICATION_CODES.FRIEND_ACCEPT, b.userId, aSeen),
  );
  await expectState(a, b, FRIEND_STATE.FRIEND);
  await expectState(b, a, FRIEND_STATE.FRIEND);
  log(`friends: FB accepted; FA got -3 via ${accept.via}; both list each other in state 0`);

  // 3. Presence: each follows the other and sees them online; B's status change reaches A.
  const aSees = await a.follow([b.userId]);
  const bSees = await b.follow([a.userId]);
  check(aSees.some((p) => p.user_id === b.userId), `FA: following FB returned no online presence (${JSON.stringify(aSees)})`);
  check(bSees.some((p) => p.user_id === a.userId), `FB: following FA returned no online presence (${JSON.stringify(bSees)})`);
  log('friends: both followed each other and see each other online');
  const playing: PresenceStatus = { v: 1, a: 'playing' };
  const status = JSON.stringify(playing);
  const eventsBefore = a.statusEvents.length;
  await b.setStatus(status);
  // A status change is one event: the new status in `joins`, the old one in `leaves`, same session.
  const change = await waitFor(`FA to see FB's status ${status}`, 10_000, () =>
    a.statusEvents.slice(eventsBefore).find((e) => (e.joins ?? []).some((p) => p.user_id === b.userId && presenceStatus(p) === status)),
  );
  const leftStatus = (change.leaves ?? []).filter((p) => p.user_id === b.userId).map(presenceStatus);
  log(`friends: FA saw FB's status ${status} (leaves carried ${JSON.stringify(leftStatus)})`);

  // 4. A removes B: the edge goes on both sides.
  await a.deleteFriend(b.userId);
  await expectNoEdges(a);
  await expectNoEdges(b);
  log('friends: FA removed FB; both lists are empty');

  // 5. B blocks A. A's request answers OK but is dropped: B's list is unchanged and B gets no new -2.
  await b.block(a.userId);
  await expectState(b, a, FRIEND_STATE.BLOCKED);
  const bSeenBlocked = await b.seenNotificationIds();
  expectFriendAccepted('FA (blocked)', await a.addFriends([b.userId]));
  await sleep(QUIET_MS);
  const bWhileBlocked = await b.friendStates();
  check(
    bWhileBlocked.size === 1 && bWhileBlocked.get(a.userId) === FRIEND_STATE.BLOCKED,
    `FB: list changed after a blocked request: ${JSON.stringify([...bWhileBlocked])}`,
  );
  const leaked = await b.findNotification(NOTIFICATION_CODES.FRIEND_REQUEST, a.userId, bSeenBlocked);
  check(leaked === null, `FB: got a -2 from a blocked user via ${leaked?.via ?? '?'}`);
  const aWhileBlocked = (await a.friendStates()).get(b.userId);
  log(`friends: FB blocked FA; FA's request returned 200 but FB's list and inbox are unchanged (FA's edge: ${describeState(aWhileBlocked)})`);

  // 6. B unblocks (delete); a fresh request works again.
  await b.deleteFriend(a.userId);
  await expectNoEdges(b);
  const bSeenUnblocked = await b.seenNotificationIds();
  expectFriendAccepted('FA (after unblock)', await a.addFriends([b.userId]));
  await expectState(a, b, FRIEND_STATE.REQUEST_SENT);
  await expectState(b, a, FRIEND_STATE.REQUEST_RECEIVED);
  const fresh = await waitForAsync('FB to get a -2 after unblocking', 10_000, () =>
    b.findNotification(NOTIFICATION_CODES.FRIEND_REQUEST, a.userId, bSeenUnblocked),
  );
  log(`friends: FB unblocked FA; a fresh request arrived (-2 via ${fresh.via})`);

  for (const u of [a, b]) u.close();
  const lines = [
    'friends: PASSED',
    `  codes:    FA=${a.friendCode} FB=${b.friendCode}; added by lowercase code`,
    `  requests: -2 via ${request.via}, -3 via ${accept.via}; both friends (state 0)`,
    `  presence: mutual follow online; status ${status} seen by FA`,
    '  remove:   both lists empty',
    '  block:    request dropped silently (200, no edge, no -2); unblock, then a fresh request works',
  ];
  if (RUN_LIMITS) lines.push(...(await checkOutgoingLimit()));
  lines.push(`  duration: ${seconds(Date.now() - scenarioStart)}`);
  return lines;
}

/** --limits: a fresh sender fills its outgoing quota in calls of 10 ids; the next request is refused. */
async function checkOutgoingLimit(): Promise<string[]> {
  const start = Date.now();
  const runId = `e2e-limit-${Date.now()}`;
  const sender = new SocialUser('LS', `${runId}-sender`);
  socialUsers.push(sender);
  await sender.signIn();
  const max = FRIEND_LIMITS.MAX_OUTGOING_PENDING;
  const perCall = FRIEND_LIMITS.MAX_TARGETS_PER_REQUEST;
  const targets: SocialUser[] = [];
  for (let i = 0; i <= max; i += perCall) {
    const batch: SocialUser[] = [];
    for (let j = i; j < Math.min(i + perCall, max + 1); j++) batch.push(new SocialUser(`LT${j + 1}`, `${runId}-t${j + 1}`));
    await Promise.all(batch.map((t) => t.signIn()));
    targets.push(...batch);
  }
  check(new Set(targets.map((t) => t.userId)).size === max + 1, `limits: expected ${max + 1} distinct throwaway accounts`);
  log(`limits: signed in LS and ${targets.length} throwaway accounts`);

  for (let i = 0; i < max; i += perCall) {
    const ids = targets.slice(i, Math.min(i + perCall, max)).map((t) => t.userId);
    expectFriendAccepted(`LS requests ${i + 1}-${i + ids.length}`, await sender.addFriends(ids));
  }
  const pending = [...(await sender.friendStates()).values()].filter((state) => state === FRIEND_STATE.REQUEST_SENT).length;
  check(pending === max, `LS: expected ${max} pending requests, got ${pending}`);
  const last = targets[max];
  check(last !== undefined, 'limits: no target for the over-limit request');
  expectFriendRejected('LS request 51', await sender.addFriends([last.userId]), HTTP_TOO_MANY_REQUESTS, GRPC_RESOURCE_EXHAUSTED, 'friend_outgoing_limit');
  await expectNoEdges(last);
  log(`limits: ${max} requests in calls of ${perCall} accepted; request ${max + 1} refused with 429 friend_outgoing_limit and left no edge`);
  return [`  limits:   ${max} outgoing requests OK, #${max + 1} 429 friend_outgoing_limit (${seconds(Date.now() - start)})`];
}

// ---------------------------------------------------------------------------
// Scenario 4: table invites.

/** The content of a TABLE_INVITE notification (an object, or a JSON string), failing the run when malformed. */
function parseTableInviteContent(owner: string, raw: unknown): TableInviteContent {
  let value: unknown = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      throw new E2eFailure(`${owner}: TABLE_INVITE content is not JSON: ${String(raw)}`);
    }
  }
  check(isRecord(value), `${owner}: TABLE_INVITE content is not an object: ${JSON.stringify(value)}`);
  const content = value;
  check(content.v === 1, `${owner}: TABLE_INVITE v is ${String(content.v)}, expected 1`);
  const code = content.code;
  check(typeof code === 'string' && isRoomCode(code), `${owner}: TABLE_INVITE code is malformed: ${String(code)}`);
  const fromName = content.fromName;
  check(typeof fromName === 'string' && fromName.trim().length > 0, `${owner}: TABLE_INVITE has no fromName`);
  return { v: 1, code, fromName };
}

interface FoundInvite {
  readonly id: string;
  readonly content: TableInviteContent;
  /** Where it was seen: the social socket and/or the persistent inbox. */
  readonly via: string[];
}

/**
 * Every distinct TABLE_INVITE for `code` from `senderId` this user can see, from
 * the social socket and the persistent inbox (the two sources `findNotification`
 * checks), deduped by notification id so the same push seen twice counts once.
 */
async function collectTableInvites(user: SocialUser, code: string, senderId: string): Promise<FoundInvite[]> {
  const found = new Map<string, FoundInvite>();
  const add = (notification: Notification, via: string): void => {
    if (notification.code !== NOTIFICATION_CODES.TABLE_INVITE || notification.sender_id !== senderId) return;
    const content = parseTableInviteContent(user.label, notification.content);
    if (content.code !== code) return;
    const id = notification.id ?? '';
    check(id !== '', `${user.label}: TABLE_INVITE without an id`);
    const existing = found.get(id);
    if (existing === undefined) found.set(id, { id, content, via: [via] });
    else if (!existing.via.includes(via)) existing.via.push(via);
  };
  for (const notification of user.socketNotifications) add(notification, 'socket');
  for (const notification of await user.listedNotifications()) add(notification, 'inbox');
  return [...found.values()];
}

function expectInviteRejected(owner: string, outcome: HttpOutcome, status: number, grpcCode: number, message: InviteRpcErrorCode): void {
  expectRejected(owner, outcome, status, grpcCode, message);
}

function expectInviteSent(owner: string, outcome: HttpOutcome, sent: boolean): void {
  check(outcome.status === HTTP_OK, `${owner}: invite_to_table failed with ${outcome.status} ${JSON.stringify(outcome.body)}`);
  check(
    isRecord(outcome.body) && outcome.body.sent === sent,
    `${owner}: expected { sent: ${sent} }, got ${JSON.stringify(outcome.body)}`,
  );
}

async function runInvites(): Promise<string[]> {
  const scenarioStart = Date.now();
  const runId = `e2e-invite-${Date.now()}`;
  const a = new SocialUser('IA', `${runId}-a`);
  const b = new SocialUser('IB', `${runId}-b`);
  const c = new SocialUser('IC', `${runId}-c`);
  socialUsers.push(a, b, c);

  // 1. Fresh guests; A and B become mutual friends by friend code, C stays a stranger.
  await a.signIn();
  await b.signIn();
  await c.signIn();
  check(new Set([a.userId, b.userId, c.userId]).size === 3, 'invites: IA, IB and IC must be distinct users');
  await b.connectSocial();
  expectFriendAccepted('IA', await a.addFriends([], [b.friendCode.toLowerCase()]));
  expectFriendAccepted('IB', await b.addFriends([a.userId]));
  await expectState(a, b, FRIEND_STATE.FRIEND);
  await expectState(b, a, FRIEND_STATE.FRIEND);
  log(`invites: IA=${a.userId} and IB=${b.userId} are mutual friends; IC=${c.userId} is not`);

  // 2. A creates a private table and joins it: the invite RPC requires the caller to be a member.
  const { matchId, code } = parseCreated(await a.rpc('create_private_table', {}));
  const aTable = new Player('IA', a.deviceId);
  players.push(aTable);
  await aTable.connect();
  const aJoin = await aTable.joinWith(matchId, codeMetadata(code));
  check(aJoin === null, `IA: join with the code refused: ${String(aJoin)}`);
  await waitFor('IA room snapshot', 5000, () => aTable.snapshot?.room !== undefined);
  log(`invites: IA created and joined ${matchId} (seat ${aTable.seat}, host ${String(own(aTable).isHost)})`);

  // 3. A invites B once; the identical invite again is a no-op.
  expectInviteSent('IA', await a.rpc('invite_to_table', { userId: b.userId, code }), true);
  expectInviteSent('IA (duplicate)', await a.rpc('invite_to_table', { userId: b.userId, code }), false);
  log('invites: IA invited IB {sent:true}; the identical invite again returned {sent:false}');

  // 4. B gets exactly one TABLE_INVITE, on the social socket and/or in the persistent inbox.
  const invites = await waitForAsync('IB to receive the TABLE_INVITE', 10_000, async () => {
    const found = await collectTableInvites(b, code, a.userId);
    return found.length > 0 ? found : null;
  });
  check(invites.length === 1, `IB: expected one TABLE_INVITE, got ${invites.length}`);
  const invite = invites[0];
  check(invite !== undefined, 'IB: no TABLE_INVITE');
  check(invite.content.v === 1, 'IB: TABLE_INVITE has v != 1');
  check(invite.content.code === code, 'IB: TABLE_INVITE code differs from the table code');
  check(invite.content.fromName.trim().length > 0, 'IB: TABLE_INVITE has an empty fromName');
  await sleep(QUIET_MS);
  const afterQuiet = await collectTableInvites(b, code, a.userId);
  check(afterQuiet.length === 1, `IB: expected exactly one TABLE_INVITE after the duplicate invite, got ${afterQuiet.length}`);
  log(`invites: IB got one TABLE_INVITE from IA (via ${invite.via.join('+')}), still one after ${seconds(QUIET_MS)}`);

  // 5. B joins by the code and lands in the room next to A.
  const bFound = parseFound('IB', await b.rpc('join_by_code', { code }));
  check(bFound === matchId, `IB: join_by_code gave ${bFound}, expected ${matchId}`);
  const bTable = new Player('IB', b.deviceId);
  players.push(bTable);
  await bTable.connect();
  const bJoin = await bTable.joinWith(matchId, codeMetadata(code));
  check(bJoin === null, `IB: join with the code refused: ${String(bJoin)}`);
  // A waiting private room auto-seats a newcomer on the lowest free seat (wire
  // protocol, "Private tables"), so B is seat 1; a standing `seat: -1` member is
  // a newcomer who joins a full room or one that is already playing.
  const inRoom = await waitFor('IB room snapshot', 5000, () => {
    const s = bTable.snapshot;
    return s !== null && s.room !== undefined && s.room.members.length === 2 ? s : null;
  });
  check(inRoom.seat === 1, `IB: expected seat 1 (the lowest free seat), got ${inRoom.seat}`);
  check(inRoom.room?.you === 1, `IB: expected room.you 1, got ${String(inRoom.room?.you)}`);
  const members = inRoom.room?.members ?? [];
  // Names are display names (a fresh guest gets a random default), so only their
  // shape is asserted; identity comes from the user ids members carry.
  const memberNames = members.map((member) => member.name);
  check(
    memberNames.length === 2 && memberNames.every((name) => name.trim().length > 0),
    `IB: room members have malformed names: ${JSON.stringify(memberNames)}`,
  );
  const memberIds = members.map((member) => member.userId ?? '').sort();
  const expectedIds = [a.userId, b.userId].sort();
  check(
    memberIds.length === expectedIds.length && memberIds.every((id, index) => id === expectedIds[index]),
    `IB: room members ${JSON.stringify(memberIds)} are not IA and IB (${JSON.stringify(expectedIds)})`,
  );
  log(`invites: IB joined by code at seat ${inRoom.seat}; room members ${JSON.stringify(memberNames)} (ids ${JSON.stringify(memberIds)})`);

  // 6. Refusals: a stranger, an unknown code, and a caller who is not in that room.
  const cRoom = parseCreated(await c.rpc('create_private_table', {}));
  const cTable = new Player('IC', c.deviceId);
  players.push(cTable);
  await cTable.connect();
  const cJoin = await cTable.joinWith(cRoom.matchId, codeMetadata(cRoom.code));
  check(cJoin === null, `IC: join with the code refused: ${String(cJoin)}`);
  await waitFor('IC room snapshot', 5000, () => cTable.snapshot?.room !== undefined);
  expectInviteRejected(
    'IC (not a friend)',
    await c.rpc('invite_to_table', { userId: b.userId, code: cRoom.code }),
    HTTP_BAD_REQUEST,
    GRPC_FAILED_PRECONDITION,
    'invite_not_friend',
  );
  const deadCode = code === 'ZZZZZZ' ? 'YYYYYY' : 'ZZZZZZ';
  expectInviteRejected(
    'IA (dead code)',
    await a.rpc('invite_to_table', { userId: b.userId, code: deadCode }),
    HTTP_NOT_FOUND,
    GRPC_NOT_FOUND,
    'invite_room_not_found',
  );
  expectInviteRejected(
    'IA (not a member)',
    await a.rpc('invite_to_table', { userId: b.userId, code: cRoom.code }),
    HTTP_FORBIDDEN,
    GRPC_PERMISSION_DENIED,
    'invite_not_member',
  );
  log('invites: invite_not_friend (400), invite_room_not_found (404) and invite_not_member (403) refused');

  for (const p of [aTable, bTable, cTable]) p.close();
  for (const user of [a, b, c]) user.close();
  return [
    'invites: PASSED',
    `  table:    ${matchId}`,
    '  friends:  IA and IB mutual friends; IC a stranger',
    `  invite:   IA -> IB {sent:true}, repeat {sent:false}; IB got one TABLE_INVITE (via ${invite.via.join('+')})`,
    `  join:     IB joined by code at seat ${inRoom.seat}, ${memberNames.length} members`,
    '  rejects:  invite_not_friend 400, invite_room_not_found 404, invite_not_member 403',
    `  duration: ${seconds(Date.now() - scenarioStart)}`,
  ];
}


// ---------------------------------------------------------------------------
// Scenario 5: the players directory (unique names, search, profile, stats,
// presence visibility and blocking), plus its rate-limit check.

/** One player as `search_players` returns it. */
interface FoundPlayer {
  readonly userId: string;
  readonly name: string;
  readonly presence: string;
}

/** A `search_players` page after validation. */
interface FoundPage {
  readonly players: readonly FoundPlayer[];
  readonly nextCursor: string | null;
  readonly capped: boolean;
}

function parseFoundPage(owner: string, outcome: HttpOutcome): FoundPage {
  check(outcome.status === HTTP_OK, `${owner}: search_players failed with ${outcome.status} ${JSON.stringify(outcome.body)}`);
  const body = outcome.body;
  check(isRecord(body) && Array.isArray(body.players), `${owner}: search_players returned no players array: ${JSON.stringify(body)}`);
  const players: FoundPlayer[] = [];
  for (const raw of body.players) {
    check(isRecord(raw), `${owner}: a search row is not an object: ${JSON.stringify(raw)}`);
    const { userId, name, presence } = raw;
    check(typeof userId === 'string' && userId !== '', `${owner}: a search row has no userId`);
    check(typeof name === 'string' && name !== '', `${owner}: a search row has no name`);
    check(presence === 'visible' || presence === 'hidden', `${owner}: a search row has presence ${String(presence)}`);
    players.push({ userId, name, presence });
  }
  const nextCursor = body.nextCursor ?? null;
  check(nextCursor === null || typeof nextCursor === 'string', `${owner}: nextCursor is ${String(nextCursor)}`);
  const capped = body.capped === true;
  return { players, nextCursor, capped };
}

/** The matches for one query, following every page until the cursor stops. */
async function searchAll(owner: string, user: SocialUser, q: string): Promise<FoundPlayer[]> {
  const found: FoundPlayer[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const outcome = await user.rpc('search_players', cursor === undefined ? { q } : { q, cursor });
    const result = parseFoundPage(owner, outcome);
    found.push(...result.players);
    if (result.nextCursor === null || result.capped) break;
    cursor = result.nextCursor;
  }
  return found;
}

/**
 * Picks a run-unique Latin display name that is a prefix nobody else shares.
 * Letters only (the allow-list forbids `-`), at most DISPLAY_NAME_MAX_LENGTH.
 */
function uniqueName(runId: string, tag: string): string {
  const letters = runId.replace(/[^a-z0-9]/g, '');
  const suffix = letters.slice(-4);
  return `${tag}${suffix}`.slice(0, 16);
}

/** A profile response after validation. */
interface FoundProfile {
  readonly userId: string;
  readonly name: string;
  readonly presence: string;
  readonly competitive: Readonly<Record<string, number>>;
  readonly practice: Readonly<Record<string, number>>;
}

function numberFields(owner: string, raw: unknown, label: string): Readonly<Record<string, number>> {
  check(isRecord(raw), `${owner}: profile ${label} is not an object: ${JSON.stringify(raw)}`);
  const record: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    check(typeof value === 'number', `${owner}: profile ${label}.${key} is not a number`);
    record[key] = value;
  }
  return record;
}

function parseFoundProfile(owner: string, outcome: HttpOutcome): FoundProfile {
  check(outcome.status === HTTP_OK, `${owner}: get_player_profile failed with ${outcome.status} ${JSON.stringify(outcome.body)}`);
  const body = outcome.body;
  check(isRecord(body), `${owner}: profile is not an object: ${JSON.stringify(body)}`);
  const { userId, name, presence, stats } = body;
  check(typeof userId === 'string' && userId !== '', `${owner}: profile has no userId`);
  check(typeof name === 'string' && name !== '', `${owner}: profile has no name`);
  check(presence === 'visible' || presence === 'hidden', `${owner}: profile has presence ${String(presence)}`);
  check(isRecord(stats), `${owner}: profile has no stats: ${JSON.stringify(stats)}`);
  return {
    userId,
    name,
    presence,
    competitive: numberFields(owner, stats.competitive, 'competitive'),
    practice: numberFields(owner, stats.practice, 'practice'),
  };
}

function expectDirectoryRejected(owner: string, outcome: HttpOutcome, status: number, grpcCode: number, message: string): void {
  expectRejected(owner, outcome, status, grpcCode, message);
}

/** `userId` if the search returned it, else null; the excluded-caller and block checks both use it. */
function findRow(players: readonly FoundPlayer[], userId: string): FoundPlayer | null {
  return players.find((p) => p.userId === userId) ?? null;
}

async function runDirectory(): Promise<string[]> {
  const scenarioStart = Date.now();
  const runId = `e2e-directory-${Date.now()}`;
  const a = new SocialUser('DA', `${runId}-a`);
  const b = new SocialUser('DB', `${runId}-b`);
  const c = new SocialUser('DC', `${runId}-c`);
  // A guest that never claims a name: it is DC's "unknown id" in section 6 and the unlisted case in section 7.
  const unlisted = new SocialUser('DU', `${runId}-u`);
  socialUsers.push(a, b, c, unlisted);
  await a.signIn();
  await b.signIn();
  await c.signIn();
  await unlisted.signIn();
  const nameA = uniqueName(runId, 'dira');
  const nameB = uniqueName(runId, 'dirb');
  const nameC = uniqueName(runId, 'dirc');
  const prefix = uniqueName(runId, 'dir').slice(0, 3);
  log(`directory: DA=${a.userId}, DB=${b.userId}, DC=${c.userId}; names ${nameA}, ${nameB}, ${nameC}`);

  // 1. Distinct claims. A name folds to one claim: a second account is refused.
  expectNameAccepted('DA', nameA, await a.rename(nameA));
  expectNameAccepted('DB', nameB, await b.rename(nameB));
  expectNameAccepted('DC', nameC, await c.rename(nameC));
  expectNameRejected('DB (taken)', await b.rename(nameA), HTTP_BAD_REQUEST, 3, 'name_taken');
  expectNameRejected('DC (taken, other case)', await c.rename(nameA.toUpperCase()), HTTP_BAD_REQUEST, 3, 'name_taken');
  log('directory: three distinct claims; a taken name and a case-only clash both refused with 400 name_taken');

  // 2. Each player is findable by a folded prefix, and the result carries the claimed spelling.
  const rowsA = await searchAll('DA search', a, prefix);
  check(findRow(rowsA, b.userId) !== null, `DA: search for "${prefix}" did not return DB`);
  check(findRow(rowsA, c.userId) !== null, `DA: search for "${prefix}" did not return DC`);
  check(findRow(rowsA, a.userId) === null, 'DA: search returned the caller');
  const rowB = findRow(rowsA, b.userId);
  check(rowB !== null && rowB.name === nameB, `DA: DB's row shows "${String(rowB?.name)}", expected "${nameB}"`);
  // The query is folded: an upper-case prefix finds the same players.
  const rowsUpper = await searchAll('DA search (upper)', a, prefix.toUpperCase());
  check(findRow(rowsUpper, b.userId) !== null, 'DA: an upper-case query did not find DB (the query is not folded)');
  log(`directory: prefix "${prefix}" found ${rowsA.length} players, never the caller; case-folded query matches`);

  // 3. A fold-only rename keeps the player listed and the claim; a new fold frees
  //    the old name. The rename cooldown allows one rename per account per hour,
  //    so the case-only rename (DB) and the new-fold rename (DC) are separate
  //    accounts: each has had exactly one pick and so gets exactly one rename.
  expectNameAccepted('DB (case rename)', nameB.toUpperCase(), await b.rename(nameB.toUpperCase()));
  const afterRename = await searchAll('DA search (after case rename)', a, prefix);
  check(findRow(afterRename, b.userId) !== null, 'DA: DB fell out of the directory after a case-only rename');
  log('directory: a case-only rename kept DB listed');
  const nameC2 = uniqueName(runId, 'dirc2');
  expectNameAccepted('DC (new fold)', nameC2, await c.rename(nameC2));
  const oldNameRows = await searchAll('DA search (old name)', a, nameC.toLowerCase());
  check(findRow(oldNameRows, c.userId) === null, `DA: DC is still found under the freed name "${nameC}"`);
  const newNameRows = await searchAll('DA search (new name)', a, nameC2.toLowerCase());
  check(findRow(newNameRows, c.userId) !== null, `DA: DC is not found under the new name "${nameC2}"`);
  log(`directory: renaming DC to "${nameC2}" freed "${nameC}" and lists DC under the new name`);

  // 4. A profile carries both stat blocks, never summed.
  const profile = parseFoundProfile('DA profile', await a.rpc('get_player_profile', { userId: b.userId }));
  check(profile.userId === b.userId, `DA: profile is for ${profile.userId}, expected ${b.userId}`);
  check(profile.name === nameB, `DA: profile names "${profile.name}", expected "${nameB}"`);
  for (const key of ['games', 'wins', 'chkobbas', 'currentStreak', 'bestStreak']) {
    check(typeof profile.competitive[key] === 'number', `DA: competitive.${key} is missing`);
  }
  for (const key of ['games', 'wins', 'chkobbas']) check(typeof profile.practice[key] === 'number', `DA: practice.${key} is missing`);
  log(`directory: DB's profile opened with competitive ${JSON.stringify(profile.competitive)} and practice ${JSON.stringify(profile.practice)}`);

  // 4b. Practice stats: a device report moves only the practice block, is
  //     clamped, and leaves the server-observed competitive block at zero. No
  //     online game in this scenario means competitive stays untouched; the
  //     finished-match write is covered by the quick-match scenario.
  const reported = (await expectOk('DC', 'report_practice_game', () =>
    c.rpc('report_practice_game', { win: true, chkobbas: 999 }),
  )).body as { practice?: unknown };
  check(
    isRecord(reported) && isRecord(reported.practice) && reported.practice.games === 1 && reported.practice.wins === 1,
    `DC: a practice report answered ${JSON.stringify(reported)}, expected games 1 and wins 1`,
  );
  check(reported.practice.chkobbas === 21, `DC: practice chkobbas was ${String(reported.practice.chkobbas)}, expected the clamp to 21`);
  const cProfile = parseFoundProfile('DA profile (practice)', await a.rpc('get_player_profile', { userId: c.userId }));
  check(cProfile.practice.games === 1 && cProfile.practice.wins === 1, `DC: profile practice ${JSON.stringify(cProfile.practice)} is not the reported game`);
  check(cProfile.competitive.games === 0, `DC: competitive moved to ${String(cProfile.competitive.games)} on a practice report`);
  expectDirectoryRejected(
    'DC (bad practice report)',
    await c.rpc('report_practice_game', { win: 'yes', chkobbas: 0 }),
    HTTP_BAD_REQUEST,
    3,
    'practice_bad_request',
  );
  log('directory: a practice report moved only the practice block (chkobbas clamped to 21); a bad report is 400');

  // 5. Presence visibility: Nobody hides the label everywhere, Everyone restores it.
  await expectOk('DB', 'set_presence_visibility nobody', () => b.rpc('set_presence_visibility', { visibility: 'nobody' }));
  const hiddenRow = findRow(await searchAll('DA search (hidden)', a, nameB.toLowerCase()), b.userId);
  check(hiddenRow !== null && hiddenRow.presence === 'hidden', `DB is not "hidden" in search: ${JSON.stringify(hiddenRow)}`);
  check(parseFoundProfile('DA profile (hidden)', await a.rpc('get_player_profile', { userId: b.userId })).presence === 'hidden', "DB's profile is not hidden");
  await expectOk('DB', 'set_presence_visibility everyone', () => b.rpc('set_presence_visibility', { visibility: 'everyone' }));
  const visibleRow = findRow(await searchAll('DA search (visible)', a, nameB.toLowerCase()), b.userId);
  check(visibleRow !== null && visibleRow.presence === 'visible', `DB is not "visible" after restoring: ${JSON.stringify(visibleRow)}`);
  log('directory: Nobody shows "hidden" in search and on the profile; Everyone restores "visible"');

  // 6. Blocks are mutual invisibility, and a blocked profile is byte-identical to an unknown id.
  await a.block(b.userId);
  check(findRow(await searchAll('DA search (blocked)', a, nameB.toLowerCase()), b.userId) === null, 'DA: a blocked player still appears in search');
  // An unknown id must look like an id: Nakama ids are UUIDs, and anything
  // longer is refused as a bad query before the lookup. A real, unclaimed
  // account nobody blocks is the honest "unknown" case.
  const unknown = await a.rpc('get_player_profile', { userId: unlisted.userId });
  const blocked = await a.rpc('get_player_profile', { userId: b.userId });
  expectDirectoryRejected('DA profile (blocked)', blocked, HTTP_NOT_FOUND, GRPC_NOT_FOUND, 'directory_not_found');
  check(
    JSON.stringify(blocked.body) === JSON.stringify(unknown.body),
    `DA: a blocked profile is distinguishable from an unknown id (blocked ${JSON.stringify(blocked.body)} vs unknown ${JSON.stringify(unknown.body)})`,
  );
  const reverseRows = await searchAll('DB search (blocked)', b, nameA.toLowerCase());
  check(findRow(reverseRows, a.userId) === null, 'DB: the blocker still appears in the blocked player\'s search');
  expectDirectoryRejected(
    'DB profile (blocked)',
    await b.rpc('get_player_profile', { userId: a.userId }),
    HTTP_NOT_FOUND,
    GRPC_NOT_FOUND,
    'directory_not_found',
  );
  await a.deleteFriend(b.userId);
  const unblockedRows = await searchAll('DA search (unblocked)', a, nameB.toLowerCase());
  check(findRow(unblockedRows, b.userId) !== null, 'DA: DB did not come back after unblocking');
  log('directory: a block hides both directions, answers exactly like an unknown id, and unblock restores');

  // 7. An unlisted guest (no claimed name) is not findable.
  const nothing = await searchAll('DA search (unlisted)', a, 'zzz');
  check(findRow(nothing, unlisted.userId) === null, 'DA: an unlisted guest appears in search');
  log(`directory: unlisted guest DU=${unlisted.userId} is not searchable`);

  // 8. Query shape: too short, too long, and a wrong payload are all 400 directory_bad_query.
  expectDirectoryRejected('DA (1 char)', await a.rpc('search_players', { q: 'a' }), HTTP_BAD_REQUEST, 3, 'directory_bad_query');
  expectDirectoryRejected('DA (17 chars)', await a.rpc('search_players', { q: 'abcdefghijklmnopq' }), HTTP_BAD_REQUEST, 3, 'directory_bad_query');
  expectDirectoryRejected('DA (no q)', await a.rpc('search_players', {}), HTTP_BAD_REQUEST, 3, 'directory_bad_query');
  log('directory: under, over and missing queries refused with 400 directory_bad_query');

  const limitLines: string[] = [];
  if (RUN_DIRECTORY_LIMITS) {
    // 9. The `SEARCH_LIMIT`th search in one window is refused; the searches this
    //    scenario already made count toward it. The window is 10 minutes and this
    //    scenario runs well inside one, so a fresh account is not needed.
    let refused: HttpOutcome | null = null;
    let sent = 0;
    for (; sent < 120; sent++) {
      const outcome = await a.rpc('search_players', { q: prefix });
      if (outcome.status === HTTP_TOO_MANY_REQUESTS) {
        refused = outcome;
        break;
      }
      check(outcome.status === HTTP_OK, `DA: search ${sent + 1} answered ${outcome.status} ${JSON.stringify(outcome.body)}`);
    }
    check(refused !== null, 'DA: 120 searches never hit the rate limit');
    expectDirectoryRejected('DA (rate limited)', refused, HTTP_TOO_MANY_REQUESTS, GRPC_RESOURCE_EXHAUSTED, 'directory_rate_limited');
    limitLines.push(`  limits:   search ${sent + 1} in the window answered 429 directory_rate_limited`);
    log(`directory: search ${sent + 1} in the window answered 429 directory_rate_limited`);
  }

  return [
    'directory: PASSED',
    `  claims:   ${nameA} / ${nameB} / ${nameC}; a taken name and a case clash refused 400 name_taken`,
    `  search:   prefix "${prefix}" found ${rowsA.length}, never the caller; folded case-insensitive`,
    `  rename:   a case-only rename kept DB listed; ${nameC2} freed ${nameC}`,
    `  profile:  competitive and practice blocks both present ("${nameB}")`,
    '  practice: one report -> games 1, wins 1, chkobbas clamped to 21; competitive untouched',
    '  presence: Nobody -> hidden (search and profile), Everyone -> visible',
    '  block:    hidden both ways; a blocked profile equals an unknown id',
    `  unlisted: ${unlisted.userId} not searchable`,
    '  query:    <2, >16 and missing q all 400 directory_bad_query',
    ...limitLines,
    `  duration: ${seconds(Date.now() - scenarioStart)}`,
  ];
}

// ---------------------------------------------------------------------------

async function run(): Promise<void> {
  const summary: string[] = [];
  if (RUN_QUICK) {
    log('=== scenario: quick match ===');
    summary.push(...(await runQuickMatch()));
    log('=== scenario: leaver game ===');
    summary.push(...(await runLeaverGame()));
  }
  if (RUN_PRIVATE) {
    log(`=== scenario: private table${FULL ? ' (--full)' : ''} ===`);
    summary.push(...(await runPrivate(FULL)));
  }
  if (RUN_FRIENDS) {
    log(`=== scenario: friends${RUN_LIMITS ? ' (with limits)' : ''} ===`);
    summary.push(...(await runFriends()));
  }
  if (RUN_INVITE) {
    log('=== scenario: table invites ===');
    summary.push(...(await runInvites()));
  }
  if (RUN_DIRECTORY) {
    log(`=== scenario: players directory${RUN_DIRECTORY_LIMITS ? ' (with limits)' : ''} ===`);
    summary.push(...(await runDirectory()));
  }
  console.log('');
  console.log('E2E PASSED');
  for (const line of summary) console.log(`  ${line}`);
  console.log(`  total:    ${seconds(Date.now() - startedAt)}`);
}

function shutdown(code: number): never {
  for (const player of players) player.close();
  for (const user of socialUsers) user.close();
  process.exit(code);
}

const overallTimer = setTimeout(() => {
  console.error(`E2E FAILED: overall timeout of ${OVERALL_TIMEOUT_MS} ms exceeded`);
  shutdown(1);
}, OVERALL_TIMEOUT_MS + 5000);

run().then(
  () => {
    clearTimeout(overallTimer);
    shutdown(0);
  },
  (error: unknown) => {
    clearTimeout(overallTimer);
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\nE2E FAILED: ${message}`);
    if (!(error instanceof E2eFailure) && error instanceof Error && error.stack) console.error(error.stack);
    shutdown(1);
  },
);
