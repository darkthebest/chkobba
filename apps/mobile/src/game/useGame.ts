import { useSyncExternalStore } from 'react';

import type { GameClient, GameSnapshot } from './GameClient';

export function useGame(client: GameClient): GameSnapshot {
  return useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
}
