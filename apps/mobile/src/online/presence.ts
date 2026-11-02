import { PRESENCE_ACTIVITIES, type PresenceActivity, type PresenceStatus } from '@chkobba/protocol';

/** What a follower sees for a friend. */
export type Availability = 'online' | 'room' | 'playing' | 'offline';

/**
 * The socket status string for an activity. The status is public to every follower (ADR-0003),
 * so it carries the activity only: never a room code, match id or anything else.
 */
export function encodeStatus(activity: PresenceActivity): string {
  const status: PresenceStatus = { v: 1, a: activity };
  return JSON.stringify(status);
}

function isPresenceActivity(value: unknown): value is PresenceActivity {
  return PRESENCE_ACTIVITIES.some((activity) => activity === value);
}

/** Reads the activity out of a status string; undefined when it is missing or malformed. */
function readActivity(status: string | undefined): PresenceActivity | undefined {
  if (typeof status !== 'string' || status.length === 0) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(status);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null || !('a' in parsed)) return undefined;
  return isPresenceActivity(parsed.a) ? parsed.a : undefined;
}

/**
 * A friend's availability from their presence. No presence means offline. A presence whose status
 * is unknown, missing or malformed still means they are connected, so it reads as online.
 */
export function decodeAvailability(presence: { status?: string } | null | undefined): Availability {
  if (presence === null || presence === undefined) return 'offline';
  switch (readActivity(presence.status)) {
    case 'room':
      return 'room';
    case 'playing':
      return 'playing';
    case 'lobby':
    case undefined:
      return 'online';
  }
}
