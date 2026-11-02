import {
  OpCode,
  ROOM_JOIN_CODE_KEY,
  isRoomCode,
  normalizeRoomCode,
  type EmoteShown,
  type ErrorCode,
  type ErrorPayload,
  type Snapshot,
} from '@chkobba/protocol';
import {
  createTable,
  emote,
  findMember,
  intent,
  join,
  label,
  leave,
  roomOf,
  snapshotFor,
  snapshotForMember,
  tick,
  type Joiner,
  type TableState,
} from '../table';
import { findHumanSeat } from '../table/lifecycle';
import { deleteCodeIfOwned } from '../rpc/roomStore';
import {
  EMPTY_GAME_ROSTER,
  markRecentWritten,
  markStatsWritten,
  needsRecentWrite,
  needsStatsWrite,
  trackRoster,
  unwrittenMembers,
  writeRecentTable,
  type GameRoster,
  type RosterEntry,
} from '../social';
import { answerSignal } from '../social/matchSignal';
import { competitiveResultFor, recordCompetitiveResult } from '../stats';

/**
 * Nakama adapter for one Chkobba table (`chkobba_table`). It only maps the
 * match lifecycle and I/O onto the pure core in `src/table/`; every game rule,
 * timer and bot decision lives there.
 *
 * Nakama looks the handler functions up by their global names, so each one is
 * a top-level named function registered by identifier in `InitModule`.
 */

export const TABLE_MATCH_NAME = 'chkobba_table';

/** The table core paces bots at 1 s, so one tick per second is enough. */
export const TICK_RATE = 1;
/** Keep a finished table up this long so players see the final scores. */
export const LINGER_AFTER_FINISH_MS = 60000;
/** Close a table nobody has been connected to for this long. */
export const EMPTY_TIMEOUT_MS = 60000;
/** A seat reserved by an accepted join attempt is freed if the join never completes. */
export const JOIN_TIMEOUT_MS = 10000;
/** Intents are tiny; anything larger is rejected before JSON parsing. */
export const MAX_MESSAGE_BYTES = 2048;
/** Defensive cap on `tick` calls per loop (see `advance`). */
export const MAX_TICK_STEPS = 8;

/** The fields of a Nakama presence needed to target it with the dispatcher. */
export interface ConnectionPresence {
  readonly userId: string;
  readonly sessionId: string;
  readonly username: string;
  readonly node: string;
}

/** Per-session bookkeeping, keyed by sessionId in `TableMatchState.connections`. */
export interface Connection {
  readonly presence: ConnectionPresence;
  /** display_name resolved in matchJoinAttempt (fallback: username); reused by admit. */
  readonly displayName: string;
  /** False between an accepted join attempt and the actual join. */
  readonly joined: boolean;
  readonly reservedAt: number;
  /** Last log seq sent to this session (0 = nothing yet, so the next snapshot carries the whole log). */
  readonly lastSeq: number;
  /** Fingerprint of the last snapshot sent; null forces the next one. */
  readonly fingerprint: string | null;
}

/** Match state held by Nakama. Plain JSON data only. */
export interface TableMatchState {
  readonly table: TableState;
  readonly connections: { readonly [sessionId: string]: Connection };
  /** Last label string sent to Nakama. */
  readonly label: string;
  /** Epoch ms since when no session has been attached; null while someone is. */
  readonly emptySince: number | null;
  /** Epoch ms of each seat's last shown emote, keyed by seat index (the cooldown clock). */
  readonly emoteAt: { readonly [seat: string]: number };
  /**
   * Recent players (see `src/social/gameRoster.ts`): the current game's key,
   * the humans who sat in it and who already has it in their record. Match
   * state saved before these existed has no such keys: read them through
   * `gameRosterOf`.
   */
  readonly gameKey: string | null;
  readonly roster: readonly RosterEntry[];
  readonly recentWritten: readonly string[];
  /** userIds whose competitive-stats record has this game; absent in state saved before it existed. */
  readonly statsWritten?: readonly string[];
}

type Dispatcher = nkruntime.MatchDispatcher;

/**
 * `create_private_table` passes `{ private: 'true', code }` (strings only: Nakama
 * may stringify params). Anything else, `quick_match`'s `{}` included, makes a
 * public table.
 */
