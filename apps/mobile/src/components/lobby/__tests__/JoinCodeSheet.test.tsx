/**
 * JoinCodeSheet: the "Join with code" field. Input is normalized as typed and
 * Join only goes through for a well-formed room code.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import { JoinCodeSheet } from '@/components/lobby/JoinCodeSheet';

async function renderSheet() {
  const onJoin = jest.fn();
  const onClose = jest.fn();
  await render(<JoinCodeSheet onJoin={onJoin} onClose={onClose} />);
  return { onJoin, onClose };
}

async function type(text: string): Promise<void> {
  await fireEvent.changeText(screen.getByTestId('join-code-input'), text);
}

describe('JoinCodeSheet', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    ['lowercase', 'k7m2qx', 'K7M2QX'],
    ['spaces', 'K7M 2QX', 'K7M2QX'],
    ['a dash', 'k7m-2qx', 'K7M2QX'],
    ['more than 6 characters', 'K7M2QXAB', 'K7M2QX'],
  ])('should normalize %s to the uppercase 6-character code', async (_label, input, expected) => {
    // Arrange
    await renderSheet();

    // Act
    await type(input);

    // Assert
    expect(screen.getByTestId('join-code-input')).toHaveDisplayValue(expected);
  });

  it('should disable Join while the field is empty', async () => {
    // Arrange & Act
    await renderSheet();

    // Assert
    expect(screen.getByTestId('join-code-submit')).toBeDisabled();
  });

  it('should disable Join while the code is too short', async () => {
    // Arrange
    await renderSheet();

    // Act
    await type('K7M2');

    // Assert
    expect(screen.getByTestId('join-code-submit')).toBeDisabled();
  });

  it('should enable Join for a valid code', async () => {
    // Arrange
    await renderSheet();

    // Act
    await type('k7m2qx');

    // Assert
    expect(screen.getByTestId('join-code-submit')).toBeEnabled();
  });

  it('should not show an error while a short code is being typed', async () => {
    // Arrange
    await renderSheet();

    // Act
    await type('K7M');

    // Assert
    expect(screen.queryByTestId('join-code-error')).not.toBeOnTheScreen();
  });

  it.each(['0OOOOO', 'K7M2I1'])('should keep Join disabled for the invalid code %s', async (code) => {
    // Arrange
    await renderSheet();

    // Act
    await type(code);

    // Assert
    expect(screen.getByTestId('join-code-submit')).toBeDisabled();
  });

  it.each(['0OOOOO', 'K7M2I1'])('should show the error for the full-length invalid code %s', async (code) => {
    // Arrange
    await renderSheet();

    // Act
    await type(code);

    // Assert
    expect(screen.getByTestId('join-code-error')).toHaveTextContent('Codes are 6 letters and digits.');
  });

  it.each(['0OOOOO', 'K7M2I1'])('should not join with the invalid code %s from the keyboard', async (code) => {
    // Arrange
    const { onJoin } = await renderSheet();
    await type(code);

    // Act
    await fireEvent(screen.getByTestId('join-code-input'), 'submitEditing');

    // Assert
    expect(onJoin).not.toHaveBeenCalled();
  });

  it('should not join when the disabled Join button is pressed', async () => {
    // Arrange
    const { onJoin } = await renderSheet();
    await type('0OOOOO');

    // Act
    await fireEvent.press(screen.getByTestId('join-code-submit'));

    // Assert
    expect(onJoin).not.toHaveBeenCalled();
  });

  it('should show the error when a short code is submitted from the keyboard', async () => {
    // Arrange
    await renderSheet();
    await type('K7M');

    // Act
    await fireEvent(screen.getByTestId('join-code-input'), 'submitEditing');

    // Assert
    expect(screen.getByTestId('join-code-error')).toBeOnTheScreen();
  });

  it('should clear the error when the code is edited', async () => {
    // Arrange
    await renderSheet();
    await type('K7M');
    await fireEvent(screen.getByTestId('join-code-input'), 'submitEditing');

    // Act
    await type('K7M2');

    // Assert
    expect(screen.queryByTestId('join-code-error')).not.toBeOnTheScreen();
  });

  it('should call onJoin with the normalized code when Join is pressed', async () => {
    // Arrange
    const { onJoin } = await renderSheet();
    await type('k7m-2qx');

    // Act
    await fireEvent.press(screen.getByTestId('join-code-submit'));

    // Assert
    expect(onJoin).toHaveBeenCalledWith('K7M2QX');
  });

  it('should call onJoin with the code when a valid code is submitted from the keyboard', async () => {
    // Arrange
    const { onJoin } = await renderSheet();
    await type('K7M2QX');

    // Act
    await fireEvent(screen.getByTestId('join-code-input'), 'submitEditing');

    // Assert
    expect(onJoin).toHaveBeenCalledWith('K7M2QX');
  });

  it('should call onClose when the sheet is closed', async () => {
    // Arrange
    const { onClose } = await renderSheet();

    // Act
    await fireEvent.press(screen.getByTestId('sheet-close'));

    // Assert
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
