import * as SecureStore from 'expo-secure-store';

import { assertValidDeviceId, DEVICE_ID_KEY, isValidDeviceId, type CreateDeviceIdStore } from './deviceId';

/**
 * iOS: the id is a Keychain item, which survives uninstall, so a reinstall
 * signs in to the same account.
 *
 * - `AFTER_FIRST_UNLOCK` (not `THIS_DEVICE_ONLY`): readable in the background
 *   after the first unlock, and carried over by an encrypted backup or a
 *   device-to-device transfer.
 * - The future account deletion must delete this item.
 */
const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

export const createDeviceIdStore: CreateDeviceIdStore = () => ({
  async load() {
    const stored = await SecureStore.getItemAsync(DEVICE_ID_KEY, OPTIONS);
    return stored !== null && isValidDeviceId(stored) ? stored : null;
  },
  async save(id) {
    assertValidDeviceId(id, 'DeviceIdStore.save');
    await SecureStore.setItemAsync(DEVICE_ID_KEY, id, OPTIONS);
  },
});