export function matchInit(
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  params: { [key: string]: unknown },
): { state: TableMatchState; tickRate: number; label: string } {
  const now = Date.now();
  const privateCode = privateCodeOf(logger, params);
  const seed = nk.uuidv4();
  const table = privateCode === null ? createTable({ now, seed }) : createTable({ now, seed, privateCode });
  const labelText = labelOf(table);
  return {
    state: { table, connections: {}, label: labelText, emptySince: now, emoteAt: {}, ...EMPTY_GAME_ROSTER },
    tickRate: TICK_RATE,
    label: labelText,
  };
}

/**
 * Accepts the user holding a reserved seat, or anyone while a seat is free.
 * The seat is claimed right away: Nakama admits accepted presences in a later
 * batch, so two attempts for the last seat must not both pass.
 */
export function matchJoinAttempt(
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: Dispatcher,
  _tick: number,
  state: TableMatchState,
  presence: nkruntime.Presence,
  metadata: { [key: string]: unknown },
): { state: TableMatchState; accept: boolean; rejectMessage?: string } {
  const now = Date.now();
  if (!mayEnterRoom(state.table, presence.userId, metadata)) return { state, accept: false, rejectMessage: ROOM_DENIED };
  const displayName = resolveDisplayName(logger, nk, presence);
  const result = join(state.table, joinerOf(presence, displayName), now);
  if (!result.ok) return { state, accept: false, rejectMessage: result.error };
  const connection: Connection = {
    presence: presenceOf(presence),
    displayName,
    joined: false,
    reservedAt: now,
    lastSeq: 0,
    fingerprint: null,
  };
  const reserved = withConnections({ ...state, table: result.state }, setConnection(state.connections, connection));
  return { state: publish(dispatcher, reserved, now), accept: true };
}

export function matchJoin(
  _ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  dispatcher: Dispatcher,
  _tick: number,
  state: TableMatchState,
  presences: nkruntime.Presence[],
): { state: TableMatchState } {
  const now = Date.now();
  let next = state;
  for (const presence of presences) next = admit(dispatcher, next, presence, now);
  return { state: publish(dispatcher, syncRoster(next), now) };
}

export function matchLeave(
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: Dispatcher,
  _tick: number,
  state: TableMatchState,
  presences: nkruntime.Presence[],
): { state: TableMatchState } {
  const now = Date.now();
  let next = state;
  for (const presence of presences) {
    next = recordLeaver(nk, logger, syncRoster(next), presence, now);
    next = release(next, presence.sessionId, now);
  }
  return { state: publish(dispatcher, next, now) };
}

/** Messages → intents, then timers and bots, then per-session snapshots. Returns null to end the match. */
export function matchLoop(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: Dispatcher,
  _tick: number,
  state: TableMatchState,
  messages: nkruntime.MatchMessage[],
): { state: TableMatchState } | null {
  const now = Date.now();
  let next = expireReservations(state, now);
  for (const message of messages) next = handleMessage(nk, dispatcher, next, message, now);
  next = publish(dispatcher, { ...next, table: advance(next.table, now) }, now);
  next = recordFinished(nk, logger, syncRoster(next), now);
  const reason = terminationReason(next, now);
  if (reason !== null) {
    logger.info('Closing table: %s', reason);
    releaseRoomCode(ctx, logger, nk, next);
    return null;
  }
  return { state: next };
}

/** Best effort within `graceSeconds`; the cleanup also runs when `matchLoop` closes the table. */
export function matchTerminate(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  _dispatcher: Dispatcher,
  _tick: number,
  state: TableMatchState,
  _graceSeconds: number,
): { state: TableMatchState } {
  releaseRoomCode(ctx, logger, nk, state);
  return { state };
}

/**
 * A closing private table deletes its code mapping, only while the mapping
 * still points at this match (a reused code stays). Idempotent, so running
 * from both `matchLoop` and `matchTerminate` is safe; never throws. If it
 * never runs, `join_by_code` finds the dead match and removes the record.
 */
function releaseRoomCode(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, state: TableMatchState): void {
  const room = roomOf(state.table);
  if (room === null) return;
  if (!ctx.matchId) {
    logger.warn('Room code cleanup skipped: no match id in context');
    return;
  }
  deleteCodeIfOwned(nk, logger, room.code, ctx.matchId);
}

