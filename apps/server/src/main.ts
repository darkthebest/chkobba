import { applyCut, applyMove, chooseCut, createBot, createGame, startNextRound, viewFor, type GameState } from '@chkobba/rules';
import { DIRECTORY_COLLECTION, DIRECTORY_INDEX_NAME, SEARCH_INDEX_MAX_ENTRIES } from '@chkobba/protocol';
import {
  TABLE_MATCH_NAME,
  matchInit,
  matchJoin,
  matchJoinAttempt,
  matchLeave,
  matchLoop,
  matchSignal,
  matchTerminate,
  type TableMatchState,
} from './match/tableMatch';
import { rpcQuickMatch } from './rpc/quickMatch';
import { rpcCreatePrivateTable, rpcJoinByCode } from './rpc/privateTable';
import { afterAuthenticateDevice, afterUpdateAccount, beforeAuthenticateDevice, beforeUpdateAccount } from './account/hooks';
import { beforeAddFriends } from './social/friendHooks';
import { rpcInviteToTable } from './social/inviteToTable';
import { rpcGetPlayerProfile, rpcSearchPlayers, rpcSetPresenceVisibility } from './directory';
import { rpcReportPracticeGame } from './stats';

/**
 * Smoke RPC: plays a complete 2v2 game between Normal bots inside Nakama's
 * JavaScript runtime, proving the bundled rules engine works in goja.
 */
function rpcSmokeGame(_ctx: nkruntime.Context, _logger: nkruntime.Logger, nk: nkruntime.Nakama, _payload: string): string {
  const started = Date.now();
  const bots = [0, 1, 2, 3].map((seat) => createBot('normal', seat));
  let state: GameState = createGame({ seed: nk.uuidv4(), playerCount: 4 }).state;
  let actions = 0;
  while (state.phase !== 'gameOver') {
    if (state.phase === 'roundOver') {
      const next = startNextRound(state);
      if (!next.ok) throw new Error(next.error);
      state = next.state;
      continue;
    }
    const seat = state.turn;
    const view = viewFor(state, seat);
    const result =
      state.phase === 'cutting'
        ? applyCut(state, { seat, keep: chooseCut(bots[seat]!, view) })
        : applyMove(state, bots[seat]!.chooseMove(view));
    if (!result.ok) throw new Error(result.error);
    state = result.state;
    actions++;
  }
  return JSON.stringify({ winner: state.winner, scores: state.scores, rounds: state.round, actions, ms: Date.now() - started });
}

function InitModule(_ctx: nkruntime.Context, logger: nkruntime.Logger, _nk: nkruntime.Nakama, initializer: nkruntime.Initializer) {
  initializer.registerRpc('smoke_game', rpcSmokeGame);
  initializer.registerRpc('quick_match', rpcQuickMatch);
  initializer.registerRpc('create_private_table', rpcCreatePrivateTable);
  initializer.registerRpc('join_by_code', rpcJoinByCode);
  // Display names are server-owned: the before hook validates every account update.
  initializer.registerBeforeUpdateAccount(beforeUpdateAccount);
  initializer.registerAfterUpdateAccount(afterUpdateAccount);
  // Friend codes: a new device account's username is a fresh friend code (ADR 0003).
  initializer.registerBeforeAuthenticateDevice(beforeAuthenticateDevice);
  initializer.registerAfterAuthenticateDevice(afterAuthenticateDevice);
  // Friend requests: target cap, friend-code lookup and the 50 outgoing / 200 friends limits.
  initializer.registerBeforeAddFriends(beforeAddFriends);
  // Table invites: mutual friends only, live room, caller present, per-window and per-invite dedupe.
  initializer.registerRpc('invite_to_table', rpcInviteToTable);
  // Players directory: the claim index is the search route — the folded name lives
  // in a value field, never the key — and indexOnly stays false so a row comes
  // back as the whole claim record.
  initializer.registerStorageIndex(DIRECTORY_INDEX_NAME, DIRECTORY_COLLECTION, undefined, ['fold'], [], SEARCH_INDEX_MAX_ENTRIES, false);
  // Directory RPCs are authenticated: prefix-only search, one profile read, one prefs write.
  initializer.registerRpc('search_players', rpcSearchPlayers);
  initializer.registerRpc('get_player_profile', rpcGetPlayerProfile);
  initializer.registerRpc('set_presence_visibility', rpcSetPresenceVisibility);
  // Practice stats are device-reported and display-only: clamped, windowed and server-owned.
  initializer.registerRpc('report_practice_game', rpcReportPracticeGame);
  // Nakama resolves match handlers by global function name, so pass the identifiers directly.
  initializer.registerMatch<TableMatchState>(TABLE_MATCH_NAME, {
    matchInit,
    matchJoinAttempt,
    matchJoin,
    matchLeave,
    matchLoop,
    matchTerminate,
    matchSignal,
  });
  logger.info('Chkobba module loaded');
}

// Rollup would drop the otherwise unreferenced global; Nakama looks it up by name.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
!InitModule && InitModule.bind(null);
