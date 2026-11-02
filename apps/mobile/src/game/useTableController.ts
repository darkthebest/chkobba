import type { Card, CardId, DealerDraw, PlayMove, PlayerView, Seat, Team } from '@chkobba/rules';
import { useEffect, useRef, useState } from 'react';

import type { Position } from '@/components/MotionCard';
import { useT } from '@/i18n';
import { actionErrorMessage, onlineErrorMessage } from '@/online/messages';

import { badgesByCard, numberMoves, type NumberedMove } from './captureNumbers';
import { describeEvent } from './format';
import type { ConnectionState, GameClient, LogEntry, OnlineError, SeatInfo } from './GameClient';
import { useCountdown } from './useCountdown';
import { useGame } from './useGame';
import { useStagedTable, type StagedTable } from './useStagedTable';

/** Seat positions relative to the viewer. Turns go anticlockwise: bottom → right → top → left. */
const POSITIONS: Record<2 | 4, Position[]> = { 2: ['bottom', 'top'], 4: ['bottom', 'right', 'top', 'left'] };
/** Includes the capture stage: the celebration only shows once the swept cards have left. */
const CELEBRATION_MS = 2900;
/** How long the dealer draw stays up before the game carries on by itself. */
const INTRO_MS = 2600;
/** Two taps on the same hand card within this window are a double-tap (a common OS double-click window). */
const DOUBLE_TAP_MS = 500;
/** Presses closer together than this are one touch reported twice (seen with web touch emulation); ignore them. */
const DUPLICATE_PRESS_MS = 40;
/** How long a non-fatal server rejection (e.g. "not your turn") stays on screen. */
const NOTICE_MS = 3500;

export interface Celebration {
  seq: number;
  byName: string;
  side: 'us' | 'them';
}

/** The most recently played card and its seat, to animate it in from that side. */
function lastPlay(log: readonly LogEntry[]) {
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i]!.event;
    if (e.type === 'cardPlayed') return { id: e.card.id, seat: e.seat };
  }
  return null;
}

/** The most recent card placed (not capturing) that is still on the table, and who placed it. */
function lastPlaced(log: readonly LogEntry[], table: readonly Card[], players: readonly SeatInfo[]) {
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i]!.event;
    if (e.type === 'roundStarted') return null;
    if (e.type !== 'cardPlayed') continue;
    if (e.captured.length > 0) return null;
    if (!table.some((c) => c.id === e.card.id)) return null;
    return { id: e.card.id, by: players[e.seat]?.name ?? '' };
  }
  return null;
}

/** The game-start draw for dealer, if this game began with one. */
function findDealerDraw(log: readonly LogEntry[]): { draws: readonly (readonly DealerDraw[])[]; dealer: Seat } | null {
  const first = log.find((entry) => entry.event.type === 'dealerDrawn')?.event;
  return first?.type === 'dealerDrawn' ? { draws: first.draws, dealer: first.dealer } : null;
}

/** Another human at an online table, whose player sheet (friend state, Block) can open. */
export interface PlayerSheetTarget {
  readonly seat: Seat;
  readonly userId: string;
  readonly name: string;
}

/**
 * The player sheet target for `seat`: only another human with a user id. Bots,
 * empty seats, our own seat and offline games (no user ids) have none.
 */
export function playerSheetTarget(players: readonly SeatInfo[], mySeat: number, seat: number): PlayerSheetTarget | null {
  if (seat === mySeat) return null;
  const player = players[seat];
  if (!player || player.isBot || !player.userId) return null;
  return { seat: player.seat, userId: player.userId, name: player.name };
}

/** The running turn clock of an online game (absent offline). */
export interface TurnTimer {
  /** Whose clock it is: the player to move, or the cutter. */
  seat: Seat;
  /** Remaining share of the turn, 1 → 0. */
  progress: number;
  /** Whole seconds left; null for the first instant before the clock is measured. */
  secondsLeft: number | null;
}

/** Who holds the clock: the cutter while cutting, the player to move while playing. */
function timedSeat(view: PlayerView): Seat | null {
  if (view.phase === 'cutting') return view.cut?.seat ?? null;
  if (view.phase === 'playing') return view.turn;
  return null;
}