/**
 * Server-only queries from RPCs (see `src/social/matchSignal.ts`): answers
 * `'yes'` or `'no'` and never changes the state.
 */
export function matchSignal(
  _ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  _dispatcher: Dispatcher,
  _tick: number,
  state: TableMatchState,
  data: string,
): { state: TableMatchState; data?: string } {
  return { state, data: answerSignal(state.table, data) };
}

/** The recent-players bookkeeping; missing in match state saved before it existed. */
function gameRosterOf(state: TableMatchState): GameRoster {
  return {
    gameKey: state.gameKey ?? null,
    roster: state.roster ?? [],
    recentWritten: state.recentWritten ?? [],
    statsWritten: state.statsWritten ?? [],
  };
}

function withGameRoster(state: TableMatchState, current: GameRoster): TableMatchState {
  return {
    ...state,
    gameKey: current.gameKey,
    roster: current.roster,
    recentWritten: current.recentWritten,
    statsWritten: current.statsWritten,
  };
}

/** Starts a new roster when a game starts and appends humans who sat down since (takeovers). */
function syncRoster(state: TableMatchState): TableMatchState {
  const current = gameRosterOf(state);
  const next = trackRoster(current, state.table);
  return next === current && state.roster !== undefined ? state : withGameRoster(state, next);
}

/**
 * A seated human's seat session leaves while the game runs: the game ends for
 * them now, so their recent-players record gets it (once: a reconnecting
 * leaver is not written again). Their entry lacks anyone who sits down later.
 */
function recordLeaver(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  state: TableMatchState,
  presence: nkruntime.Presence,
  now: number,
): TableMatchState {
  const phase = state.table.phase;
  if (phase !== 'playing' && phase !== 'between') return state;
  const found = findHumanSeat(state.table, presence.userId);
  if (!found || found.seat.sessionId !== presence.sessionId) return state;
  const current = gameRosterOf(state);
  if (!needsRecentWrite(current, presence.userId)) return state;
  writeRecentTable(nk, logger, presence.userId, current.roster, now);
  return withGameRoster(state, markRecentWritten(current, [presence.userId]));
}

/** Once the game is finished, every roster member not written yet gets it in their record. */
function recordFinished(nk: nkruntime.Nakama, logger: nkruntime.Logger, state: TableMatchState, now: number): TableMatchState {
  if (state.table.phase !== 'finished') return state;
  const original = gameRosterOf(state);
  let current = original;
  const pending = unwrittenMembers(current);
  if (pending.length > 0) {
    for (const entry of pending) writeRecentTable(nk, logger, entry.userId, current.roster, now);
    current = markRecentWritten(current, pending.map((entry) => entry.userId));
  }

  // Competitive results are their own ledger, written at the finish. Every
  // human seat gets one, leavers included: a leaver's seat stays human and is
  // reserved with `sessionId: null` while a bot drives it, so the seat decides,
  // not the socket. Only bot seats and seats without a userId are skipped.
  const game = state.table.game;
  if (game !== null) {
    const attempted: string[] = [];
    for (let seat = 0; seat < state.table.seats.length; seat++) {
      const slot = state.table.seats[seat];
      if (!slot || slot.kind !== 'human') continue;
      const userId = slot.userId;
      if (typeof userId !== 'string' || userId.length === 0) continue;
      if (!needsStatsWrite(current, userId)) continue;
      const result = competitiveResultFor(game, seat);
      if (result === null) continue;
      recordCompetitiveResult(nk, logger, userId, result, now);
      // Marked even when the write failed: this runs on every tick while the
      // phase stays 'finished', and an unmarked failure would retry a broken
      // storage call at 1 Hz for the life of the match. One attempt per player
      // per game; a storage fault costs that player this game's result.
      attempted.push(userId);
    }
    if (attempted.length > 0) current = markStatsWritten(current, attempted);
  }

  return current === original ? state : withGameRoster(state, current);
}

/**
 * Runs `tick` until nothing more is due. The core does at most one action per
 * call, so a single call per 1 Hz loop could fall a tick behind (e.g. backfill
 * and the first bot turn). Each action schedules the next one in the future,
 * so this settles in a step or two; the cap only guards against a core bug.
 */
export function advance(table: TableState, now: number): TableState {
  let current = table;
  for (let step = 0; step < MAX_TICK_STEPS; step++) {
    const next = tick(current, now);
    if (next === current) return current;
    current = next;
  }
  return current;
}

