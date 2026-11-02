# Change the profanity list

Add or remove a blocked or reserved word for display names. The check runs on the server only; the lists never reach the client. Background: [Display names](../reference/wire-protocol.md#display-names).

## Where the lists live

`apps/server/src/account/profanity.ts`:

| List | Holds |
|---|---|
| `EN_BLOCKED` | English obscenities and slurs |
| `FR_BLOCKED` | French (write without accents) |
| `DERJA_ARABIC_BLOCKED` | Tunisian Derja, Arabic script |
| `DERJA_LATIN_BLOCKED` | Derja in Latin script (Arabizi) |
| `RESERVED_WORDS` | Staff and brand words (`admin`, `chkobba`, ...) |

Entries are `{ word, match }`. Write words naturally; they are folded once at module load.

## Pick a match mode

| Mode | Matches | Use when |
|---|---|---|
| `substring` | Anywhere in the folded name with spaces stripped (`xFuckx`, `f u c k`) | A long, unambiguous root that no real name contains |
| `word` | One whole space-separated token, or the whole name with spaces stripped | The entry is a substring of a real name |

Rule of thumb: if the entry appears inside any real name, use `word` (the Scunthorpe problem: `nique` in Monique, `nazi` in Nazih, `زب` in زبيدة). Otherwise `substring`. Add a comment naming the real names that forced `word`.

## Folding

Both the name and each entry go through `foldName` before comparing:

- Lowercase; spaces removed.
- Leetspeak: `0→o 1→i 3→e 4→a 5→s @→a`. Arabic-Indic digits map to ASCII first, then the same leetspeak.
- Arabic variants: `أ إ آ → ا`, `ة → ه`, `ى → ي`, `ڤ→ف`, `ڨ→ق`, `پ→ب`.
- Latin-1 accents to the base letter (`ß→ss`, `æ→ae`).

So one entry covers its case, accent and leetspeak variants. Write entries in folded-compatible form (no accents needed).

## Accepted gaps

Pinned as passing tests; do not "fix" them without checking false positives:

- Repeated letters (`fuuuck`): collapsing would block `Nigeria`.
- Letter swaps (`fvck`).
- `word` entries glued to other text (`Shitty`, `zebiX`).

## Steps

1. Add the entry to the right list.
2. Update `apps/server/src/account/__tests__/profanity.test.ts`:
   - Every list entry is already tested as blocked; confirm the new one passes.
   - If you added a `word` entry, add real names that contain it to the must-pass names list.
3. Run the tests: `pnpm --filter @chkobba/server test`.
4. Build the module: `pnpm --filter @chkobba/server build`.
5. Restart Nakama: `docker compose restart nakama`.
6. Check the logs for `Chkobba module loaded`: `docker compose logs nakama | grep "Chkobba module loaded"`.

## goja constraints

The module is bundled to ES5 and runs in goja. In `profanity.ts` and shared name code:

- No `\p{...}` classes and no regex `u` flag; use explicit `\uXXXX` ranges.
- No `String.prototype.normalize` (accents are folded with the map), no `padStart`, no `flatMap`.

## Related

- [Wire protocol: Display names](../reference/wire-protocol.md#display-names)
- [Local backend](local-backend.md)
