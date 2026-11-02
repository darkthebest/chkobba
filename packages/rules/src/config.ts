/**
 * Every rule that differs between sources is a flag here, so house variants are
 * configuration, not code. Defaults are the most common Tunisian rules — see
 * context/docs/research-rules-and-engines.md.
 */
export interface RulesConfig {
  /** Capture values of the face cards. Tunisian default: Queen 8, Jack 9, King 10. */
  faceValues: 'Q8_J9_K10' | 'J8_Q9_K10';
  /**
   * - playedCardMustCapture: any card may be played, but if it can capture it must.
   * - mustCaptureIfAnyCardCan: if any card in hand can capture, the player must capture.
   * - optional: capturing is never forced.
   */
  captureObligation: 'playedCardMustCapture' | 'mustCaptureIfAnyCardCan' | 'optional';
  /** A same-rank table card must be taken instead of any sum combination. */
  rankPriority: boolean;
  /**
   * Each round the first player sees the cut card and either keeps it (dealt 2
   * more) or throws it face up on the table (the table gets 3 more).
   */
  cutCardChoice: boolean;
  /** When the opening four table cards force a reshuffle. */
  initialRedeal: 'threeOrMoreSameRank' | 'threeOrMoreKings' | 'none';
  /** Whether a sweep with the final card of the round scores a chkobba. */
  lastCardChkobba: boolean;
  /** Points needed to win the game; checked only at the end of a round. */
  targetScore: number;
  /** Require a two-point lead to win once the target is reached. */
  winByTwo: boolean;
  /** Capturing all ten diamonds in one round wins the game outright. */
  instantWinAllDineri: boolean;
}

export const DEFAULT_RULES: RulesConfig = {
  faceValues: 'Q8_J9_K10',
  captureObligation: 'playedCardMustCapture',
  rankPriority: true,
  cutCardChoice: true,
  initialRedeal: 'threeOrMoreSameRank',
  lastCardChkobba: false,
  targetScore: 21,
  winByTwo: false,
  instantWinAllDineri: false,
};

export function resolveRules(overrides: Partial<RulesConfig> = {}): RulesConfig {
  return { ...DEFAULT_RULES, ...overrides };
}
