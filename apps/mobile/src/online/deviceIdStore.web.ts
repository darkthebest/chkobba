import { assertValidDeviceId, DEVICE_ID_KEY, isValidDeviceId, type CreateDeviceIdStore } from './deviceId';

/**
 * Web: `localStorage` under the same key as before. AsyncStorage's web build
 * stores each key in `localStorage` unprefixed, so existing web guests keep
 * their id.
 *
 * Storage can be missing (static rendering) or throw (blocked or private
 * mode). Then `load` returns null and `save` does nothing: the guest still
 * plays, but on a throwaway id that is lost when the page reloads.
 */

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Some browsers throw on the `localStorage` getter itself when site data is blocked.
    return null;
  }
}

export const createDeviceIdStore: CreateDeviceIdStore = () => ({
  async load() {
    try {
      const stored = storage()?.getItem(DEVICE_ID_KEY) ?? null;
      return stored !== null && isValidDeviceId(stored) ? stored : null;
    } catch {
      return null;
    }
  },
  async save(id) {
    assertValidDeviceId(id, 'DeviceIdStore.save');
    try {
      storage()?.setItem(DEVICE_ID_KEY, id);
    } catch {
      // Quota exceeded or private mode: keep playing on an id that won't persist.
    }
  },
});
