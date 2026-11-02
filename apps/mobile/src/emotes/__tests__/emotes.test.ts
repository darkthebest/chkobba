import AsyncStorage from '@react-native-async-storage/async-storage';

import type { TFunction } from '@/i18n';

import { DEFAULT_QUICK, EMOJI_IDS, EMOTE_IDS, emoteText, nextQuick, PHRASE_IDS } from '../catalog';
import { getEmotePrefs, loadEmotePrefs, parseEmotePrefs, resetEmotePrefsForTests, setEmotePrefs } from '../prefs';

const tr = ((key: string) => `<${key}>`) as unknown as TFunction;

describe('emote catalog', () => {
  it('should split every emote into exactly one of emoji or phrase', () => {
    // Assert
    expect([...EMOJI_IDS, ...PHRASE_IDS].sort()).toEqual([...EMOTE_IDS].sort());
  });

  it('should show an emoji as its glyph in every language', () => {
    // Act
    const text = emoteText('fire', tr);

    // Assert
    expect(text).toBe('🔥');
  });

  it('should translate a phrase', () => {
    // Act
    const text = emoteText('yalla', tr);

    // Assert
    expect(text).toBe('<emotes.phrases.yalla>');
  });

  it.each([
    { scenario: 'a new emote goes first and the oldest drops', quick: DEFAULT_QUICK, id: 'bravo', expected: ['bravo', 'thumbs', 'laugh', 'yalla'] },
    { scenario: 'a quick emote moves to the front', quick: DEFAULT_QUICK, id: 'yalla', expected: ['yalla', 'thumbs', 'laugh', 'facepalm'] },
    { scenario: 'the newest stays put', quick: DEFAULT_QUICK, id: 'thumbs', expected: ['thumbs', 'laugh', 'yalla', 'facepalm'] },
  ] as const)('should reorder the quick row when $scenario', ({ quick, id, expected }) => {
    // Act
    const next = nextQuick(quick, id);

    // Assert
    expect(next).toEqual(expected);
  });
});

describe('emote prefs', () => {
  beforeEach(async () => {
    resetEmotePrefsForTests();
    await AsyncStorage.clear();
  });

  it.each([
    { scenario: 'nothing saved', raw: null, expected: {} },
    { scenario: 'broken JSON', raw: '{nope', expected: {} },
    { scenario: 'a saved mute', raw: '{"mutedAll":true}', expected: { mutedAll: true } },
    { scenario: 'a full quick row', raw: '{"quick":["bravo","thumbs","laugh","yalla"]}', expected: { quick: ['bravo', 'thumbs', 'laugh', 'yalla'] } },
    { scenario: 'a quick row with an unknown id', raw: '{"quick":["kiss","thumbs","laugh","yalla"]}', expected: {} },
    { scenario: 'a quick row with a repeat', raw: '{"quick":["laugh","thumbs","laugh","yalla"]}', expected: {} },
    { scenario: 'a mute that is not a boolean', raw: '{"mutedAll":"yes"}', expected: {} },
  ])('should parse $scenario', ({ raw, expected }) => {
    // Act
    const parsed = parseEmotePrefs(raw);

    // Assert
    expect(parsed).toEqual(expected);
  });

  it('should remember a change across a reload', async () => {
    // Arrange
    setEmotePrefs({ mutedAll: true, quick: ['bravo', 'thumbs', 'laugh', 'yalla'] });
    resetEmotePrefsForTests();

    // Act
    await loadEmotePrefs();

    // Assert
    expect(getEmotePrefs()).toEqual({ mutedAll: true, quick: ['bravo', 'thumbs', 'laugh', 'yalla'] });
  });
});
