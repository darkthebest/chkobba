import { FRIEND_STATE, INVITE_TTL_MS, NOTIFICATION_CODES, type PresenceActivity } from '@chkobba/protocol';
import type { Notification, Presence, Session, StatusPresenceEvent } from '@heroiclabs/nakama-js';

import type { Scheduler } from '@/game/LocalGameClient';

import type { FriendEntry, FriendsSnapshot } from '../friends';
import { encodeStatus } from '../presence';
import {
  backoffDelay,
  chunk,
  FOLLOW_CHUNK_SIZE,
  isInviteExpired,
  parseInviteContent,
  RECONNECT_BASE_MS,
  RECONNECT_MAX_MS,
  SocialSocket,
  TEMPORARY_FOLLOW_LIMIT,
  type ForegroundSource,
  type SocialEvent,
  type SocialSocketPort,
  toTableInvite,
} from '../socialSocket';

// --- Fakes -------------------------------------------------------------------

const SELF = 'self-user';
const T0 = Date.parse('2026-10-31T12:00:00.000Z');
const ROOM_CODE = 'ABCDEF';

/** Lets every pending promise chain settle (the socket chains many awaits). */
async function flush(): Promise<void> {
  for (let i = 0; i < 200; i += 1) await Promise.resolve();
}

function entry(userId: string, state: FriendEntry['state'] = FRIEND_STATE.FRIEND): FriendEntry {
  return { userId, displayName: `Name ${userId}`, code: null, state, updatedAt: 0 };
}

function snapshot(parts: { friends?: string[]; incoming?: string[]; outgoing?: string[]; blocked?: string[] } = {}): FriendsSnapshot {
  return {
    friends: (parts.friends ?? []).map((id) => entry(id)),
    incoming: (parts.incoming ?? []).map((id) => entry(id, FRIEND_STATE.REQUEST_RECEIVED)),
    outgoing: (parts.outgoing ?? []).map((id) => entry(id, FRIEND_STATE.REQUEST_SENT)),
    blocked: (parts.blocked ?? []).map((id) => entry(id, FRIEND_STATE.BLOCKED)),
  };
}

function presence(userId: string, sessionId: string, activity?: PresenceActivity): Presence {
  const base = { user_id: userId, session_id: sessionId, username: userId, node: 'n1' };
  return (activity ? { ...base, status: encodeStatus(activity) } : base) as Presence;
}

function notification(id: string, code: number, senderId: string, content: unknown = {}, createTime = new Date(T0).toISOString()): Notification {
  return { id, code, sender_id: senderId, content, create_time: createTime, persistent: true, subject: 's' } as Notification;
}

function invite(id: string, senderId = 'friend-a', createTime?: string): Notification {
  return notification(id, NOTIFICATION_CODES.TABLE_INVITE, senderId, { v: 1, code: ROOM_CODE, fromName: 'Amira' }, createTime);
}

interface FakeSocket extends SocialSocketPort {
  readonly connect: jest.Mock;
  readonly disconnect: jest.Mock;
  readonly followUsers: jest.Mock;
  readonly unfollowUsers: jest.Mock;
  readonly updateStatus: jest.Mock;
}

function createHarness() {
  const h = {
    clock: T0,
    stored: true,
    snapshot: snapshot(),
    inbox: [] as Notification[],
    /** Online presences per user, returned by `followUsers`. */
    online: {} as Record<string, Presence[]>,
    connectFailures: 0,
    foreground: true,
    sockets: [] as FakeSocket[],
    delays: [] as number[],
    timers: [] as { fn: () => void; at: number }[],
    events: [] as SocialEvent[],
    foregroundListeners: new Set<(foreground: boolean) => void>(),
  };
  const session = { user_id: SELF, token: 'token' } as unknown as Session;
  const auth = {
    resume: jest.fn(async () => (h.stored ? { session } : null)),
    signIn: jest.fn(async () => {
      h.stored = true;
      return { session };
    }),
  };
  const friends = { list: jest.fn(async () => h.snapshot) };
  const client = {
    listNotifications: jest.fn(async () => ({ notifications: h.inbox })),
    deleteNotifications: jest.fn(async () => true),
  };
  const createSocket = jest.fn((): SocialSocketPort => {
    const fake = {
      connect: jest.fn(async () => {
        if (h.connectFailures > 0) {
          h.connectFailures -= 1;
          throw new Error('connect failed');
        }
        return session;
      }),
      disconnect: jest.fn(),
      followUsers: jest.fn(async (ids: string[]) => {
        const presences = ids.flatMap((id) => h.online[id] ?? []);
        // Nakama leaves `presences` out when none of the followed users are online.
        return { presences: presences.length > 0 ? presences : undefined };
      }),
      unfollowUsers: jest.fn(async () => undefined),
      updateStatus: jest.fn(async () => undefined),
      ondisconnect: () => undefined,
      onstatuspresence: () => undefined,
      onnotification: () => undefined,
    } as unknown as FakeSocket;
    h.sockets.push(fake);
    return fake;
  });
  const scheduler: Scheduler = (fn, ms) => {
    h.delays.push(ms);
    const timer = { fn, at: h.clock + ms };
    h.timers.push(timer);
    return () => {
      const i = h.timers.indexOf(timer);
      if (i !== -1) h.timers.splice(i, 1);
    };
  };
  const foreground: ForegroundSource = {
    isForeground: () => h.foreground,
    subscribe(listener) {
      h.foregroundListeners.add(listener);
      return () => h.foregroundListeners.delete(listener);
    },
  };
  const social = new SocialSocket({
    client: client as never,
    createSocket,
    auth: auth as never,
    friends,
    now: () => h.clock,
    scheduler,
    foreground,
    random: () => 1,
    log: () => undefined,
  });
  social.onEvent((event) => h.events.push(event));

  return {
    h,
    auth,
    friends,
    client,
    createSocket,
    social,
    /** The newest socket. */
    socket: () => h.sockets[h.sockets.length - 1],
    async advance(ms: number): Promise<void> {
      const end = h.clock + ms;
      for (;;) {
        await flush();
        const due = h.timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        h.timers.splice(h.timers.indexOf(due), 1);
        h.clock = Math.max(h.clock, due.at);
        due.fn();
      }
      h.clock = end;
      await flush();
    },
    async setForeground(value: boolean): Promise<void> {
      h.foreground = value;
      for (const listener of [...h.foregroundListeners]) listener(value);
      await flush();
    },
    async drop(): Promise<void> {
      h.sockets[h.sockets.length - 1].ondisconnect({} as Event);
      await flush();
    },
    async presenceEvent(event: Partial<StatusPresenceEvent>): Promise<void> {
      h.sockets[h.sockets.length - 1].onstatuspresence({ joins: [], leaves: [], ...event } as StatusPresenceEvent);
      await flush();
    },
    async notify(n: Notification): Promise<void> {
      h.sockets[h.sockets.length - 1].onnotification(n);
      await flush();
    },
    async start(): Promise<void> {
      await social.start();
      await flush();
    },
  };
}

