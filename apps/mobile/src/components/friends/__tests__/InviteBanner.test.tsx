/**
 * InviteBanner: the newest table invite, shown on lobby screens and the game
 * summary. A SocialContext value is built here (never SocialProvider, so no
 * socket or native module loads), and the router is mocked so Join can be
 * followed. A Join that hits a dead table is left to the room screen's own
 * `room_not_found` error; the banner has no error state of its own.
 */
import { INVITE_TTL_MS } from '@chkobba/protocol';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useState, type ReactElement } from 'react';

import { en } from '@/i18n/locales/en';
import { EMPTY_SOCIAL_STATE, SocialContext, type SocialContextValue } from '@/online/socialContext';
import type { TableInvite } from '@/online/socialSocket';

import { InviteBanner } from '../InviteBanner';

const mockRouter = { push: jest.fn() };
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockRouter.push(...args) },
}));

const CODE = 'K7M2QX';

function invite(overrides: Partial<TableInvite> = {}): TableInvite {
  return {
    id: 'invite-1',
    fromUserId: 'user-amira',
    fromName: 'Amira',
    code: CODE,
    sentAt: Date.now(),
    expired: false,
    ...overrides,
  };
}

function socialValue(
  options: {
    invites?: readonly TableInvite[];
    handInProgress?: boolean;
    dismissInvite?: (id: string) => Promise<void>;
  } = {},
): SocialContextValue {
  return {
    state: { ...EMPTY_SOCIAL_STATE, invites: options.invites ?? [] },
    friends: null,
    ensureConnected: () => Promise.resolve(false),
    refreshFriends: () => Promise.resolve(),
    dismissInvite: options.dismissInvite ?? (() => Promise.resolve()),
    setActivity: () => {},
    presenceVisibility: 'everyone',
    setPresenceVisibility: () => Promise.resolve({ ok: false, reason: 'network' }),
    handInProgress: options.handInProgress ?? false,
    setHandInProgress: () => {},
    onEvent: () => () => {},
  };
}

async function renderBanner(value: SocialContextValue): Promise<void> {
  await render(
    <SocialContext.Provider value={value}>
      <InviteBanner />
    </SocialContext.Provider>,
  );
}

/** Lets the dismiss promise and the state update it triggers settle. */
async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

/** Removes a dismissed invite from the context's state, as SocialProvider does. */
function InviteHost({ initial, dismissInvite }: { initial: readonly TableInvite[]; dismissInvite: (id: string) => Promise<void> }): ReactElement {
  const [invites, setInvites] = useState<readonly TableInvite[]>(initial);
  return (
    <SocialContext.Provider
      value={socialValue({
        invites,
        dismissInvite: async (id) => {
          await dismissInvite(id);
          setInvites((prev) => prev.filter((entry) => entry.id !== id));
        },
      })}
    >
      <InviteBanner />
    </SocialContext.Provider>
  );
}

describe('InviteBanner', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should name the sender on a live invite', async () => {
    // Arrange
    await renderBanner(socialValue({ invites: [invite()] }));

    // Act
    const message = screen.getByTestId('invite-message');

    // Assert
    expect(message).toHaveTextContent(en.invite.banner.replace('{{name}}', 'Amira'));
  });

  it('should push the invite route with the invite code when Join is pressed', async () => {
    // Arrange
    await renderBanner(socialValue({ invites: [invite()] }));

    // Act
    await fireEvent.press(screen.getByTestId('invite-join'));

    // Assert
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/t/[code]', params: { code: CODE } });
  });

  it('should delete the invite and render nothing after Dismiss', async () => {
    // Arrange
    const dismissInvite = jest.fn(async () => undefined);
    await render(<InviteHost initial={[invite()]} dismissInvite={dismissInvite} />);

    // Act
    await fireEvent.press(screen.getByTestId('invite-dismiss'));
    await settle();

    // Assert
    expect(dismissInvite).toHaveBeenCalledWith('invite-1');
    expect(screen.queryByTestId('invite-banner')).not.toBeOnTheScreen();
  });

  it('should show the closed state without Join when the invite is older than INVITE_TTL_MS', async () => {
    // Arrange
    const expired = invite({ sentAt: Date.now() - INVITE_TTL_MS - 1, expired: true });
    await renderBanner(socialValue({ invites: [expired] }));

    // Act
    const closed = screen.getByTestId('invite-closed');

    // Assert
    expect(closed).toHaveTextContent(en.invite.closed);
    expect(screen.queryByTestId('invite-join')).not.toBeOnTheScreen();
  });

  it('should render nothing while a hand is in progress', async () => {
    // Arrange / Act
    await renderBanner(socialValue({ invites: [invite()], handInProgress: true }));

    // Assert
    expect(screen.queryByTestId('invite-banner')).not.toBeOnTheScreen();
  });
});
