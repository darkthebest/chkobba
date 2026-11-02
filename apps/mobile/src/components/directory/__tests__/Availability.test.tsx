/**
 * Availability: the three outcomes a directory row can show. A hidden player
 * publishes nothing, so they get a neutral label and no dot at all — never the
 * offline wording or the offline dot.
 */
import { act, render, screen } from '@testing-library/react-native';

import { i18n } from '@/i18n';
import { aeb } from '@/i18n/locales/aeb';
import { en } from '@/i18n/locales/en';

import { Availability } from '../Availability';

/** The label's parent is the row; the dot, when shown, is its first child. */
function dotCountOf(label: string): number {
  return (screen.getByText(label).parent?.children.length ?? 0) - 1;
}

async function renderAvailability(presence: 'visible' | 'hidden', availability?: 'online' | 'room' | 'playing' | 'offline') {
  await render(<Availability presence={presence} availability={availability} />);
}

async function switchLanguage(language: 'en' | 'aeb'): Promise<void> {
  await act(async () => {
    await i18n.changeLanguage(language);
  });
}

describe('Availability', () => {
  afterEach(async () => {
    await switchLanguage('en');
  });

  it('should show the live activity and a dot when a visible player is online', async () => {
    // Arrange & Act
    await renderAvailability('visible', 'online');

    // Assert
    expect(screen.getByText(en.friends.availability.online)).toBeOnTheScreen();
    expect(dotCountOf(en.friends.availability.online)).toBe(1);
  });

  it('should show the activity in a game when a visible player is playing', async () => {
    // Arrange & Act
    await renderAvailability('visible', 'playing');

    // Assert
    expect(screen.getByText(en.friends.availability.playing)).toBeOnTheScreen();
  });

  it('should show offline, with the offline dot, when a visible player has no presence', async () => {
    // Arrange & Act
    await renderAvailability('visible');

    // Assert
    expect(screen.getByText(en.friends.availability.offline)).toBeOnTheScreen();
    expect(dotCountOf(en.friends.availability.offline)).toBe(1);
  });

  it('should show the hidden label, not the offline text, when a player publishes nothing', async () => {
    // Arrange & Act
    await renderAvailability('hidden', 'online');

    // Assert
    expect(screen.getByText(en.directory.availability.hidden)).toBeOnTheScreen();
    expect(screen.queryByText(en.friends.availability.offline)).not.toBeOnTheScreen();
  });

  it('should render no dot at all when a player publishes nothing', async () => {
    // Arrange & Act
    await renderAvailability('hidden');

    // Assert
    expect(dotCountOf(en.directory.availability.hidden)).toBe(0);
  });

  it('should render the hidden label in Derja', async () => {
    // Arrange
    await switchLanguage('aeb');

    // Act
    await renderAvailability('hidden');

    // Assert
    expect(screen.getByText(aeb.directory.availability.hidden, { exact: false })).toBeOnTheScreen();
  });
});