type Harness = ReturnType<typeof createHarness>;

function deletedIds(t: Harness): string[] {
  return t.client.deleteNotifications.mock.calls.flatMap((call) => (call as unknown as [unknown, string[]])[1]);
}

// --- Pure helpers --------------------------------------------------------------

describe('chunk', () => {
  it('should split 120 ids into chunks of 50, 50 and 20', () => {
    // Arrange
    const ids = Array.from({ length: 120 }, (_, i) => `u${i}`);

    // Act
    const chunks = chunk(ids, FOLLOW_CHUNK_SIZE);

    // Assert
    expect(chunks.map((c) => c.length)).toEqual([50, 50, 20]);
  });

  it('should return no chunks when the list is empty', () => {
    // Act
    const chunks = chunk([], 50);

    // Assert
    expect(chunks).toEqual([]);
  });
});

describe('backoffDelay', () => {
  it('should double from the base and cap at 30 s when jitter is at its maximum', () => {
    // Act
    const delays = [0, 1, 2, 3, 4, 5, 6, 10].map((attempt) => backoffDelay(attempt, () => 1));

    // Assert
    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
  });

  it('should be half the exponential delay when jitter is zero', () => {
    // Act
    const delay = backoffDelay(0, () => 0);

    // Assert
    expect(delay).toBe(RECONNECT_BASE_MS / 2);
  });

  it('should never exceed the cap when random returns more than 1', () => {
    // Act
    const delay = backoffDelay(20, () => 5);

    // Assert
    expect(delay).toBe(RECONNECT_MAX_MS);
  });
});

describe('parseInviteContent', () => {
  it('should accept an object content', () => {
    // Act
    const parsed = parseInviteContent({ v: 1, code: ROOM_CODE, fromName: 'Amira' });

    // Assert
    expect(parsed).toEqual({ v: 1, code: ROOM_CODE, fromName: 'Amira' });
  });

  it('should accept a JSON string content', () => {
    // Act
    const parsed = parseInviteContent(JSON.stringify({ v: 1, code: ROOM_CODE, fromName: 'Amira' }));

    // Assert
    expect(parsed).toEqual({ v: 1, code: ROOM_CODE, fromName: 'Amira' });
  });

  it.each([
    ['invalid JSON', '{not json'],
    ['null', null],
    ['a wrong version', { v: 2, code: ROOM_CODE, fromName: 'A' }],
    ['a bad room code', { v: 1, code: 'abc', fromName: 'A' }],
    ['a missing name', { v: 1, code: ROOM_CODE }],
  ])('should return null for %s', (_label, content) => {
    // Act
    const parsed = parseInviteContent(content);

    // Assert
    expect(parsed).toBeNull();
  });
});

describe('isInviteExpired', () => {
  it('should flip exactly at INVITE_TTL_MS', () => {
    // Act
    const flags = [isInviteExpired(T0, T0 + INVITE_TTL_MS - 1), isInviteExpired(T0, T0 + INVITE_TTL_MS)];

    // Assert
    expect(flags).toEqual([false, true]);
  });
});

describe('toTableInvite', () => {
  it('should use the local time when create_time is in the future', () => {
    // Arrange
    const n = invite('n1', 'friend-a', new Date(T0 + 60000).toISOString());

    // Act
    const result = toTableInvite(n, T0);

    // Assert
    expect(result?.sentAt).toBe(T0);
  });

  it('should return null for another notification code', () => {
    // Arrange
    const n = notification('n1', NOTIFICATION_CODES.FRIEND_REQUEST, 'friend-a');

    // Act
    const result = toTableInvite(n, T0);

    // Assert
    expect(result).toBeNull();
  });
});

// --- SocialSocket --------------------------------------------------------------

