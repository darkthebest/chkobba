/**
 * The guest credential's format and the `DeviceIdStore` port, shared by the
 * per-platform stores.
 *
 * Module layout (platform resolution):
 * - `deviceIdStore.ios.ts`, `.android.ts` and `.web.ts` each export
 *   `createDeviceIdStore`. Metro picks the file for the platform being bundled,
 *   and jest-expo's default preset resolves like iOS.
 * - `deviceIdStore.ts` is what tsc sees for `./deviceIdStore` (tsc knows no
 *   platform extensions). It has the same export and throws if no platform
 *   file matched.
 * - Shared pieces live here, not in `deviceIdStore.ts`: from a platform file,
 *   `./deviceIdStore` would resolve back to that file itself.
 *
 * Import `createDeviceIdStore` from `./deviceIdStore` and everything else from here.
 */

/** Where the guest credential lives; one implementation per platform. */
export interface DeviceIdStore {
  /** The durable id, or null if none yet. */
  load(): Promise<string | null>;
  /** Persists an id the caller created (or migrated). Rejects a malformed id. */
  save(id: string): Promise<void>;
}

/** What each `deviceIdStore.<platform>.ts` exports as `createDeviceIdStore`. */
export type CreateDeviceIdStore = () => DeviceIdStore;

/** The storage key for the id, kept from the AsyncStorage era so web guests keep theirs. */
export const DEVICE_ID_KEY = 'chkobba.online.deviceId';

/** Prefix of every id the app creates; random ids are `chk-<uuid v4>`. */
export const DEVICE_ID_PREFIX = 'chk-';

/** Nakama accepts device ids of 10 to 128 bytes. */
const DEVICE_ID_PATTERN = /^[A-Za-z0-9-]{10,128}$/;

/** True for a string Nakama accepts as a device id and that has the app's prefix. */
export function isValidDeviceId(id: string): boolean {
  return id.startsWith(DEVICE_ID_PREFIX) && DEVICE_ID_PATTERN.test(id);
}

/** Throws unless `id` is a valid device id; stores call it before writing. */
export function assertValidDeviceId(id: string, where: string): void {
  if (!isValidDeviceId(id)) throw new Error(`${where}: malformed device id`);
}
