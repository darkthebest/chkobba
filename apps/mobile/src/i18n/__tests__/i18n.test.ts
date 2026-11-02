import { i18n, isolate, RLM } from '../i18n';

describe('interpolation', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('inserts values as they are in a left-to-right language', () => {
    expect(i18n.t('status.waitingFor', { name: 'Hédi' })).toBe('Waiting for Hédi…');
  });

  it('isolates each inserted value in a right-to-left language, so Latin names keep their order', async () => {
    await i18n.changeLanguage('aeb');
    expect(i18n.t('log.took', { name: 'Hédi', cards: '7♦ + 3♠', card: '10♥' })).toBe(
      `${RLM}${isolate('Hédi')} هز ${isolate('7♦ + 3♠')} بـ${isolate('10♥')}`,
    );
  });

  it('uses the "you" wording for our own seat', async () => {
    expect(i18n.t('log.placed', { name: 'You', card: '7♦', context: 'you' })).toBe('You placed 7♦');
    await i18n.changeLanguage('aeb');
    expect(i18n.t('log.placed', { name: 'إنتي', card: '7♦', context: 'you' })).toBe(`${RLM}حطّيت ${isolate('7♦')}`);
  });
});

describe('isolate', () => {
  it('keeps cards and Latin names left to right, and lets Arabic names pick their own direction', () => {
    expect(isolate('5♥')).toBe('⁦5♥⁩');
    expect(isolate('Hédi')).toBe('⁦Hédi⁩');
    expect(isolate('منجي')).toBe('⁨منجي⁩');
  });
});
