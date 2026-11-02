import type { Seat } from '@chkobba/rules';
import { useEffect, useState } from 'react';

import { useT } from '@/i18n';
import { actionErrorMessage, onlineErrorMessage } from '@/online/messages';
import { roomShareLink } from '@/online/shareLink';
import { copyRoomCode, shareRoom, type ShareOutcome } from '@/online/shareRoom';

import type { GameClient, OnlineError, OnlineTablePhase, RoomMemberState, SeatInfo } from './GameClient';
import { useCountdown } from './useCountdown';
import { useGame } from './useGame';

const SEATS: readonly Seat[] = [0, 1, 2, 3];
/** How long a non-fatal server rejection (e.g. `seat_taken`) stays on screen; same as the table. */
const NOTICE_MS = 3500;
/** How long "Code copied" / "shared" feedback stays before the buttons read normally again. */
const SHARE_FEEDBACK_MS = 2500;

/** The room's lifecycle as the room screen sees it: `between` rounds still counts as a game in progress. */
export type RoomPhase = 'waiting' | 'playing' | 'finished';

export type RoomSeatKind = 'empty' | 'me' | 'human' | 'bot';

export type ShareState = 'idle' | ShareOutcome;

export interface RoomSeat {
  readonly seat: Seat;
  readonly kind: RoomSeatKind;
  /** The member's (or bot's) name; null for an empty seat. */
  readonly name: string | null;
  readonly isHost: boolean;
  /** Seats 0 and 2 are team 0, seats 1 and 3 team 1. */
  readonly team: 0 | 1;
  readonly canSit: boolean;
  readonly canTakeOver: boolean;
}

export interface RoomMemberView {
  readonly name: string;
  readonly seat: Seat | null;
  readonly isHost: boolean;
  /** The member's user id, when the server sent one (for "Add friend"). */
  readonly userId?: string;
  /** True for our own entry (`RoomState.myIndex`). */
  readonly isMe: boolean;
}

export interface RoomController {
  readonly code: string;
  /** Always 4 entries, by seat index. */
  readonly seats: readonly RoomSeat[];
  /** Members without a seat, in join order. */
  readonly standing: readonly RoomMemberView[];
  /** Every member in join order (host crown, standing list). */
  readonly members: readonly RoomMemberView[];
  readonly mySeat: Seat | null;
  readonly amHost: boolean;
  readonly phase: RoomPhase;
  /** A game is in progress (playing or between rounds). */
  readonly inGame: boolean;
  readonly canStart: boolean;
  canSit: (seat: Seat) => boolean;
  canTakeOver: (seat: Seat) => boolean;
  sit: (seat: Seat) => void;
  start: () => void;
  takeOver: (seat: Seat) => void;
  share: () => void;
  copy: () => void;
  /** Outcome of the last share/copy: `copied` shows `room.copied`, `unavailable` the selectable fallback. */
  readonly shareState: ShareState;
  /** The share link for the fallback text; null when no web base URL is configured. */
  readonly link: string | null;
  /** Whole seconds until a finished game returns to the room; null otherwise. */
  readonly resetCountdown: number | null;
  /** Team scores of the game in progress (for standing members); null while waiting. */
  readonly scores: readonly [number, number] | null;
  /** A failed sit/start/takeover, or a server rejection, localized; null when there is none. */
  readonly actionError: string | null;
}

function roomPhase(phase: OnlineTablePhase): RoomPhase {
  switch (phase) {
    case 'waiting':
      return 'waiting';
    case 'playing':
    case 'between':
      return 'playing';
    case 'finished':
      return 'finished';
  }
}

const teamOf = (seat: Seat): 0 | 1 => (seat % 2 === 0 ? 0 : 1);

interface SeatSource {
  readonly seat: Seat;
  readonly mySeat: Seat | null;
  readonly member: RoomMemberState | undefined;
  readonly player: SeatInfo | undefined;
}

/** Who sits where: room members are the humans; the snapshot's players mark the bots. */
function seatOccupant({ seat, mySeat, member, player }: SeatSource): Pick<RoomSeat, 'kind' | 'name' | 'isHost'> {
  if (member !== undefined) {
    return { kind: seat === mySeat ? 'me' : 'human', name: member.name, isHost: member.isHost };
  }
  if (player?.isBot === true) return { kind: 'bot', name: player.name, isHost: false };
  // A human the snapshot still seats but the room no longer lists (should not happen; be lenient).
  if (player !== undefined && player.name.length > 0) {
    return { kind: seat === mySeat ? 'me' : 'human', name: player.name, isHost: false };
  }
  return { kind: 'empty', name: null, isHost: false };
}

