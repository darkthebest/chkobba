/**
 * PlayerRow: one search result and its relation chip. Only "none" is
 * actionable (a real Add button); Friends and Requested are plain text, and
 * Add is disabled while the optimistic action is in flight.
 */
import type { DirectoryPlayer } from '@chkobba/protocol';
import { fireEvent, render, screen } from '@testing-library/react-native';

import type { DirectoryRelation } from '@/directory/useDirectoryController';
import { en } from '@/i18n/locales/en';

import { PlayerRow } from '../PlayerRow';

const NADIA: DirectoryPlayer = { userId: 'u-nadia', name: 'Nadia', presence: 'visible' };
const ADD_LABEL = `${en.directory.chip.add}, ${NADIA.name}`;

async function renderRow(
  options: { relation?: DirectoryRelation; pending?: boolean; presence?: DirectoryPlayer['presence'] } = {},
) {
  const onAdd = jest.fn();
  await render(
    <PlayerRow
      player={{ ...NADIA, presence: options.presence ?? NADIA.presence }}
      relation={options.relation ?? 'none'}
      pending={options.pending ?? false}
      onAdd={onAdd}
    />,
  );
  return { onAdd };
}

describe('PlayerRow', () => {
  it('should offer an Add button when there is no relation yet', async () => {
    // Arrange & Act
    await renderRow({ relation: 'none' });

    // Assert
    expect(screen.getByTestId('directory-add-u-nadia')).toBeEnabled();
    expect(screen.getByRole('button', { name: ADD_LABEL })).toBeOnTheScreen();
  });

  it('should call onAdd with the row player when Add is pressed', async () => {
    // Arrange
    const { onAdd } = await renderRow({ relation: 'none' });

    // Act
    await fireEvent.press(screen.getByTestId('directory-add-u-nadia'));

    // Assert
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('should disable Add while the action for this player is in flight', async () => {
    // Arrange & Act
    await renderRow({ relation: 'none', pending: true });

    // Assert
    expect(screen.getByTestId('directory-add-u-nadia')).toBeDisabled();
  });

  it('should not run the action when Add is pressed while pending', async () => {
    // Arrange
    const { onAdd } = await renderRow({ relation: 'none', pending: true });

    // Act
    await fireEvent.press(screen.getByTestId('directory-add-u-nadia'));

    // Assert
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('should render a plain Requested label, not a button, for an outgoing request', async () => {
    // Arrange & Act
    await renderRow({ relation: 'requested' });

    // Assert
    expect(screen.getByTestId('directory-chip-u-nadia')).toHaveTextContent(en.directory.chip.requested);
    expect(screen.queryByTestId('directory-add-u-nadia')).not.toBeOnTheScreen();
  });

  it('should render a plain Friends label, not a button, for a mutual friend', async () => {
    // Arrange & Act
    await renderRow({ relation: 'friends' });

    // Assert
    expect(screen.getByTestId('directory-chip-u-nadia')).toHaveTextContent(en.directory.chip.friends);
    expect(screen.queryByRole('button', { name: ADD_LABEL })).not.toBeOnTheScreen();
  });

  it('should show the hidden availability of a player who publishes nothing', async () => {
    // Arrange & Act
    await renderRow({ relation: 'none', presence: 'hidden' });

    // Assert
    expect(screen.getByText(en.directory.availability.hidden)).toBeOnTheScreen();
  });
});
