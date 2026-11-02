import { resources } from '../i18n';
import { LANGUAGE_CODES } from '../languages';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.set(path, value);
    else for (const [k, v] of flatten(value, path)) out.set(k, v);
  }
  return out;
}

const placeholders = (text: string) => [...text.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]).sort();
const english = flatten(resources.en.translation as Tree);

describe.each(LANGUAGE_CODES.filter((code) => code !== 'en'))('the %s catalog', (code) => {
  const catalog = flatten(resources[code].translation as Tree);

  it('has exactly the English keys', () => {
    expect([...catalog.keys()].sort()).toEqual([...english.keys()].sort());
  });

  it('translates every string', () => {
    const empty = [...catalog].filter(([, text]) => text.trim() === '').map(([key]) => key);
    expect(empty).toEqual([]);
  });

  it('keeps the same {{placeholders}} as English', () => {
    const mismatched = [...english]
      .filter(([key, text]) => placeholders(text).join() !== placeholders(catalog.get(key) ?? '').join())
      .map(([key]) => key);
    expect(mismatched).toEqual([]);
  });
});
