import { FRIEND_LINK_PATH, isFriendCode, isRoomCode, normalizeFriendCode, ROOM_LINK_PATH } from '@chkobba/protocol';

/**
 * Share links for private tables (`${EXPO_PUBLIC_WEB_BASE_URL}/t/${code}`)
 * and friend codes (`${EXPO_PUBLIC_WEB_BASE_URL}/f/${code}`).
 * The base is optional; when it is unset or malformed the app shares the code
 * only. Parsed by hand (no `URL`): Hermes' `URL` is incomplete.
 */

const SCHEMES = ['http://', 'https://'] as const;
/** Host name or IPv4 address, optional port. No user info, path, query or hash. */
const AUTHORITY_PATTERN = /^([A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*)(:(\d{1,5}))?$/;
const MAX_BASE_CHARS = 256;

/**
 * `value` as an http(s) origin (`scheme://host[:port]`, scheme lowercased), or
 * null when it is anything else. One trailing `/` is tolerated and stripped.
 * Plain http is allowed: LAN testing serves `http://<LAN-IP>:8081`.
 */
export function parseWebBase(value: string | undefined): string | null {
  if (value === undefined) return null;
  let text = value.trim();
  if (text.length === 0 || text.length > MAX_BASE_CHARS) return null;
  if (text.endsWith('/')) text = text.slice(0, -1);
  const lower = text.toLowerCase();
  const scheme = SCHEMES.find((candidate) => lower.startsWith(candidate));
  if (scheme === undefined) return null;
  const authority = text.slice(scheme.length);
  const match = AUTHORITY_PATTERN.exec(authority);
  if (match === null) return null;
  const port = match[4];
  if (port !== undefined) {
    const portNumber = Number(port);
    if (portNumber < 1 || portNumber > 65535) return null;
  }
  return `${scheme}${authority}`;
}

/** The share link for a room code, or null when no valid web base URL is configured (or `code` is not a room code). */
export function roomShareLink(code: string): string | null {
  if (!isRoomCode(code)) return null;
  // Literal dot access: Expo only inlines EXPO_PUBLIC_* variables written this way.
  const origin = parseWebBase(process.env.EXPO_PUBLIC_WEB_BASE_URL);
  return origin === null ? null : `${origin}${ROOM_LINK_PATH}${code}`;
}

/**
 * The share link for a friend code, or null when no valid web base URL is
 * configured (or `code` is not a friend code once normalized). The link
 * carries the normalized 8-character code, without the display dash.
 */
export function friendShareLink(code: string): string | null {
  const normalized = normalizeFriendCode(code);
  if (!isFriendCode(normalized)) return null;
  // Literal dot access: Expo only inlines EXPO_PUBLIC_* variables written this way.
  const origin = parseWebBase(process.env.EXPO_PUBLIC_WEB_BASE_URL);
  return origin === null ? null : `${origin}${FRIEND_LINK_PATH}${normalized}`;
}