export interface TableController {
  view: PlayerView;
  players: readonly SeatInfo[];
  log: readonly LogEntry[];
  mySeat: number;
  myTeam: Team;
  theirTeam: Team;
  myTurn: boolean;
  /** Easy: show capture options, badges and previews. Otherwise the player picks table cards themselves. */
  hints: boolean;
  selectedId: CardId | null;
  /** Table cards picked so far towards a capture (no-hints mode). */
  picked: readonly CardId[];
  /** The card to shake after a move that cannot be played; `seq` restarts the shake. */
  shake: { id: CardId; seq: number } | null;
  /** Moves for the selected card (empty when nothing is selected). */
  selectedMoves: readonly PlayMove[];
  /** Selected card's moves, or the hovered card's on desktop; drives the table badges (empty without hints). */
  previewMoves: readonly NumberedMove[];
  badges: Map<CardId, number[]>;
  staged: StagedTable;
  latestPlay: { id: CardId; seat: number } | null;
  lastPlaced: { id: CardId; by: string } | null;
  celebration: Celebration | null;
  waitingFor: string | null;
  error: string | null;
  /** True once a finished round's summary should be shown (after the last capture animates). */
  showSummary: boolean;
  /** Who is cutting this round, and the cut card when it is us. */
  cutting: { seat: Seat; card: Card | null } | null;
  iAmCutting: boolean;
  /** The dealer draw to show as an intro (null once dismissed or when there was none). */
  intro: { draws: readonly (readonly DealerDraw[])[]; dealer: Seat } | null;
  dismissIntro: () => void;
  cut: (keep: boolean) => void;
  positionOf: (seat: number) => Position;
  /** The last `count` readable log lines, oldest first. */
  logLines: (count: number) => string[];
  select: (id: CardId | null) => void;
  hover: (id: CardId | null) => void;
  play: (move: PlayMove) => void;
  pressHandCard: (card: Card) => void;
  pressTableCard: (card: Card) => void;
  /** A press on the mat outside any card: places the selected card when that is legal. */
  pressMat: () => void;
  nextRound: () => void;
  /** Online only: the turn clock, or null when nobody is on the clock. */
  turnTimer: TurnTimer | null;
  /** Online only: the turn ring share for `seat` (undefined when that seat is not on the clock). */
  progressOf: (seat: number) => number | undefined;
  /** Online only: link state; undefined for local games. */
  connection: ConnectionState | undefined;
  /** Online only: the server starts the next round by itself; `secondsLeft` is null when unknown. */
  autoNextRound: { secondsLeft: number | null } | null;
  /** Online only: an error the client gave up on (the table cannot be rejoined). */
  fatalError: string | null;
  /** Online only: the server marked our seat away and a bot plays our turns; false offline. */
  away: boolean;
  /** Online only: tells the server we are back (no-op when not away or offline). */
  imBack: () => void;
  /** The seat whose player sheet is open, or null. Closes by itself if that seat changes hands. */
  playerSheetSeat: number | null;
  /** Who the open player sheet is about (null when closed). */
  playerSheet: PlayerSheetTarget | null;
  /** True when tapping `seat` opens a player sheet (another human at an online table). */
  canOpenPlayerSheet: (seat: number) => boolean;
  /** Opens the player sheet for `seat`; ignored for bots, empty seats, ourselves and offline games. */
  openPlayerSheet: (seat: number) => void;
  closePlayerSheet: () => void;
}

