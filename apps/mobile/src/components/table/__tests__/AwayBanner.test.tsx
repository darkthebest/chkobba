import { fireEvent, render, screen } from '@testing-library/react-native';

import { AwayBanner } from '../AwayBanner';

describe('AwayBanner', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should show the banner when the player is away', async () => {
    // Arrange
    const onBack = jest.fn();

    // Act
    await render(<AwayBanner away onBack={onBack} />);

    // Assert
    expect(screen.getByTestId('away-banner')).toBeOnTheScreen();
  });

  it('should announce that a bot is playing for the player when they are away', async () => {
    // Arrange
    const onBack = jest.fn();

    // Act
    await render(<AwayBanner away onBack={onBack} />);

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent(/a bot is playing for you/);
  });

  it("should offer a separately focusable I'm back button when the player is away", async () => {
    // Arrange
    const onBack = jest.fn();

    // Act
    await render(<AwayBanner away onBack={onBack} />);

    // Assert
    expect(screen.getByRole('button', { name: "I'm back" })).toHaveProp('testID', 'away-back');
  });

  it("should call onBack when the I'm back button is pressed", async () => {
    // Arrange
    const onBack = jest.fn();
    await render(<AwayBanner away onBack={onBack} />);

    // Act
    await fireEvent.press(screen.getByTestId('away-back'));

    // Assert
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('should render nothing when the player is not away', async () => {
    // Arrange
    const onBack = jest.fn();

    // Act
    await render(<AwayBanner away={false} onBack={onBack} />);

    // Assert
    expect(screen.queryByTestId('away-banner')).not.toBeOnTheScreen();
  });
});
