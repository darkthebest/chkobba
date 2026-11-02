# ADR-0002: Private tables: room codes, membership and host model

**Status:** Accepted
**Date:** 2026-10-30
**Plan:** `context/plans/2026-10-30-private-tables.md`

## Context

- Tables today are public: `quick_match` finds or creates one and fills it, with bots after a wait. Friends cannot play together on purpose.
- Private tables need an invite code (and a share link), no auto-backfill, a host who presses Start, free seat choice, and late join into a running game.
- Clients can list authoritative matches with label queries, so anything in the match label is readable by every client.
- Guest accounts are free (device auth), so any per-user abuse limit can be dodged with throwaway accounts.
- Shipped builds must keep working: every `@chkobba/protocol` change is additive, and old builds have no code entry, so they cannot reach a private table.

## Decision

### Code mapping lives in storage, not in the label

A code in the label would leak every live code to anyone who lists matches. So:

- The label keeps `private: true` and `open: false`. `quick_match` (`+label.private:F`) and any future open-tables list never see the table.
- The mapping is one system-owned record per code, `private_table/<code>`, with `permissionRead` 0 and `permissionWrite` 0. It holds `RoomCodeRecord { matchId, createdAt }`.
- It is written with a version check, so two tables cannot claim one code.
- `create_private_table` passes `{ private: 'true', code }` to `nk.matchCreate` — string values, since Nakama may stringify params; `matchInit` accepts both `'true'` and `true`, and keeps the code in table state. (2026-10-31: the original text showed `private: true`.)

### Code space and brute force

| Item | Value |
|---|---|
| Alphabet | 32 symbols: `A-Z` without `I` and `O`, digits `2-9` (no `0`, `1`) |
| Length | 6, so 32^6 ≈ 1.07e9 codes |
| Input | Normalized (uppercase, spaces and dashes removed), then format-checked, in `@chkobba/protocol` `room.ts` |
| Lookup limit | 10 failed `join_by_code` lookups per user per 10 minutes, in a server-owned `private_table/limits` record. A bad format (`room_bad_code`) counts as a failed lookup |
| Create limit | 5 private tables per user per 10 minutes, same record and window |

- With a few hundred live tables, a guess hits with probability around 1e-7. At 10 guesses per 10 minutes per account, guessing is impractical for one account.
- Caveat: guests are free, so a script can mint accounts and dodge a per-user limit. Even then, the code space is large against the live-table count, so this is accepted for v1.
- Later hardening: a per-IP limit through `ctx.clientIp`.

### The join gate: the code travels in join metadata

The storage mapping is not the only way in. Nakama lets a client join any match by id, and match ids appear in match listings (`matchList` with a label query). A listed private table would therefore be joinable without its code. So:

- A private table admits a newcomer only when the join metadata carries its code: `metadata[ROOM_JOIN_CODE_KEY]` (`'code'`) must normalize to the table's code. The mobile client sends `{ code }` on every private join, whether it came from `/private` or a `/t/CODE` link.
- Members reclaiming their seat by `userId` are exempt, so a reconnect never needs the code again.
- A missing or wrong code is refused as `room_not_found`, the same answer as a dead code, so a listed match id confirms nothing.
- `join_by_code` still resolves the code to a match id; the client then joins with the code as metadata. The two steps are both required.
- This is an amendment to the original decision (added during implementation): without it, listing `+label.private:T` defeated the storage mapping. The ADR records it here rather than leaving it implicit.

### Members are separate from seats

- A private table tracks the humans present as `members`, in join order. A member is seated or standing (no seat yet, or the game is full). At most `ROOM_MAX_MEMBERS` (8).
- Being in the room and sitting are separate actions. This keeps switching, host handover and late join simple.
- One intent covers sitting: `SIT { seat }` takes an empty seat in the waiting room (switching from the current one), and lets a standing member take over a bot seat during a game.
- `START` is host-only. There is no STAND intent: leaving the room means leaving the match.
- Public tables keep `room: null` and behave exactly as before. Every private branch checks `room !== null`.

### Host rule

- The host is the earliest present member.
- The host keeps the crown while they are in `members`, even absent with their seat played by a bot. When the host is removed — leaving the waiting room, or standing up and leaving mid-game — the earliest present member takes the crown, or nobody if the room is empty. This is a deliberate exception to "nothing changes during a game": the alternative is a room with no one able to start the next game.
- A host who drops and rejoins loses the crown, because rejoining puts them at the end of the join order. Accepted for v1.

### Standing members: `seat: -1` and no view

- A standing member gets a snapshot with `seat: -1` and `view: null`. The room info carries the team scores, so they can follow the game without a `PlayerView`. No hidden information can reach them.
- The current mobile decoder accepts only seats 0-3, so an old build drops such a snapshot instead of misreading it. Old builds have no code entry, so they never meet one in practice.

### Cleanup on close and lazy liveness

- When the match ends it deletes its own mapping, only if the record still points to that match.
- `join_by_code` also checks liveness: if `nk.matchGet` returns null (for example after a server restart) or the label is not private, it deletes the stale record and returns `room_not_found`.

## Consequences

**Positive**

- Codes cannot be harvested by listing matches; the label stays free of secrets.
- The wire change is additive, and public play is untouched.
- Membership is separate from seating, so host handover, switching and late join share one model.
- No `PlayerView` is built for standing members, so they cannot leak hidden cards.

**Negative and mitigations**

| Consequence | Mitigation |
|---|---|
| A per-user lookup limit can be dodged with throwaway guests | The code space (1.07e9) dwarfs the live-table count; add a per-IP limit via `ctx.clientIp` if abuse shows up |
| A brief host drop hands the crown to the next member | Accepted for v1; the old host can rejoin as a normal member |
| Stale mapping records after a crash or restart | Lazy liveness check in `join_by_code` removes them; the record is tiny |
| Two tables race for one code | Version-checked write; the creator retries with a new code |
| Standing members see no cards | Intended for v1; they see seats, scores and a take-over button |
| Old builds drop `seat: -1` snapshots | They cannot enter a private table; the decoder rejects instead of misreading |
| Extra storage reads and writes per create and failed lookup | Limited to room lifecycle; no per-move cost |
| Clients can join a listed match by id without the code | Join metadata must carry the code; wrong or missing codes answer `room_not_found` like a dead code (see "The join gate") |

## Alternatives considered

| Alternative | Why not |
|---|---|
| Code in the match label, searched with a label query | Any client can list authoritative matches and read every live code |
| Rely on the storage mapping alone to keep strangers out | A client can join a match by id; the join-metadata check closes that path |
| Deterministic code derived from the match id | Guessable from an id, and the id can leak; a random code with a mapping is independent of it |
| Separate lobby service for rooms | Another moving part; Nakama storage and the match already cover it |
| Spectator view for standing members | Needs a filtered `PlayerView` and a hidden-information review; deferred, scores plus take-over are enough |
| Seats only, no members | Standing arrivals, host handover and late join need someone present but not seated |
| Per-IP limit only | `ctx.clientIp` is unreliable behind proxies; a per-user limit ships now, per-IP can be added later |

## Related

- [Multiplayer architecture](../explanation/multiplayer-architecture.md)
- [Wire protocol](../reference/wire-protocol.md)
- [ADR-0001](0001-durable-guest-identity-and-display-names.md)
