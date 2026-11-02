import { parseCard, type Card, type GameEvent } from '@chkobba/rules';
import { act, renderHook } from '@testing-library/react-native';

import type { LogEntry } from '../GameClient';
import { CAPTURE_LAND_MS, CAPTURE_SWEEP_MS, useStagedTable, type StagedTable } from '../useStagedTable';

type Props = { table: readonly Card[]; log: readonly LogEntry[] };
const useStagedHook = ({ table, log }: Props): StagedTable => useStagedTable(table, log);

const cards = (...ids: string[]) => ids.map(parseCard);
const ids = (list: readonly { id: string }[]) => list.map((c) => c.id);

let seq = 0;
const entry = (event: GameEvent): LogEntry => ({ seq: ++seq, event });
const played = (seat: number, card: string, captured: string[], chkobba = false) =>
  entry({ type: 'cardPlayed', seat, card: parseCard(card), captured: cards(...captured), chkobba });

describe('useStagedTable', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('shows the table as-is when nothing is being captured', async () => {
    const log = [played(0, '2S', [])];
    const { result } = await renderHook(() => useStagedTable(cards('5H', '2S'), log));
    expect(ids(result.current.cards)).toEqual(['5H', '2S']);
    expect(result.current.staging).toBe(false);
  });

  it('keeps captured cards and the played card on the table until the stage ends', async () => {
    const before: Props = { table: cards('QS', '5H', 'AC'), log: [played(3, 'AC', [])] };
    const { result, rerender } = await renderHook<StagedTable, Props>(useStagedHook, {
      initialProps: before,
    });

    await rerender({ table: cards('5H', 'AC'), log: [...before.log, played(0, 'QD', ['QS'])] });
    expect(result.current.staging).toBe(true);
    expect(ids(result.current.cards)).toEqual(['QS', '5H', 'AC', 'QD']);
    expect(result.current.taking).toEqual(['QS', 'QD']);
    expect(result.current.takingSeat).toBe(0);

    await act(async () => {
      jest.advanceTimersByTime(CAPTURE_LAND_MS);
    });
    expect(result.current.sweeping).toBe(true);
    expect(ids(result.current.cards)).toEqual(['QS', '5H', 'AC', 'QD']);

    await act(async () => {
      jest.advanceTimersByTime(CAPTURE_SWEEP_MS);
    });
    expect(result.current.staging).toBe(false);
    expect(ids(result.current.cards)).toEqual(['5H', 'AC']);
  });

  it('stages round-end leftovers flying to the collecting team', async () => {
    const before: Props = { table: cards('KS', 'QS'), log: [played(2, '7D', ['3S', '4C'])] };
    const { result, rerender } = await renderHook<StagedTable, Props>(useStagedHook, {
      initialProps: before,
    });

    await rerender({
      table: [],
      log: [...before.log, played(3, '2H', []), entry({ type: 'tableCollected', team: 0, cards: cards('KS', 'QS', '2H') })],
    });
    expect(result.current.staging).toBe(true);
    expect(result.current.taking).toEqual(['KS', 'QS', '2H']);
    expect(result.current.takingSeat).toBe(0);
  });
});
