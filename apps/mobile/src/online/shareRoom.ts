import { normalizeFriendCode } from '@chkobba/protocol';
import { Platform, Share } from 'react-native';

import type { TFunction } from '../i18n';
import { roomShareLink } from './shareLink';

/**
 * Sharing a private-table room code or a friend code.
 *
 * - `'shared'`: a share sheet opened. On native we don't tell a dismissed
 *   sheet apart from a completed share (Android never reports it anyway), and
 *   on web a cancelled `navigator.share` (`AbortError`) also counts: the
 *   player saw the sheet and chose not to send, so we don't copy behind their
 *   back.
 * - `'copied'`: the text went to the clipboard (web only).
 * - `'unavailable'`: nothing worked, e.g. the LAN `http://<LAN-IP>` case where
 *   the browser hides `navigator.share` and `navigator.clipboard`. The UI then
 *   shows the code and link as selectable text.
 *
 * One file with a `Platform.OS` branch rather than `.web.ts`/native siblings:
 * the logic is small and shares the message builder, and a sibling importing
 * `./shareRoom` would resolve to itself on web.
 *
 * No `expo-clipboard`: on native the share sheet already offers "Copy", and
 * adding a package risks re-resolving Babel 8 peers across the lockfile.
 */
export type ShareOutcome = 'shared' | 'copied' | 'unavailable';

/** The text to share: the translated message, plus the link when one is configured. */
export function roomShareText(code: string, tr: TFunction): string {
  const message = tr('room.shareMessage', { code });
  const link = roomShareLink(code);
  return link === null ? message : `${message}\n${link}`;
}

/** Opens the share sheet (or copies on web) for a room code. Never throws. */
export function shareRoom(code: string, tr: TFunction): Promise<ShareOutcome> {
  return shareText(roomShareText(code, tr));
}

/**
 * Opens the share sheet (or copies on web) for a friend code. The caller
 * builds `message` (the translated text plus `friendShareLink`, when one is
 * configured), so this file stays free of `friends.*` catalog keys. Never throws.
 */
export function shareFriendCode(message: string): Promise<ShareOutcome> {
  return shareText(message);
}

/**
 * For an explicit "Copy code" button on a friend code. Copies the normalized
 * 8-character code without the display dash (`ABCD2345`, not `ABCD-2345`):
 * the add-friend field normalizes either form, and the raw one survives any
 * paste target that drops or mangles punctuation. Same platform fallbacks as
 * `copyRoomCode`.
 */
export function copyFriendCode(code: string): Promise<ShareOutcome> {
  return copyText(normalizeFriendCode(code));
}

/** Share API → clipboard → `'unavailable'`. Never throws. */
async function shareText(message: string): Promise<ShareOutcome> {
  if (Platform.OS !== 'web') return nativeShare(message);

  const nav = secureNavigator();
  if (nav === null) return 'unavailable';
  if (typeof nav.share === 'function') {
    try {
      await nav.share({ text: message });
      return 'shared';
    } catch (error) {
      if (isAbortError(error)) return 'shared';
      // NotAllowedError (no user activation), unsupported data, etc.: try the clipboard.
    }
  }
  return webCopy(nav, message);
}

/**
 * For an explicit "Copy code" button: copies just the code on web. Native has
 * no clipboard package (see above), so it opens the share sheet, which has a
 * "Copy" action.
 */
export function copyRoomCode(code: string): Promise<ShareOutcome> {
  return copyText(code);
}

async function copyText(text: string): Promise<ShareOutcome> {
  if (Platform.OS !== 'web') return nativeShare(text);
  const nav = secureNavigator();
  return nav === null ? 'unavailable' : webCopy(nav, text);
}

async function nativeShare(message: string): Promise<ShareOutcome> {
  try {
    await Share.share({ message });
    return 'shared';
  } catch {
    return 'unavailable';
  }
}

/**
 * `navigator`, but only in a secure context. `navigator.share` and
 * `navigator.clipboard` are secure-context-only; over plain http they are
 * missing or reject, so we don't even try.
 */
function secureNavigator(): Navigator | null {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return null;
  return window.isSecureContext === true ? navigator : null;
}

async function webCopy(nav: Navigator, text: string): Promise<ShareOutcome> {
  const clipboard: Clipboard | undefined = nav.clipboard;
  if (clipboard === undefined || clipboard === null || typeof clipboard.writeText !== 'function') return 'unavailable';
  try {
    await clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'unavailable';
  }
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';
}
