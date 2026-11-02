import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';

import {
  assertValidDeviceId,
  DEVICE_ID_KEY,
  DEVICE_ID_PREFIX,
  isValidDeviceId,
  type CreateDeviceIdStore,
} from './deviceId';

/**
 * Android: the id is derived from ANDROID_ID, which survives uninstall (it is
 * scoped to the signing key and user, and resets on a factory reset).
 *
 * - The id is `chk-a-` + hex SHA-256(ANDROID_ID + salt). The raw ANDROID_ID
 *   never leaves `derivedId`, is never logged, and is never linked to the
 *   advertising ID.
 * - Without an ANDROID_ID (null, empty, or the call throws), `load` returns
 *   null. The caller then creates a random `chk-<uuid>` and `save` persists it
 *   in AsyncStorage under its own key.
 *
 * `load` prefers a saved fallback over the derived id, so an account created
 * on the fallback keeps working if an ANDROID_ID shows up later. `save` skips
 * the derived id (recomputed on every load) and persists anything else.
 */

const ANDROID_PREFIX = `${DEVICE_ID_PREFIX}a-`;
const FALLBACK_KEY = `${DEVICE_ID_KEY}.android-fallback`;
/**
 * Not a secret, and it doesn't need to be. It keeps the raw ANDROID_ID out of
 * what goes to the server and makes the value specific to this app.
 * Changing it changes every Android guest's id.
 */
const ANDROID_ID_SALT = ':chkobba-online-guest-v1';

/** The derived id, or null when the platform gives no ANDROID_ID. */
async function derivedId(): Promise<string | null> {
  let androidId: string | null;
  try {
    androidId = Application.getAndroidId();
  } catch {
    return null;
  }
  if (typeof androidId !== 'string' || androidId.trim() === '') return null;
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, androidId.trim() + ANDROID_ID_SALT, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
  const id = ANDROID_PREFIX + digest.toLowerCase();
  return isValidDeviceId(id) ? id : null;
}

async function loadFallback(): Promise<string | null> {
  const stored = await AsyncStorage.getItem(FALLBACK_KEY);
  return stored !== null && isValidDeviceId(stored) ? stored : null;
}

export const createDeviceIdStore: CreateDeviceIdStore = () => ({
  async load() {
    return (await loadFallback()) ?? (await derivedId());
  },
  async save(id) {
    assertValidDeviceId(id, 'DeviceIdStore.save');
    if (id === (await derivedId())) return;
    await AsyncStorage.setItem(FALLBACK_KEY, id);
  },
});
