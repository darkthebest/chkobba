import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { SKINS } from '@/skins';

describe.each(SKINS.map((skin) => ({ id: skin.id, skin })))('the $id skin', ({ skin }) => {
  const { Background, TableSurface, Avatar, ScoreBoard, Panel, Celebration, Wordmark } = skin.components;

  it('should show both team scores, even past the target', async () => {
    // Arrange
    const props = { scores: { us: 14, them: 23 }, chkobbas: { us: 2, them: 1 }, piles: { us: 20, them: 18 }, round: 4, target: 21, stock: 12, dealerName: 'Amira' };

    // Act
    await render(<ScoreBoard {...props} />);

    // Assert
    expect(screen.getByTestId('score-us')).toHaveTextContent(/14/);
    expect(screen.getByTestId('score-them')).toHaveTextContent(/23/);
  });

  it('should render the table, seats on and off the clock, panels and wordmark', async () => {
    // Arrange
    const tree = (
      <Background>
        <TableSurface>
          <Avatar initial="A" side="us" isTurn isDealer size="md" progress={0.1} />
          <Avatar initial="K" side="them" isTurn={false} isDealer={false} size="sm" />
        </TableSurface>
        <Panel variant="log">
          <Text>log line</Text>
        </Panel>
        <Panel variant="sheet">
          <Text>sheet body</Text>
        </Panel>
        <Wordmark />
      </Background>
    );

    // Act
    await render(tree);

    // Assert
    expect(screen.getByText('A')).toBeOnTheScreen();
    expect(screen.getByText('log line')).toBeOnTheScreen();
    expect(screen.getByText('sheet body')).toBeOnTheScreen();
  });

  it('should name the sweeper in the chkobba celebration', async () => {
    // Act
    await render(<Celebration byName="Karim" side="them" />);

    // Assert
    expect(screen.getByTestId('celebration')).toHaveTextContent(/Karim/);
  });
});
