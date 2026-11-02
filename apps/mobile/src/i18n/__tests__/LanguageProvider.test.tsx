import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { i18n, LanguageProvider, useLanguage, useT } from '..';

function Probe() {
  const tr = useT();
  const { language, dir, setLanguage } = useLanguage();
  return (
    <>
      <Text testID="text">{tr('help.title')}</Text>
      <Text testID="state">{`${language}:${dir}`}</Text>
      <Pressable testID="to-aeb" onPress={() => setLanguage('aeb')} />
    </>
  );
}

describe('LanguageProvider', () => {
  afterEach(async () => {
    await AsyncStorage.clear();
    await act(() => i18n.changeLanguage('en'));
  });

  it('switches text and direction at once, and remembers the choice', async () => {
    await render(
      <LanguageProvider initial="en">
        <Probe />
      </LanguageProvider>,
    );
    expect(screen.getByTestId('text')).toHaveTextContent('How to play');

    await fireEvent.press(screen.getByTestId('to-aeb'));

    await waitFor(() => expect(screen.getByTestId('text')).toHaveTextContent(/كيفاش تلعب/));
    expect(screen.getByTestId('state')).toHaveTextContent('aeb:rtl');
    expect(await AsyncStorage.getItem('chkobba.language')).toBe('aeb');
  });

  it('lays the app out right to left for Derja', async () => {
    await render(
      <LanguageProvider initial="aeb">
        <Probe />
      </LanguageProvider>,
    );
    expect(screen.getByTestId('language-root')).toHaveStyle({ direction: 'rtl' });
  });

  it('restores a saved language', async () => {
    await AsyncStorage.setItem('chkobba.language', 'aeb');
    await render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('aeb:rtl'));
  });
});
