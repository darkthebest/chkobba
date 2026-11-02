import { render, screen } from '@testing-library/react-native';

import { ReconnectingBanner } from '../ReconnectingBanner';

describe('ReconnectingBanner', () => {
  it('should say Reconnecting when the link dropped after joining', async () => {
    // Arrange
    const connection = 'reconnecting' as const;

    // Act
    await render(<ReconnectingBanner connection={connection} />);

    // Assert
    expect(screen.getByTestId('reconnecting-banner')).toHaveTextContent('Reconnecting…');
  });

  it('should say Connecting when the first connection is still being made', async () => {
    // Arrange
    const connection = 'connecting' as const;

    // Act
    await render(<ReconnectingBanner connection={connection} />);

    // Assert
    expect(screen.getByTestId('reconnecting-banner')).toHaveTextContent('Connecting…');
  });

  it('should give the banner the alert role when the link is down', async () => {
    // Arrange
    const connection = 'reconnecting' as const;

    // Act
    await render(<ReconnectingBanner connection={connection} />);

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent('Reconnecting…');
  });

  it('should announce the banner politely when the link is down', async () => {
    // Arrange
    const connection = 'reconnecting' as const;

    // Act
    await render(<ReconnectingBanner connection={connection} />);

    // Assert
    expect(screen.getByTestId('reconnecting-banner')).toHaveProp('accessibilityLiveRegion', 'polite');
  });

  it('should render nothing when the client is online', async () => {
    // Arrange
    const connection = 'online' as const;

    // Act
    await render(<ReconnectingBanner connection={connection} />);

    // Assert
    expect(screen.queryByTestId('reconnecting-banner')).not.toBeOnTheScreen();
  });

  it('should render nothing in an offline game where there is no connection state', async () => {
    // Arrange
    const connection = undefined;

    // Act
    await render(<ReconnectingBanner connection={connection} />);

    // Assert
    expect(screen.queryByTestId('reconnecting-banner')).not.toBeOnTheScreen();
  });
});