function handleMessage(
  nk: nkruntime.Nakama,
  dispatcher: Dispatcher,
  state: TableMatchState,
  message: nkruntime.MatchMessage,
  now: number,
): TableMatchState {
  const decoded = decodePayload(nk, message.data);
  if (!decoded.ok) {
    sendError(dispatcher, message.sender, 'bad_payload');
    return state;
  }
  if (message.opCode === OpCode.EMOTE) return handleEmote(dispatcher, state, message.sender, decoded.payload, now);
  const result = intent(state.table, message.sender, message.opCode, decoded.payload, now);
  if (!result.ok) {
    sendError(dispatcher, message.sender, result.error);
    return state;
  }
  return { ...state, table: result.state };
}

/** Emotes skip the table core's state: validate, apply the per-seat cooldown, then relay to every seated session. */
function handleEmote(
  dispatcher: Dispatcher,
  state: TableMatchState,
  sender: ConnectionPresence,
  payload: unknown,
  now: number,
): TableMatchState {
  // Older match state (before emotes shipped) has no emoteAt.
  const emoteAt = state.emoteAt ?? {};
  const seat = findHumanSeat(state.table, sender.userId);
  const result = emote(state.table, sender, payload, seat ? emoteAt[String(seat.index)] : undefined, now);
  if (!result.ok) {
    sendError(dispatcher, sender, result.error);
    return state;
  }
  if (!result.shown) return state;
  broadcastEmote(dispatcher, state, result.shown);
  return { ...state, emoteAt: { ...emoteAt, [String(result.shown.seat)]: now } };
}

function broadcastEmote(dispatcher: Dispatcher, state: TableMatchState, shown: EmoteShown): void {
  const targets: ConnectionPresence[] = [];
  for (const key of Object.keys(state.connections)) {
    const connection = state.connections[key];
    if (!connection || !connection.joined) continue;
    const found = findHumanSeat(state.table, connection.presence.userId);
    if (found && found.seat.sessionId === connection.presence.sessionId) targets.push(connection.presence);
  }
  if (targets.length > 0) dispatcher.broadcastMessage(OpCode.EMOTE_SHOWN, JSON.stringify(shown), targets);
}

type Decoded = { readonly ok: true; readonly payload: unknown } | { readonly ok: false };

/** Untrusted bytes → JSON value. An empty body (BACK) decodes to null. */
export function decodePayload(nk: nkruntime.Nakama, data: ArrayBuffer | null | undefined): Decoded {
  if (data === null || data === undefined) return { ok: true, payload: null };
  if (data.byteLength > MAX_MESSAGE_BYTES) return { ok: false };
  const text = nk.binaryToString(data);
  if (text.length === 0) return { ok: true, payload: null };
  try {
    return { ok: true, payload: JSON.parse(text) };
  } catch (_error) {
    return { ok: false };
  }
}

/** Completes a join: confirms the seat for this session and drops older sessions of the same user. */
function admit(dispatcher: Dispatcher, state: TableMatchState, presence: nkruntime.Presence, now: number): TableMatchState {
  const reservation = state.connections[presence.sessionId];
  // Nakama only joins presences the join attempt accepted, which checked the
  // room code. Should a newcomer still arrive with no reservation (it expired,
  // or a runtime quirk), it never had its code checked here: kick it.
  if (reservation === undefined && !isRoomInsider(state.table, presence.userId)) {
    dispatcher.matchKick([presence]);
    return state;
  }
  // The name was looked up by the join attempt; no second DB call here.
  const displayName = reservation?.displayName ?? fallbackName(presence);
  const result = join(state.table, joinerOf(presence, displayName), now);
  if (!result.ok) {
    // The reservation expired and the seat was taken meanwhile.
    sendError(dispatcher, presence, result.error);
    dispatcher.matchKick([presence]);
    return state;
  }
  const stale = sessionsOf(state, presence.userId).filter((c) => c.presence.sessionId !== presence.sessionId);
  if (stale.length > 0) dispatcher.matchKick(stale.map((c) => c.presence));
  const connection: Connection = {
    presence: presenceOf(presence),
    displayName,
    joined: true,
    reservedAt: now,
    lastSeq: 0,
    fingerprint: null,
  };
  return withConnections({ ...state, table: result.state }, setConnection(state.connections, connection));
}