describe('SocialSocket', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('connection rules', () => {
    it('should create no socket when start finds no stored session', async () => {
      // Arrange
      const t = createHarness();
      t.h.stored = false;

      // Act
      await t.start();

      // Assert
      expect(t.createSocket).not.toHaveBeenCalled();
    });

    it('should never sign in when start finds no stored session', async () => {
      // Arrange
      const t = createHarness();
      t.h.stored = false;

      // Act
      await t.start();

      // Assert
      expect(t.auth.signIn).not.toHaveBeenCalled();
    });

    it('should stay off when start finds no stored session', async () => {
      // Arrange
      const t = createHarness();
      t.h.stored = false;

      // Act
      await t.start();

      // Assert
      expect(t.social.getConnectionPhase()).toBe('off');
    });

    it('should connect with appearOnline true when start finds a stored session', async () => {
      // Arrange
      const t = createHarness();

      // Act
      await t.start();

      // Assert
      expect(t.socket().connect).toHaveBeenCalledWith(expect.objectContaining({ user_id: SELF }), true);
    });

    it('should publish connected once the socket is up', async () => {
      // Arrange
      const t = createHarness();

      // Act
      await t.start();

      // Assert
      expect(t.social.getState().connected).toBe(true);
    });

    it('should sign in when ensureConnected finds no stored session', async () => {
      // Arrange
      const t = createHarness();
      t.h.stored = false;

      // Act
      const connected = await t.social.ensureConnected();

      // Assert
      expect([connected, t.auth.signIn.mock.calls.length]).toEqual([true, 1]);
    });

    it('should sign in when ensureConnected follows a start that found no session', async () => {
      // Arrange
      const t = createHarness();
      t.h.stored = false;
      await t.start();

      // Act
      const connected = await t.social.ensureConnected();

      // Assert
      expect(connected).toBe(true);
    });

    it('should resolve true without a new socket when already connected', async () => {
      // Arrange
      const t = createHarness();
      await t.start();

      // Act
      const connected = await t.social.ensureConnected();

      // Assert
      expect([connected, t.createSocket.mock.calls.length]).toEqual([true, 1]);
    });
  });

  describe('presence visibility', () => {
    it('should connect with the status on for Everyone', async () => {
      // Arrange
      const t = createHarness();

      // Act
      await t.start();

      // Assert
      expect(t.socket().connect).toHaveBeenCalledWith(expect.objectContaining({ user_id: SELF }), true);
    });

    it('should connect with the status off for Nobody', async () => {
      // Arrange
      const t = createHarness();
      await t.social.setVisibility('nobody');

      // Act
      await t.start();

      // Assert
      expect(t.socket().connect).toHaveBeenCalledWith(expect.objectContaining({ user_id: SELF }), false);
    });

    it('should publish no status when Nobody is connected', async () => {
      // Arrange
      const t = createHarness();
      await t.social.setVisibility('nobody');

      // Act
      await t.start();

      // Assert
      expect(t.socket().updateStatus).not.toHaveBeenCalled();
    });

    it('should reconnect when setVisibility changes the value while connected', async () => {
      // Arrange
      const t = createHarness();
      await t.start();

      // Act
      await t.social.setVisibility('nobody');

      // Assert
      expect(t.h.sockets.length).toBe(2);
    });

    it('should connect the new socket with the status off after switching to Nobody', async () => {
      // Arrange
      const t = createHarness();
      await t.start();

      // Act
      await t.social.setVisibility('nobody');

      // Assert
      expect(t.socket().connect).toHaveBeenLastCalledWith(expect.objectContaining({ user_id: SELF }), false);
    });

    it('should reconnect with the status on when switching back to Everyone', async () => {
      // Arrange
      const t = createHarness();
      await t.social.setVisibility('nobody');
      await t.start();

      // Act
      await t.social.setVisibility('everyone');

      // Assert
      expect(t.socket().connect).toHaveBeenLastCalledWith(expect.objectContaining({ user_id: SELF }), true);
    });

    it('should not reconnect when setVisibility repeats the current value', async () => {
      // Arrange
      const t = createHarness();
      await t.start();

      // Act
      await t.social.setVisibility('everyone');

      // Assert
      expect(t.createSocket).toHaveBeenCalledTimes(1);
    });

    it('should remember a choice made before connecting without opening a socket', async () => {
      // Arrange
      const t = createHarness();

      // Act
      await t.social.setVisibility('nobody');

      // Assert
      expect(t.createSocket).not.toHaveBeenCalled();
    });
  });

  describe('status', () => {
    it('should send the lobby status on connect', async () => {
      // Arrange
      const t = createHarness();

      // Act
      await t.start();

      // Assert
      expect(t.socket().updateStatus).toHaveBeenCalledWith(encodeStatus('lobby'));
    });

    it('should send the new status when setActivity changes it while connected', async () => {
      // Arrange
      const t = createHarness();
      await t.start();

      // Act
      t.social.setActivity('playing');
      await flush();

      // Assert
      expect(t.socket().updateStatus).toHaveBeenLastCalledWith(encodeStatus('playing'));
    });

    it('should not resend the status when setActivity repeats the current one', async () => {
      // Arrange
      const t = createHarness();
      await t.start();
      t.socket().updateStatus.mockClear();

      // Act
      t.social.setActivity('lobby');
      await flush();

      // Assert
      expect(t.socket().updateStatus).not.toHaveBeenCalled();
    });

    it('should re-send the current status on the new socket after a reconnect', async () => {
      // Arrange
      const t = createHarness();
      await t.start();
      t.social.setActivity('room');
      await t.drop();

      // Act
      await t.advance(RECONNECT_MAX_MS);

      // Assert
      expect([t.h.sockets.length, t.socket().updateStatus.mock.calls]).toEqual([2, [[encodeStatus('room')]]]);
    });

    it('should send the activity set while disconnected once connected', async () => {
      // Arrange
      const t = createHarness();
      t.social.setActivity('playing');

      // Act
      await t.start();

      // Assert
      expect(t.socket().updateStatus).toHaveBeenCalledWith(encodeStatus('playing'));
    });
  });

  describe('follows', () => {
    it('should follow 120 friends in chunks of 50, 50 and 20', async () => {
      // Arrange
      const t = createHarness();
      t.h.snapshot = snapshot({ friends: Array.from({ length: 120 }, (_, i) => `f${i}`) });

      // Act
      await t.start();

      // Assert
      expect(t.socket().followUsers.mock.calls.map(([ids]) => (ids as string[]).length)).toEqual([50, 50, 20]);
    });

    it('should only follow mutual friends, not requests or blocked users', async () => {
      // Arrange
      const t = createHarness();
      t.h.snapshot = snapshot({ friends: ['a'], incoming: ['b'], outgoing: ['c'], blocked: ['d'] });

      // Act
      await t.start();

      // Assert
      expect(t.socket().followUsers.mock.calls).toEqual([[['a']]]);
    });

    it('should follow only the added friend when the list grows', async () => {
      // Arrange
      const t = createHarness();
      t.h.snapshot = snapshot({ friends: ['a', 'b'] });
      await t.start();
      t.h.snapshot = snapshot({ friends: ['a', 'b', 'c'] });

      // Act
      await t.social.refreshFriends();

      // Assert
      expect(t.socket().followUsers).toHaveBeenLastCalledWith(['c']);
    });

    it('should unfollow a removed friend when the list shrinks', async () => {
      // Arrange
      const t = createHarness();
      t.h.snapshot = snapshot({ friends: ['a', 'b'] });
      await t.start();
      t.h.snapshot = snapshot({ friends: ['a'] });

      // Act
      await t.social.refreshFriends();

      // Assert
      expect(t.socket().unfollowUsers.mock.calls).toEqual([[['b']]]);
    });

    it('should drop the removed friend from availability', async () => {
      // Arrange
      const t = createHarness();
      t.h.snapshot = snapshot({ friends: ['a', 'b'] });
      t.h.online = { b: [presence('b', 'sb')] };
      await t.start();
      t.h.snapshot = snapshot({ friends: ['a'] });

      // Act
      await t.social.refreshFriends();

      // Assert
      expect(t.social.getState().availability).toEqual({ a: 'offline' });
    });

    it('should re-follow every friend on the new socket after a reconnect', async () => {
      // Arrange
      const t = createHarness();
      t.h.snapshot = snapshot({ friends: ['a', 'b'] });
      await t.start();
      await t.drop();

      // Act
      await t.advance(RECONNECT_MAX_MS);

      // Assert
      expect(t.socket().followUsers.mock.calls).toEqual([[['a', 'b']]]);
    });

    it('should count incoming requests from the friend list', async () => {
      // Arrange
      const t = createHarness();
      t.h.snapshot = snapshot({ incoming: ['x', 'y'] });

      // Act
      await t.start();

      // Assert
      expect(t.social.getState().incomingRequests).toBe(2);
    });
  });

  describe('temporary follows', () => {
    it('should follow the mutual friends and the temporary users together', async () => {
      // Arrange
      const t = createHarness();
      t.h.snapshot = snapshot({ friends: ['a'] });
      await t.start();

      // Act
      await t.social.setTemporaryFollows(['x', 'y']);

      // Assert
      expect(t.socket().followUsers.mock.calls).toEqual([[['a']], [['x', 'y']]]);
    });

    it('should follow an id that is both a friend and temporary only once', async () => {
      // Arrange
      const t = createHarness();
      t.h.snapshot = snapshot({ friends: ['a'] });
      await t.start();

      // Act
      await t.social.setTemporaryFollows(['a', 'x']);

      // Assert
      expect(t.socket().followUsers.mock.calls).toEqual([[['a']], [['x']]]);
    });

    it('should cap the temporary set at TEMPORARY_FOLLOW_LIMIT', async () => {
      // Arrange
      const t = createHarness();
      await t.start();
      const ids = Array.from({ length: TEMPORARY_FOLLOW_LIMIT + 5 }, (_, i) => `t${i}`);

      // Act
      await t.social.setTemporaryFollows(ids);

      // Assert
      expect(t.socket().followUsers).toHaveBeenCalledWith(ids.slice(0, TEMPORARY_FOLLOW_LIMIT));
    });

    it('should issue no follow or unfollow when the temporary set is replaced with an identical one', async () => {
      // Arrange
      const t = createHarness();
      await t.start();
      await t.social.setTemporaryFollows(['x', 'y']);
      t.socket().followUsers.mockClear();
      t.socket().unfollowUsers.mockClear();

      // Act
      await t.social.setTemporaryFollows(['x', 'y']);

      // Assert
      expect([t.socket().followUsers.mock.calls.length, t.socket().unfollowUsers.mock.calls.length]).toEqual([0, 0]);
    });

    it('should unfollow only the temporary ids when cleared', async () => {
      // Arrange
      const t = createHarness();
      t.h.snapshot = snapshot({ friends: ['a'] });
      await t.start();
      await t.social.setTemporaryFollows(['x']);
      t.socket().followUsers.mockClear();
      t.socket().unfollowUsers.mockClear();

      // Act
      await t.social.clearTemporaryFollows();

      // Assert
      expect(t.socket().unfollowUsers).toHaveBeenCalledWith(['x']);
      expect(t.socket().followUsers).not.toHaveBeenCalled();
    });

    it('should keep a friend followed when their id was also temporary', async () => {
      // Arrange
      const t = createHarness();
      t.h.snapshot = snapshot({ friends: ['a'] });
      await t.start();
      await t.social.setTemporaryFollows(['a']);
      t.socket().unfollowUsers.mockClear();

      // Act
      await t.social.clearTemporaryFollows();

      // Assert
      expect(t.socket().unfollowUsers).not.toHaveBeenCalled();
    });

    it('should show a temporary user online while wanted', async () => {
      // Arrange
      const t = createHarness();
      t.h.snapshot = snapshot({ friends: ['a'] });
      t.h.online = { x: [presence('x', 'sx', 'room')] };
      await t.start();

      // Act
      await t.social.setTemporaryFollows(['x']);

      // Assert
      expect(t.social.getState().availability).toEqual({ a: 'offline', x: 'room' });
    });

    it('should drop a temporary user from availability after clearing', async () => {
      // Arrange
      const t = createHarness();
      t.h.online = { x: [presence('x', 'sx', 'room')] };
      await t.start();
      await t.social.setTemporaryFollows(['x']);

      // Act
      await t.social.clearTemporaryFollows();

      // Assert
      expect(t.social.getState().availability).toEqual({});
    });

    it('should still follow a friend added while temporary follows are active', async () => {
      // Arrange
      const t = createHarness();
      t.h.snapshot = snapshot({ friends: ['a'] });
      await t.start();
      await t.social.setTemporaryFollows(['x']);
      t.h.snapshot = snapshot({ friends: ['a', 'b'] });

      // Act
      await t.social.refreshFriends();

      // Assert
      expect(t.socket().followUsers).toHaveBeenLastCalledWith(['b']);
    });

    it('should still show a friend presence while temporary follows are active', async () => {
      // Arrange
      const t = createHarness();
      t.h.snapshot = snapshot({ friends: ['a'] });
      await t.start();
      await t.social.setTemporaryFollows(['x']);

      // Act
      await t.presenceEvent({ joins: [presence('a', 'sa', 'playing')] });

      // Assert
      expect(t.social.getState().availability).toEqual({ a: 'playing', x: 'offline' });
    });

    it('should still deliver a table invite while temporary follows are active', async () => {
      // Arrange
      const t = createHarness();
      await t.start();
      await t.social.setTemporaryFollows(['x']);

      // Act
      await t.notify(invite('inv1'));

      // Assert
      expect(t.social.getState().invites.map((i) => i.id)).toEqual(['inv1']);
    });
  });

  describe('presence', () => {
    it('should show a followed friend offline when followUsers returns no presences', async () => {
      // Arrange
      const t = createHarness();
      t.h.snapshot = snapshot({ friends: ['a'] });

      // Act
      await t.start();

      // Assert
      expect(t.social.getState().availability).toEqual({ a: 'offline' });
    });

    it('should show a friend online from the presences followUsers returns', async () => {
      // Arrange
      const t = createHarness();
      t.h.snapshot = snapshot({ friends: ['a'] });
      t.h.online = { a: [presence('a', 's1', 'room')] };

      // Act
      await t.start();

      // Assert
      expect(t.social.getState().availability).toEqual({ a: 'room' });
    });

    it('should keep the friend online with the new status when one event leaves and rejoins the same session', async () => {
      // Arrange
      const t = createHarness();
      t.h.snapshot = snapshot({ friends: ['a'] });
      t.h.online = { a: [presence('a', 's1', 'lobby')] };
      await t.start();

      // Act
      await t.presenceEvent({ joins: [presence('a', 's1', 'playing')], leaves: [presence('a', 's1', 'lobby')] });

      // Assert
      expect(t.social.getState().availability).toEqual({ a: 'playing' });
    });

    it('should show a friend online when a connect event sends only a join', async () => {
      // Arrange
      const t = createHarness();
      t.h.snapshot = snapshot({ friends: ['a'] });
      await t.start();

      // Act
      await t.presenceEvent({ joins: [presence('a', 's1')] });

      // Assert
      expect(t.social.getState().availability).toEqual({ a: 'online' });
    });

    it('should show a friend offline when a disconnect event sends only a leave', async () => {
      // Arrange
      const t = createHarness();
      t.h.snapshot = snapshot({ friends: ['a'] });
      t.h.online = { a: [presence('a', 's1', 'lobby')] };
      await t.start();

      // Act
      await t.presenceEvent({ leaves: [presence('a', 's1', 'lobby')] });

      // Assert
      expect(t.social.getState().availability).toEqual({ a: 'offline' });
    });

    it('should show the busiest status when a friend has several sessions', async () => {
      // Arrange
      const t = createHarness();
      t.h.snapshot = snapshot({ friends: ['a'] });
      t.h.online = { a: [presence('a', 'phone', 'lobby')] };
      await t.start();

      // Act
      await t.presenceEvent({ joins: [presence('a', 'laptop', 'playing')] });

      // Assert
      expect(t.social.getState().availability).toEqual({ a: 'playing' });
    });

    it('should keep a friend online when only one of their sessions leaves', async () => {
      // Arrange
      const t = createHarness();
      t.h.snapshot = snapshot({ friends: ['a'] });
      t.h.online = { a: [presence('a', 'phone', 'lobby'), presence('a', 'laptop', 'playing')] };
      await t.start();

      // Act
      await t.presenceEvent({ leaves: [presence('a', 'laptop', 'playing')] });

      // Assert
      expect(t.social.getState().availability).toEqual({ a: 'online' });
    });

    it('should ignore presence events for the player own sessions', async () => {
      // Arrange
      const t = createHarness();
      t.h.snapshot = snapshot({ friends: ['a'] });
      await t.start();

      // Act
      await t.presenceEvent({ joins: [presence(SELF, 'my-other-device', 'playing')] });

      // Assert
      expect(t.social.getState().availability).toEqual({ a: 'offline' });
    });

    it('should ignore presence events for users who are not followed', async () => {
      // Arrange
      const t = createHarness();
      t.h.snapshot = snapshot({ friends: ['a'] });
      await t.start();

      // Act
      await t.presenceEvent({ joins: [presence('stranger', 's9', 'lobby')] });

      // Assert
      expect(t.social.getState().availability).toEqual({ a: 'offline' });
    });

    it('should clear availability when the socket drops', async () => {
      // Arrange
      const t = createHarness();
      t.h.snapshot = snapshot({ friends: ['a'] });
      t.h.online = { a: [presence('a', 's1')] };
      await t.start();

      // Act
      await t.drop();

      // Assert
      expect(t.social.getState()).toMatchObject({ connected: false, availability: {} });
    });
  });

  describe('friend notifications', () => {
    it.each([
      ['friend request', NOTIFICATION_CODES.FRIEND_REQUEST],
      ['friend accept', NOTIFICATION_CODES.FRIEND_ACCEPT],
    ])('should refresh the friend list when a live %s arrives', async (_label, code) => {
      // Arrange
      const t = createHarness();
      await t.start();
      t.friends.list.mockClear();

      // Act
      await t.notify(notification('n1', code, 'sender'));

      // Assert
      expect(t.friends.list).toHaveBeenCalledTimes(1);
    });

    it('should emit a friend_request toast with the name from the refreshed list', async () => {
      // Arrange
      const t = createHarness();
      await t.start();
      t.h.snapshot = snapshot({ incoming: ['sender'] });

      // Act
      await t.notify(notification('n1', NOTIFICATION_CODES.FRIEND_REQUEST, 'sender'));

      // Assert
      expect(t.h.events).toEqual([{ type: 'friend_request', userId: 'sender', displayName: 'Name sender' }]);
    });

    it('should emit a friend_accept toast when an accept arrives', async () => {
      // Arrange
      const t = createHarness();
      await t.start();
      t.h.snapshot = snapshot({ friends: ['sender'] });

      // Act
      await t.notify(notification('n1', NOTIFICATION_CODES.FRIEND_ACCEPT, 'sender'));

      // Assert
      expect(t.h.events).toEqual([{ type: 'friend_accept', userId: 'sender', displayName: 'Name sender' }]);
    });

    it('should delete a friend notification once seen', async () => {
      // Arrange
      const t = createHarness();
      await t.start();

      // Act
      await t.notify(notification('n1', NOTIFICATION_CODES.FRIEND_REQUEST, 'sender'));

      // Assert
      expect(deletedIds(t)).toEqual(['n1']);
    });

    it('should delete a stale friend request from a blocked sender without a toast', async () => {
      // Arrange
      const t = createHarness();
      t.h.snapshot = snapshot({ blocked: ['blocker'] });
      await t.start();

      // Act
      await t.notify(notification('n1', NOTIFICATION_CODES.FRIEND_REQUEST, 'blocker'));

      // Assert
      expect([deletedIds(t), t.h.events]).toEqual([['n1'], []]);
    });

    it('should not refresh the list for a friend request from a blocked sender', async () => {
      // Arrange
      const t = createHarness();
      t.h.snapshot = snapshot({ blocked: ['blocker'] });
      await t.start();
      t.friends.list.mockClear();

      // Act
      await t.notify(notification('n1', NOTIFICATION_CODES.FRIEND_REQUEST, 'blocker'));

      // Assert
      expect(t.friends.list).not.toHaveBeenCalled();
    });

    it('should delete a blocked sender stale request from the inbox on connect', async () => {
      // Arrange
      const t = createHarness();
      t.h.snapshot = snapshot({ blocked: ['blocker'] });
      t.h.inbox = [notification('n1', NOTIFICATION_CODES.FRIEND_REQUEST, 'blocker')];

      // Act
      await t.start();

      // Assert
      expect([deletedIds(t), t.h.events]).toEqual([['n1'], []]);
    });
  });

  describe('table invites', () => {
    it('should add an invite whose content is an object', async () => {
      // Arrange
      const t = createHarness();
      await t.start();

      // Act
      await t.notify(invite('inv1'));

      // Assert
      expect(t.social.getState().invites).toEqual([
        { id: 'inv1', fromUserId: 'friend-a', fromName: 'Amira', code: ROOM_CODE, sentAt: T0, expired: false },
      ]);
    });

    it('should add an invite whose content is a JSON string', async () => {
      // Arrange
      const t = createHarness();
      await t.start();
      const n = notification('inv1', NOTIFICATION_CODES.TABLE_INVITE, 'friend-a', JSON.stringify({ v: 1, code: ROOM_CODE, fromName: 'Amira' }));

      // Act
      await t.notify(n);

      // Assert
      expect(t.social.getState().invites.map((i) => i.code)).toEqual([ROOM_CODE]);
    });

    it('should emit a table_invite toast for a live invite', async () => {
      // Arrange
      const t = createHarness();
      await t.start();

      // Act
      await t.notify(invite('inv1'));

      // Assert
      expect(t.h.events).toEqual([{ type: 'table_invite', invite: expect.objectContaining({ id: 'inv1' }) }]);
    });

    it('should keep an invite in the inbox (not delete it) until dismissed', async () => {
      // Arrange
      const t = createHarness();
      await t.start();

      // Act
      await t.notify(invite('inv1'));

      // Assert
      expect(t.client.deleteNotifications).not.toHaveBeenCalled();
    });

    it('should delete a malformed invite without showing it', async () => {
      // Arrange
      const t = createHarness();
      await t.start();

      // Act
      await t.notify(notification('bad', NOTIFICATION_CODES.TABLE_INVITE, 'friend-a', { v: 1, code: 'nope' }));

      // Assert
      expect([deletedIds(t), t.social.getState().invites]).toEqual([['bad'], []]);
    });

    it('should delete an invite from a blocked sender without showing it', async () => {
      // Arrange
      const t = createHarness();
      t.h.snapshot = snapshot({ blocked: ['friend-a'] });
      await t.start();

      // Act
      await t.notify(invite('inv1'));

      // Assert
      expect([deletedIds(t), t.social.getState().invites]).toEqual([['inv1'], []]);
    });

    it('should not flag an invite as expired just before INVITE_TTL_MS', async () => {
      // Arrange
      const t = createHarness();
      await t.start();
      await t.notify(invite('inv1'));

      // Act
      await t.advance(INVITE_TTL_MS - 1);

      // Assert
      expect(t.social.getState().invites[0].expired).toBe(false);
    });

    it('should flag an invite as expired when its timer fires at INVITE_TTL_MS', async () => {
      // Arrange
      const t = createHarness();
      await t.start();
      await t.notify(invite('inv1'));

      // Act
      await t.advance(INVITE_TTL_MS);

      // Assert
      expect(t.social.getState().invites[0].expired).toBe(true);
    });

    it('should not toast an invite that arrives already expired', async () => {
      // Arrange
      const t = createHarness();
      await t.start();
      const old = invite('inv1', 'friend-a', new Date(T0 - INVITE_TTL_MS).toISOString());

      // Act
      await t.notify(old);

      // Assert
      expect(t.h.events).toEqual([]);
    });

    it('should remove the invite and delete its notification when dismissed', async () => {
      // Arrange
      const t = createHarness();
      await t.start();
      await t.notify(invite('inv1'));

      // Act
      await t.social.dismissInvite('inv1');

      // Assert
      expect([t.social.getState().invites, deletedIds(t)]).toEqual([[], ['inv1']]);
    });

    it('should not bring a dismissed invite back when the inbox still has it after a reconnect', async () => {
      // Arrange
      const t = createHarness();
      t.h.inbox = [invite('inv1')];
      await t.start();
      t.client.deleteNotifications.mockRejectedValue(new Error('offline'));
      await t.social.dismissInvite('inv1');
      t.client.deleteNotifications.mockResolvedValue(true);
      await t.drop();

      // Act
      await t.advance(RECONNECT_MAX_MS);

      // Assert
      expect([t.h.sockets.length, t.social.getState().invites]).toEqual([2, []]);
    });

    it('should hide an invite when its sender becomes blocked', async () => {
      // Arrange
      const t = createHarness();
      await t.start();
      await t.notify(invite('inv1'));
      t.h.snapshot = snapshot({ blocked: ['friend-a'] });

      // Act
      await t.social.refreshFriends();

      // Assert
      expect(t.social.getState().invites).toEqual([]);
    });
  });

  describe('inbox on connect', () => {
    it('should load invites from the inbox on connect', async () => {
      // Arrange
      const t = createHarness();
      t.h.inbox = [invite('inv1')];

      // Act
      await t.start();

      // Assert
      expect(t.social.getState().invites.map((i) => i.id)).toEqual(['inv1']);
    });

    it('should emit no toasts for notifications loaded from the inbox', async () => {
      // Arrange
      const t = createHarness();
      t.h.snapshot = snapshot({ incoming: ['sender'] });
      t.h.inbox = [invite('inv1'), notification('n1', NOTIFICATION_CODES.FRIEND_REQUEST, 'sender')];

      // Act
      await t.start();

      // Assert
      expect(t.h.events).toEqual([]);
    });

    it('should delete friend notifications loaded from the inbox', async () => {
      // Arrange
      const t = createHarness();
      t.h.inbox = [notification('n1', NOTIFICATION_CODES.FRIEND_ACCEPT, 'sender')];

      // Act
      await t.start();

      // Assert
      expect(deletedIds(t)).toEqual(['n1']);
    });

    it('should leave unknown notification codes alone', async () => {
      // Arrange
      const t = createHarness();
      t.h.inbox = [notification('n1', 99, 'sender')];

      // Act
      await t.start();

      // Assert
      expect(t.client.deleteNotifications).not.toHaveBeenCalled();
    });
  });

  describe('foreground and background', () => {
    it('should disconnect when the app goes to the background', async () => {
      // Arrange
      const t = createHarness();
      await t.start();
      const first = t.socket();

      // Act
      await t.setForeground(false);

      // Assert
      expect([first.disconnect.mock.calls.length, t.social.getConnectionPhase(), t.social.getState().connected]).toEqual([
        1,
        'background',
        false,
      ]);
    });

    it('should reconnect on a new socket when the app returns to the foreground', async () => {
      // Arrange
      const t = createHarness();
      await t.start();
      await t.setForeground(false);

      // Act
      await t.setForeground(true);

      // Assert
      expect([t.h.sockets.length, t.social.getState().connected]).toEqual([2, true]);
    });

    it('should not connect when started in the background, then connect on foreground', async () => {
      // Arrange
      const t = createHarness();
      t.h.foreground = false;
      await t.start();
      const beforeForeground = t.createSocket.mock.calls.length;

      // Act
      await t.setForeground(true);

      // Assert
      expect([beforeForeground, t.createSocket.mock.calls.length]).toEqual([0, 1]);
    });

    it('should not schedule a reconnect when the socket drops in the background', async () => {
      // Arrange
      const t = createHarness();
      await t.start();
      t.h.foreground = false;

      // Act
      await t.drop();

      // Assert
      expect([t.social.getConnectionPhase(), t.h.timers.length]).toEqual(['background', 0]);
    });
  });

  describe('network drops and backoff', () => {
    it('should schedule the first reconnect after RECONNECT_BASE_MS when the socket drops', async () => {
      // Arrange
      const t = createHarness();
      await t.start();

      // Act
      await t.drop();

      // Assert
      expect([t.social.getConnectionPhase(), t.h.delays]).toEqual(['backoff', [RECONNECT_BASE_MS]]);
    });

    it('should back off exponentially and cap at 30 s while reconnects keep failing', async () => {
      // Arrange
      const t = createHarness();
      await t.start();
      t.h.connectFailures = 7;
      await t.drop();

      // Act
      await t.advance(RECONNECT_MAX_MS * 10);

      // Assert
      expect(t.h.delays).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
    });

    it('should connect again once a retry succeeds', async () => {
      // Arrange
      const t = createHarness();
      await t.start();
      t.h.connectFailures = 2;
      await t.drop();

      // Act
      await t.advance(RECONNECT_MAX_MS);

      // Assert
      expect([t.social.getState().connected, t.h.sockets.length]).toEqual([true, 4]);
    });

    it('should restart backoff from the base after a successful reconnect', async () => {
      // Arrange
      const t = createHarness();
      await t.start();
      t.h.connectFailures = 2;
      await t.drop();
      await t.advance(RECONNECT_MAX_MS);
      t.h.delays = [];

      // Act
      await t.drop();

      // Assert
      expect(t.h.delays).toEqual([RECONNECT_BASE_MS]);
    });

    it('should retry with backoff when the session lookup throws', async () => {
      // Arrange
      const t = createHarness();
      t.auth.resume.mockRejectedValueOnce(new Error('storage'));

      // Act
      await t.start();

      // Assert
      expect([t.social.getConnectionPhase(), t.h.delays]).toEqual(['backoff', [RECONNECT_BASE_MS]]);
    });

    it('should resolve ensureConnected false when the connect fails', async () => {
      // Arrange
      const t = createHarness();
      t.h.connectFailures = 1;

      // Act
      const connected = await t.social.ensureConnected();

      // Assert
      expect(connected).toBe(false);
    });
  });

  describe('stop', () => {
    it('should leave no timers when stopped during backoff with an invite pending', async () => {
      // Arrange
      const t = createHarness();
      t.h.inbox = [invite('inv1')];
      await t.start();
      await t.drop();

      // Act
      t.social.stop();

      // Assert
      expect(t.h.timers).toEqual([]);
    });

    it('should never reconnect after stop', async () => {
      // Arrange
      const t = createHarness();
      await t.start();
      await t.drop();
      t.social.stop();

      // Act
      await t.advance(RECONNECT_MAX_MS * 10);

      // Assert
      expect(t.h.sockets.length).toBe(1);
    });

    it('should not reconnect on foreground after stop', async () => {
      // Arrange
      const t = createHarness();
      await t.start();
      t.social.stop();

      // Act
      await t.setForeground(false);
      await t.setForeground(true);

      // Assert
      expect(t.h.sockets.length).toBe(1);
    });

    it('should disconnect the socket and clear the state', async () => {
      // Arrange
      const t = createHarness();
      t.h.snapshot = snapshot({ friends: ['a'], incoming: ['b'] });
      t.h.inbox = [invite('inv1')];
      await t.start();

      // Act
      t.social.stop();

      // Assert
      expect([t.socket().disconnect.mock.calls.length, t.social.getState()]).toEqual([
        1,
        { connected: false, availability: {}, incomingRequests: 0, invites: [] },
      ]);
    });

    it('should drop a connect that was in flight when stopped', async () => {
      // Arrange
      const t = createHarness();
      const starting = t.social.start();

      // Act
      t.social.stop();
      await starting;
      await flush();

      // Assert
      expect([t.createSocket.mock.calls.length, t.social.getConnectionPhase()]).toEqual([0, 'off']);
    });
  });
});