/**
 * All private-room state and actions, shared by the phone and desktop room
 * layouts (no layout code here). Returns null until the client knows the room
 * (before the first snapshot, or on a public table).
 */
export function useRoomController(client: GameClient): RoomController | null {
  const snapshot = useGame(client);
  const tr = useT();
  const online = snapshot.online;
  const room = online?.room ?? null;
  const lastError: OnlineError | null = online?.lastError ?? null;

  const [error, setError] = useState<string | null>(null);
  // A non-fatal error already there when the room mounts was meant for an earlier screen.
  const [dismissedErrorId, setDismissedErrorId] = useState(() => (lastError && !lastError.fatal ? lastError.id : 0));
  const [shareState, setShareState] = useState<ShareState>('idle');
  const notice = lastError && !lastError.fatal && lastError.id !== dismissedErrorId ? lastError : null;
  const resetClock = useCountdown(room?.resetAt ?? null);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setDismissedErrorId(notice.id), NOTICE_MS);
    return () => clearTimeout(id);
  }, [notice]);

  useEffect(() => {
    if (shareState !== 'copied' && shareState !== 'shared') return;
    const id = setTimeout(() => setShareState('idle'), SHARE_FEEDBACK_MS);
    return () => clearTimeout(id);
  }, [shareState]);

  if (online === undefined || room === null) return null;

  const { code, mySeat, amHost } = room;
  const phase = roomPhase(online.phase);
  const inGame = phase === 'playing';

  const members: RoomMemberView[] = room.members.map((member, index) => ({
    name: member.name,
    seat: member.seat,
    isHost: member.isHost,
    ...(member.userId === undefined ? {} : { userId: member.userId }),
    isMe: index === room.myIndex,
  }));

  const occupants = SEATS.map((seat) =>
    seatOccupant({
      seat,
      mySeat,
      member: room.members.find((member) => member.seat === seat),
      player: snapshot.players.find((player) => player.seat === seat),
    }),
  );
  const canSit = (seat: Seat) => phase === 'waiting' && occupants[seat]?.kind === 'empty';
  const canTakeOver = (seat: Seat) => mySeat === null && inGame && occupants[seat]?.kind === 'bot';
  const seats: RoomSeat[] = SEATS.map((seat) => ({
    seat,
    kind: occupants[seat]?.kind ?? 'empty',
    name: occupants[seat]?.name ?? null,
    isHost: occupants[seat]?.isHost ?? false,
    team: teamOf(seat),
    canSit: canSit(seat),
    canTakeOver: canTakeOver(seat),
  }));
  const humansSeated = seats.some((seat) => seat.kind === 'me' || seat.kind === 'human');

  const run = (action: (() => Promise<void>) | undefined) => {
    if (action === undefined) return;
    setError(null);
    action().catch((e: unknown) => setError(actionErrorMessage(e, tr)));
  };
  const sitIn = (seat: Seat) => {
    const sit = client.sit;
    run(sit === undefined ? undefined : () => sit.call(client, seat));
  };
  const startGame = client.startGame;
  const canStart = amHost && phase === 'waiting' && humansSeated;

  return {
    code,
    seats,
    standing: members.filter((member) => member.seat === null),
    members,
    mySeat,
    amHost,
    phase,
    inGame,
    canStart,
    canSit,
    canTakeOver,
    sit: (seat) => {
      if (canSit(seat)) sitIn(seat);
    },
    start: () => {
      if (canStart) run(startGame === undefined ? undefined : () => startGame.call(client));
    },
    takeOver: (seat) => {
      if (canTakeOver(seat)) sitIn(seat);
    },
    share: () => {
      shareRoom(code, tr).then(setShareState, () => setShareState('unavailable'));
    },
    copy: () => {
      copyRoomCode(code).then(setShareState, () => setShareState('unavailable'));
    },
    shareState,
    link: roomShareLink(code),
    resetCountdown: room.resetAt === null ? null : (resetClock?.secondsLeft ?? null),
    scores: room.scores,
    actionError: error ?? (notice ? onlineErrorMessage(notice.code, tr) : null),
  };
}