/** A session is gone: the core frees or hands the seat to a bot (it ignores stale sessions). */
function release(state: TableMatchState, sessionId: string, now: number): TableMatchState {
  const connection = state.connections[sessionId];
  if (!connection) return state;
  const connections: { [sessionId: string]: Connection } = {};
  for (const key of Object.keys(state.connections)) {
    const other = state.connections[key];
    if (key !== sessionId && other) connections[key] = other;
  }
  return withConnections({ ...state, table: leave(state.table, connection.presence, now) }, connections);
}

function expireReservations(state: TableMatchState, now: number): TableMatchState {
  let next = state;
  for (const key of Object.keys(state.connections)) {
    const connection = state.connections[key];
    if (connection && !connection.joined && now - connection.reservedAt > JOIN_TIMEOUT_MS) {
      next = release(next, key, now);
    }
  }
  return next;
}

/**
 * Sends each joined session its own snapshot, only when its projection
 * changed, and updates the label when it changed. A session whose seat now
 * belongs to a newer session of the same user gets nothing. On a private
 * table a standing member's current session gets the `seat: -1` snapshot.
 */
function publish(dispatcher: Dispatcher, state: TableMatchState, now: number): TableMatchState {
  const connections: { [sessionId: string]: Connection } = {};
  for (const key of Object.keys(state.connections)) {
    const connection = state.connections[key];
    if (connection) connections[key] = sendSnapshot(dispatcher, state.table, connection, now);
  }
  const labelText = labelOf(state.table);
  if (labelText !== state.label) dispatcher.matchLabelUpdate(labelText);
  return trackEmpty({ ...state, connections, label: labelText }, now);
}

function sendSnapshot(dispatcher: Dispatcher, table: TableState, connection: Connection, now: number): Connection {
  if (!connection.joined) return connection;
  const snapshot = snapshotOf(table, connection, now);
  if (snapshot === null) return connection;
  const fingerprint = snapshotFingerprint(table.seq, snapshot);
  if (fingerprint === connection.fingerprint) return connection;
  dispatcher.broadcastMessage(OpCode.SNAPSHOT, JSON.stringify(snapshot), [connection.presence]);
  return { ...connection, lastSeq: table.seq, fingerprint };
}

/**
 * The snapshot this session should get, or null for none: the seat holder's
 * own session gets its seat's projection; otherwise, on a private table, the
 * member's current session gets the member projection (a standing member,
 * since a seated one was matched above). Both checks pin the sessionId, so an
 * older session of the same user gets nothing.
 */
function snapshotOf(table: TableState, connection: Connection, now: number): Snapshot | null {
  const { userId, sessionId } = connection.presence;
  const found = findHumanSeat(table, userId);
  if (found) return found.seat.sessionId === sessionId ? snapshotFor(table, found.index, connection.lastSeq, now) : null;
  const room = roomOf(table);
  if (room === null) return null;
  const member = findMember(room, userId);
  if (member === null || member.member.sessionId !== sessionId) return null;
  return snapshotForMember(table, userId, connection.lastSeq, now);
}

/**
 * What decides whether a session needs a new snapshot. The log is excluded (a
 * new entry always moves `seq`, which is part of the fingerprint) and so is
 * `serverTime`, which changes on every loop and would defeat change-only sending.
 */
export function snapshotFingerprint(seq: number, snapshot: Snapshot): string {
  const { serverTime: _serverTime, log: _log, ...rest } = snapshot;
  return `${seq}:${canonicalJson(rest)}`;
}

function sendError(dispatcher: Dispatcher, to: ConnectionPresence, code: ErrorCode): void {
  const payload: ErrorPayload = { code };
  dispatcher.broadcastMessage(OpCode.ERROR, JSON.stringify(payload), [presenceOf(to)]);
}

function trackEmpty(state: TableMatchState, now: number): TableMatchState {
  const occupied = Object.keys(state.connections).length > 0;
  if (occupied) return state.emptySince === null ? state : { ...state, emptySince: null };
  return state.emptySince === null ? { ...state, emptySince: now } : state;
}

/**
 * Why the match should end now, or null to keep it running. A finished
 * private table never lingers out: the core returns it to its room after
 * `ROOM_RESET_MS`. Only the empty-table close applies to it.
 */
