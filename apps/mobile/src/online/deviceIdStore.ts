import type { CreateDeviceIdStore } from './deviceId';

/**
 * Fallback for platforms without a `deviceIdStore.<platform>.ts`. Metro picks
 * the `.ios`, `.android` or `.web` sibling, so this file mainly gives tsc the
 * shared signature (see `deviceId.ts`). It fails loudly rather than keep the
 * guest credential somewhere that would not survive a restart.
 */
export const createDeviceIdStore: CreateDeviceIdStore = () => {
  throw new Error('createDeviceIdStore: no device id store for this platform');
};
