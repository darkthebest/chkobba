import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { SoundProvider } from '@/audio/SoundProvider';
import { SocialToasts } from '@/components/friends/SocialToasts';
import { DeckProvider } from '@/decks';
import { LanguageProvider } from '@/i18n';
import { SocialProvider } from '@/online/SocialProvider';
import { SkinProvider } from '@/skins';
import { SKIN_FONTS } from '@/skins/fonts';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(SKIN_FONTS);
  // Fall back to system fonts rather than blocking the app if a font fails to load.
  if (!fontsLoaded && !fontError) return null;

  return (
    <LanguageProvider>
      <SkinProvider>
        <DeckProvider>
          <SoundProvider>
            <SocialProvider>
              <StatusBar style="light" />
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#000' } }} />
              {/* Over every screen; silent while a hand is played. */}
              <SocialToasts />
            </SocialProvider>
          </SoundProvider>
        </DeckProvider>
      </SkinProvider>
    </LanguageProvider>
  );
}