export function terminationReason(state: TableMatchState, now: number): string | null {
  const finishedAt = state.table.finishedAt;
  const isPrivate = roomOf(state.table) !== null;
  if (!isPrivate && finishedAt !== null && now - finishedAt >= LINGER_AFTER_FINISH_MS) return 'finished';
  if (state.emptySince !== null && now - state.emptySince >= EMPTY_TIMEOUT_MS) return 'empty';
  return null;
}

function sessionsOf(state: TableMatchState, userId: string): Connection[] {
  const found: Connection[] = [];
  for (const key of Object.keys(state.connections)) {
    const connection = state.connections[key];
    if (connection && connection.presence.userId === userId) found.push(connection);
  }
  return found;
}

function setConnection(
  connections: TableMatchState['connections'],
  connection: Connection,
): { [sessionId: string]: Connection } {
  const next: { [sessionId: string]: Connection } = { ...connections };
  next[connection.presence.sessionId] = connection;
  return next;
}

function withConnections(state: TableMatchState, connections: TableMatchState['connections']): TableMatchState {
  return { ...state, connections };
}

function presenceOf(presence: ConnectionPresence): ConnectionPresence {
  return { userId: presence.userId, sessionId: presence.sessionId, username: presence.username, node: presence.node };
}

function joinerOf(presence: nkruntime.Presence, name: string): Joiner {
  return { userId: presence.userId, sessionId: presence.sessionId, name };
}

/**
 * The account's display_name, else the username, else 'Player'. Trimming and
 * capping stay in the core's `cleanName`. A failed lookup never rejects a join.
 */
function resolveDisplayName(logger: nkruntime.Logger, nk: nkruntime.Nakama, presence: nkruntime.Presence): string {
  try {
    const user = nk.usersGetId([presence.userId])[0];
    if (user && typeof user.displayName === 'string' && user.displayName.trim().length > 0) return user.displayName;
  } catch (error) {
    logger.warn('Display name lookup failed for %s, using username: %s', presence.userId, String(error));
  }
  return fallbackName(presence);
}

function fallbackName(presence: nkruntime.Presence): string {
  return presence.username.trim().length > 0 ? presence.username : 'Player';
}

/**
 * Reject message for a private-table newcomer without the right code. Same
 * text as a dead code from `join_by_code`, so a match id found by listing
 * matches gives no oracle.
 */
const ROOM_DENIED = 'room_not_found';

/**
 * Whether this user may enter. Public tables: always (metadata ignored).
 * Private tables: a member or seat holder (reconnect, second device) always;
 * a newcomer only with `metadata[ROOM_JOIN_CODE_KEY]` equal to the room code.
 * Neither code is ever logged.
 */
function mayEnterRoom(table: TableState, userId: string, metadata: { [key: string]: unknown } | null | undefined): boolean {
  const room = roomOf(table);
  if (room === null || isRoomInsider(table, userId)) return true;
  const supplied = metadata ? metadata[ROOM_JOIN_CODE_KEY] : undefined;
  return typeof supplied === 'string' && normalizeRoomCode(supplied) === room.code;
}

/** True on a public table; on a private one, true for a member or a seat holder. */
function isRoomInsider(table: TableState, userId: string): boolean {
  const room = roomOf(table);
  return room === null || findMember(room, userId) !== null || findHumanSeat(table, userId) !== null;
}

/**
 * The room code for a private table, or null for a public one. A private
 * request with a missing or malformed code falls back to a public table
 * (logged, without the value): only server code calls `matchCreate`, so this
 * is a bug, never client input.
 */
function privateCodeOf(logger: nkruntime.Logger, params: { [key: string]: unknown } | null | undefined): string | null {
  if (!params || (params.private !== 'true' && params.private !== true)) return null;
  const code = params.code;
  if (typeof code === 'string' && isRoomCode(code)) return code;
  logger.error('matchInit: private table requested without a valid room code; creating a public table');
  return null;
}

function labelOf(table: TableState): string {
  return JSON.stringify(label(table));
}

/**
 * JSON with object keys sorted. Nakama hands match state back through Go maps
 * between calls, so key order is not stable and plain `JSON.stringify` would
 * make every fingerprint look new.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const record: { [key: string]: unknown } = { ...value };
    const keys = Object.keys(record).filter((key) => record[key] !== undefined).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