/** All table state and actions, shared by the phone and desktop layouts. */
export function useTableController(client: GameClient): TableController {
  const snapshot = useGame(client);
  const { view, log } = snapshot;
  const [selectedId, setSelectedId] = useState<CardId | null>(null);
  const [hoveredId, setHoveredId] = useState<CardId | null>(null);
  const [picked, setPicked] = useState<CardId[]>([]);
  const [shake, setShake] = useState<{ id: CardId; seq: number } | null>(null);
  const tr = useT();
  const [error, setError] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  // Show the dealer draw only for a brand-new game (no card played yet).
  const [introVisible, setIntroVisible] = useState(
    () => findDealerDraw(log) !== null && !log.some((entry) => entry.event.type === 'cardPlayed'),
  );
  const lastTap = useRef<{ id: CardId; at: number } | null>(null);
  // Remembers who was tapped, so the sheet closes if someone else takes that seat.
  const [sheetFor, setSheetFor] = useState<{ seat: number; userId: string } | null>(null);
  const { turnDeadline, connection, online } = snapshot;
  const lastError: OnlineError | null = online?.lastError ?? null;
  // A non-fatal error already there when the table mounts was meant for an earlier screen.
  const [dismissedErrorId, setDismissedErrorId] = useState(() => (lastError && !lastError.fatal ? lastError.id : 0));

  const mySeat = client.seat;
  // Our own seat reads "You" everywhere (dealer, log, celebrations), whatever the account name.
  const players = snapshot.players.map((p) => (p.seat === mySeat ? { ...p, name: tr('common.you') } : p));
  const myTeam = (mySeat % 2) as Team;
  const theirTeam = (1 - myTeam) as Team;
  const myTurn = view.phase === 'playing' && view.turn === mySeat;
  const hints = client.captureHints === true;
  const movesFor = (id: CardId | null) => (myTurn && id ? view.legalMoves.filter((m) => m.cardId === id) : []);
  const selectedMoves = movesFor(selectedId);
  const previewMoves = hints ? numberMoves(selectedMoves.length > 0 ? selectedMoves : movesFor(hoveredId)) : [];
  // Picks only count for the card they were made with.
  const livePicks = selectedMoves.length > 0 ? picked : [];
  const staged = useStagedTable(view.table, log);
  const clockSeat = turnDeadline === null || turnDeadline === undefined ? null : timedSeat(view);
  // Keyed by seat and latest event, so each turn's ring starts full even when deadlines are close.
  const turnClock = useCountdown(clockSeat === null ? null : turnDeadline, `${clockSeat}:${log[log.length - 1]?.seq ?? 0}`);
  const nextRoundClock = useCountdown(online?.phase === 'between' ? online.nextRoundAt : null);
  const sheetTarget = sheetFor ? playerSheetTarget(players, mySeat, sheetFor.seat) : null;
  const playerSheet = sheetTarget && sheetTarget.userId === sheetFor?.userId ? sheetTarget : null;
  const notice = lastError && !lastError.fatal && lastError.id !== dismissedErrorId ? lastError : null;

  // Celebrate chkobbas that happen while this table is on screen (never replay old ones).
  const seenSeq = useRef(log[log.length - 1]?.seq ?? 0);
  useEffect(() => {
    const fresh = log.filter((entry) => entry.seq > seenSeq.current);
    if (fresh.length === 0) return;
    seenSeq.current = fresh[fresh.length - 1]!.seq;
    const sweep = [...fresh].reverse().find((entry) => entry.event.type === 'cardPlayed' && entry.event.chkobba);
    if (!sweep || sweep.event.type !== 'cardPlayed') return;
    const { seat } = sweep.event;
    setCelebration({ seq: sweep.seq, byName: players[seat]?.name ?? '', side: seat % 2 === myTeam ? 'us' : 'them' });
  }, [log, players, myTeam]);
  useEffect(() => {
    if (!celebration) return;
    const id = setTimeout(() => setCelebration(null), CELEBRATION_MS);
    return () => clearTimeout(id);
  }, [celebration]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setDismissedErrorId(notice.id), NOTICE_MS);
    return () => clearTimeout(id);
  }, [notice]);

  useEffect(() => {
    if (!introVisible) return;
    const id = setTimeout(() => setIntroVisible(false), INTRO_MS);
    return () => clearTimeout(id);
  }, [introVisible]);

  const away = players[mySeat]?.away === true;
  // Hand interactions announce us back automatically, but only once per away episode.
  const autoBackSent = useRef(false);
  useEffect(() => {
    if (!away) autoBackSent.current = false;
  }, [away]);
  const imBack = () => {
    if (!away || !client.back) return;
    setError(null);
    client.back().catch((e: unknown) => {
      autoBackSent.current = false;
      setError(actionErrorMessage(e, tr));
    });
  };
  const autoBack = () => {
    if (!away || autoBackSent.current) return;
    autoBackSent.current = true;
    imBack();
  };

  const shakeCard = (id: CardId) => setShake((prev) => ({ id, seq: (prev?.seq ?? 0) + 1 }));
  const selectHandCard = (id: CardId | null) => {
    setSelectedId(id);
    setPicked([]);
  };

  const play = (move: PlayMove) => {
    setSelectedId(null);
    setPicked([]);
    setHoveredId(null);
    setError(null);
    client.play(move.cardId, move.capture).catch((e: unknown) => setError(actionErrorMessage(e, tr)));
  };

  return {
    view,
    players,
    log,
    mySeat,
    myTeam,
    theirTeam,
    myTurn,
    hints,
    selectedId: selectedMoves.length > 0 ? selectedId : null,
    picked: livePicks,
    shake,
    selectedMoves,
    previewMoves,
    badges: badgesByCard(previewMoves),
    staged,
    latestPlay: lastPlay(log),
    lastPlaced: lastPlaced(log, view.table, players),
    celebration: celebration && !staged.staging ? celebration : null,
    waitingFor: view.phase === 'playing' && !myTurn ? (players[view.turn]?.name ?? null) : null,
    error: error ?? (notice ? onlineErrorMessage(notice.code, tr) : null),
    showSummary: (view.phase === 'roundOver' || view.phase === 'gameOver') && !staged.staging,
    cutting: view.cut ? { seat: view.cut.seat, card: view.cut.card } : null,
    iAmCutting: view.cut?.seat === mySeat,
    intro: introVisible ? findDealerDraw(log) : null,
    dismissIntro: () => setIntroVisible(false),
    cut: (keep) => {
      setError(null);
      client.cut(keep).catch((e: unknown) => setError(actionErrorMessage(e, tr)));
    },
    positionOf: (seat) => POSITIONS[view.playerCount][(seat - mySeat + view.playerCount) % view.playerCount]!,
    logLines: (count) =>
      log
        .map((entry) => describeEvent(entry.event, players, mySeat, tr))
        .filter((line): line is string => line !== null)
        .slice(-count),
    select: (id) => {
      if (id !== null) autoBack();
      selectHandCard(myTurn ? id : null);
    },
    hover: (id) => {
      if (id !== null) autoBack();
      setHoveredId(id);
    },
    play,
    pressHandCard: (card) => {
      autoBack();
      if (!myTurn) return;
      const now = Date.now();
      const tap = lastTap.current;
      if (tap && tap.id === card.id && now - tap.at < DUPLICATE_PRESS_MS) return;
      lastTap.current = { id: card.id, at: now };
      if (tap && tap.id === card.id && now - tap.at < DOUBLE_TAP_MS) {
        // The second tap of a double-tap never deselects. It plays at once when there is nothing to
        // choose: the only move with hints, otherwise only a placement (captures are picked on the table).
        const moves = movesFor(card.id);
        const quick = hints ? (moves.length === 1 ? moves[0] : undefined) : moves.find((m) => m.capture.length === 0);
        lastTap.current = null;
        if (quick) play(quick);
        else selectHandCard(card.id);
        return;
      }
      selectHandCard(selectedId === card.id ? null : card.id);
    },
    pressTableCard: (card) => {
      if (selectedMoves.length === 0) return;
      if (hints) {
        const matches = selectedMoves.filter((m) => m.capture.includes(card.id));
        if (matches.length === 1) play(matches[0]!);
        return;
      }
      if (livePicks.includes(card.id)) {
        setPicked(livePicks.filter((id) => id !== card.id));
        return;
      }
      const next = [...livePicks, card.id];
      // Card values are positive, so no legal capture contains another one: the first exact match is the move.
      const exact = selectedMoves.find((m) => m.capture.length === next.length && next.every((id) => m.capture.includes(id)));
      if (exact) play(exact);
      else if (selectedMoves.some((m) => next.every((id) => m.capture.includes(id)))) setPicked(next);
      else {
        setPicked([]);
        shakeCard(card.id);
      }
    },
    pressMat: () => {
      if (selectedId === null || selectedMoves.length === 0) return;
      const place = selectedMoves.find((m) => m.capture.length === 0);
      if (place) play(place);
      else shakeCard(selectedId);
    },
    nextRound: () => {
      client.nextRound().catch((e: unknown) => setError(actionErrorMessage(e, tr)));
    },
    turnTimer:
      clockSeat !== null && turnClock ? { seat: clockSeat, progress: turnClock.fraction, secondsLeft: turnClock.secondsLeft } : null,
    progressOf: (seat) => (clockSeat === seat && turnClock ? turnClock.fraction : undefined),
    connection,
    autoNextRound: online ? { secondsLeft: nextRoundClock?.secondsLeft ?? null } : null,
    fatalError: lastError?.fatal ? onlineErrorMessage(lastError.code, tr) : null,
    away,
    imBack,
    playerSheetSeat: playerSheet?.seat ?? null,
    playerSheet,
    canOpenPlayerSheet: (seat) => playerSheetTarget(players, mySeat, seat) !== null,
    openPlayerSheet: (seat) => {
      const target = playerSheetTarget(players, mySeat, seat);
      if (target) setSheetFor({ seat: target.seat, userId: target.userId });
    },
    closePlayerSheet: () => setSheetFor(null),
  };
}
