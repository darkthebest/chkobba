import { EMOTE_IDS, type EmoteId } from '@chkobba/protocol';
import type { TFunction } from '@/i18n';

export { EMOTE_COOLDOWN_MS, EMOTE_IDS, isEmoteId, type EmoteId } from '@chkobba/protocol';

type EmojiId = 'thumbs' | 'laugh' | 'facepalm' | 'fire' | 'wow' | 'pray';
type PhraseId = Exclude<EmoteId, EmojiId>;

/** Emoji emotes show their glyph in every language; the rest are translated phrases. */
const GLYPHS: Record<EmojiId, string> = {
  thumbs: '👍',
  laugh: '😂',
  facepalm: '🤦',
  fire: '🔥',
  wow: '😮',
  pray: '🙏',
};

function isEmoji(id: EmoteId): id is EmojiId {
  return id in GLYPHS;
}

export const EMOJI_IDS: readonly EmoteId[] = EMOTE_IDS.filter(isEmoji);
export const PHRASE_IDS: readonly EmoteId[] = EMOTE_IDS.filter((id) => !isEmoji(id));

/** The quick row before the player has sent anything. */
export const DEFAULT_QUICK: readonly EmoteId[] = ['thumbs', 'laugh', 'yalla', 'facepalm'];
export const QUICK_SIZE = 4;
/** How long a bubble stays up. */
export const BUBBLE_MS = 2600;

export function isPhrase(id: EmoteId): boolean {
  return !isEmoji(id);
}

/** What the bubble shows: the emoji, or the phrase in the player's language. */
export function emoteText(id: EmoteId, tr: TFunction): string {
  return isEmoji(id) ? GLYPHS[id] : tr(`emotes.phrases.${id satisfies PhraseId}`);
}

/** Spoken name, for screen readers. */
export function emoteName(id: EmoteId, tr: TFunction): string {
  return tr(`emotes.names.${id}`);
}

/** The quick row after sending `id`: most recent first, no repeats. */
export function nextQuick(quick: readonly EmoteId[], id: EmoteId): EmoteId[] {
  return [id, ...quick.filter((q) => q !== id)].slice(0, QUICK_SIZE);
}
