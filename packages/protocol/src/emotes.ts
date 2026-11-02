/**
 * Table emotes: a fixed set, no free text, so there is nothing to moderate.
 * Only ids travel on the wire; each client shows them in its own language.
 * Appending ids is additive; removing or renaming one breaks shipped builds.
 */
export const EMOTE_IDS = [
  'thumbs',
  'laugh',
  'facepalm',
  'fire',
  'wow',
  'pray',
  'yalla',
  'sahha',
  'mabrouk',
  'bravo',
  'khsara',
  'chwaya',
] as const;
export type EmoteId = (typeof EMOTE_IDS)[number];

/** One emote per seat per this many ms; the server drops extras silently. */
export const EMOTE_COOLDOWN_MS = 3000;

/** Client → server (opcode EMOTE). */
export interface EmoteIntent {
  readonly id: EmoteId;
}

/** Server → every seated session (opcode EMOTE_SHOWN). Not part of the snapshot. */
export interface EmoteShown {
  readonly seat: number;
  readonly id: EmoteId;
}

export function isEmoteId(value: unknown): value is EmoteId {
  for (let i = 0; i < EMOTE_IDS.length; i++) if (EMOTE_IDS[i] === value) return true;
  return false;
}
