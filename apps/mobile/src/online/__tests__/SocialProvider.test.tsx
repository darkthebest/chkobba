import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Pressable, Text } from 'react-native';

import type { FriendsBackend } from '../friends';
import { SocialProvider } from '../SocialProvider';
import { EMPTY_SOCIAL_STATE, useSocial, type SocialContextValue } from '../socialContext';
import type { SocialEvent, SocialSocket, SocialState } from '../socialSocket';

// The provider is given its socket and friends backend, so the singletons are never built.
jest.mock('../services', () => ({
  getSocialSocket: jest.fn(() => {
    throw new Error('getSocialSocket must not be called when a socket is passed');
  }),
  getFriendsBackend: jest.fn(() => {
    throw new Error('getFriendsBackend must not be called when friends are passed');
  }),
}));

/** A stand-in SocialSocket whose state the test pushes. */
function createFakeSocket() {
  let state: SocialState = EMPTY_SOCIAL_STATE;
  const listeners = new Set<(state: SocialState) => void>();
  const fake = {
    start: jest.fn(async () => undefined),
    stop: jest.fn(),
    getState: jest.fn(() => state),
    subscribe: jest.fn((listener: (s: SocialState) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    onEvent: jest.fn((_listener: (event: SocialEvent) => void) => () => undefined),
    ensureConnected: jest.fn(async () => true),
    refreshFriends: jest.fn(async () => undefined),
    dismissInvite: jest.fn(async () => undefined),
    setActivity: jest.fn(),
  };
  return {
    fake,
    socket: fake as unknown as SocialSocket,
    push(next: SocialState) {
      state = next;
      for (const listener of [...listeners]) listener(state);
    },
  };
}

// The provider reads relations once the socket reports connected; a resolved
// empty snapshot keeps the pre-existing state-forwarding tests deterministic.
const friends = {
  list: jest.fn(() => Promise.resolve({ friends: [], incoming: [], outgoing: [], blocked: [] })),
  recentPlayers: jest.fn(() => Promise.resolve([])),
} as unknown as FriendsBackend;

/** Shows what `useSocial()` returns and keeps the latest value for direct calls. */
let latest: SocialContextValue | null = null;
function Probe() {
  const social = useSocial();
  useEffect(() => {
    latest = social;
  });
  return (
    <>
      <Text testID="connected">{String(social.state.connected)}</Text>
      <Text testID="invites">{social.state.invites.map((invite) => invite.code).join(',')}</Text>
      <Text testID="hand">{String(social.handInProgress)}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Start hand" onPress={() => social.setHandInProgress(true)} />
    </>
  );
}

describe('SocialProvider', () => {
  afterEach(() => {
    latest = null;
    jest.clearAllMocks();
  });

  it('should call start once when mounted', async () => {
    // Arrange
    const { fake, socket } = createFakeSocket();

    // Act
    await render(
      <SocialProvider socket={socket} friends={friends}>
        <Probe />
      </SocialProvider>,
    );

    // Assert
    expect([fake.start.mock.calls.length, fake.stop.mock.calls.length]).toEqual([1, 0]);
  });

  it('should call stop when unmounted', async () => {
    // Arrange
    const { fake, socket } = createFakeSocket();
    const view = await render(
      <SocialProvider socket={socket} friends={friends}>
        <Probe />
      </SocialProvider>,
    );

    // Act
    await view.unmount();

    // Assert
    expect(fake.stop).toHaveBeenCalledTimes(1);
  });

  it('should pass state updates from the socket to useSocial', async () => {
    // Arrange
    const fakeSocket = createFakeSocket();
    await render(
      <SocialProvider socket={fakeSocket.socket} friends={friends}>
        <Probe />
      </SocialProvider>,
    );

    // Act
    await act(async () => {
      fakeSocket.push({
        connected: true,
        availability: { a: 'online' },
        incomingRequests: 1,
        invites: [{ id: 'i1', fromUserId: 'a', fromName: 'A', code: 'ABCDEF', sentAt: 0, expired: false }],
      });
    });

    // Assert
    expect([screen.getByTestId('connected'), screen.getByTestId('invites')].map((n) => n.props.children)).toEqual([
      'true',
      'ABCDEF',
    ]);
  });

  it('should expose the friends backend it was given', async () => {
    // Arrange
    const { socket } = createFakeSocket();

    // Act
    await render(
      <SocialProvider socket={socket} friends={friends}>
        <Probe />
      </SocialProvider>,
    );

    // Assert
    expect(latest?.friends).toBe(friends);
  });

  it('should flip handInProgress when setHandInProgress is called', async () => {
    // Arrange
    const { socket } = createFakeSocket();
    await render(
      <SocialProvider socket={socket} friends={friends}>
        <Probe />
      </SocialProvider>,
    );

    // Act
    await fireEvent.press(screen.getByRole('button', { name: 'Start hand' }));

    // Assert
    expect(screen.getByTestId('hand')).toHaveTextContent('true');
  });

  it('should forward the actions to the socket', async () => {
    // Arrange
    const { fake, socket } = createFakeSocket();
    await render(
      <SocialProvider socket={socket} friends={friends}>
        <Probe />
      </SocialProvider>,
    );
    const listener = jest.fn();

    // Act
    await act(async () => {
      await latest?.ensureConnected();
      await latest?.refreshFriends();
      await latest?.dismissInvite('i1');
      latest?.setActivity('room');
      latest?.onEvent(listener);
    });

    // Assert
    expect([
      fake.ensureConnected.mock.calls.length,
      fake.refreshFriends.mock.calls.length,
      fake.dismissInvite.mock.calls,
      fake.setActivity.mock.calls,
      fake.onEvent.mock.calls,
    ]).toEqual([1, 1, [['i1']], [['room']], [[listener]]]);
  });

  it('should not restart the socket when its state changes', async () => {
    // Arrange
    const fakeSocket = createFakeSocket();
    await render(
      <SocialProvider socket={fakeSocket.socket} friends={friends}>
        <Probe />
      </SocialProvider>,
    );

    // Act
    await act(async () => {
      fakeSocket.push({ ...EMPTY_SOCIAL_STATE, connected: true });
    });

    // Assert
    expect([fakeSocket.fake.start.mock.calls.length, fakeSocket.fake.stop.mock.calls.length]).toEqual([1, 0]);
  });
});

describe('useSocial without a provider', () => {
  afterEach(() => {
    latest = null;
  });

  it('should be disconnected and empty', async () => {
    // Act
    await render(<Probe />);

    // Assert
    expect(latest?.state).toEqual(EMPTY_SOCIAL_STATE);
  });

  it('should have no friends backend', async () => {
    // Act
    await render(<Probe />);

    // Assert
    expect(latest?.friends).toBeNull();
  });

  it('should resolve ensureConnected false', async () => {
    // Arrange
    await render(<Probe />);

    // Act
    const connected = await latest?.ensureConnected();

    // Assert
    expect(connected).toBe(false);
  });

  it('should make every action a harmless no-op', async () => {
    // Arrange
    await render(<Probe />);
    const value = latest as SocialContextValue;

    // Act
    const results = await Promise.all([value.refreshFriends(), value.dismissInvite('x')]);
    value.setActivity('playing');
    value.setHandInProgress(true);
    const unsubscribe = value.onEvent(() => undefined);

    // Assert
    expect([results, typeof unsubscribe, unsubscribe(), value.handInProgress]).toEqual([
      [undefined, undefined],
      'function',
      undefined,
      false,
    ]);
  });
});
