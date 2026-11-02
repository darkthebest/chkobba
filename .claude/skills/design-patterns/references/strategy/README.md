# Strategy Pattern

Defines a family of interchangeable algorithms behind a common interface and lets the client pick one at runtime. The algorithm varies independently from the code that uses it.

## When To Use

- Multiple related algorithms share a common contract (3+).
- Algorithm choice depends on runtime state (config, input shape, environment).
- Need to swap implementations without touching client code.
- A growing switch/if-else for "which behavior" needs refactoring.

## When NOT To Use

- Only one algorithm. Don't invent variation that doesn't exist.
- Behavior set is closed and trivial — 2-branch switch is clearer.
- Algorithms don't share a meaningful contract.
- Strategy would expose internals of the context.

## Disambiguation

- **vs Factory** — strategy *uses* a varying object; factory *creates* it. They compose: factory returns the right strategy, context invokes it.
- **vs Template Method** — strategy varies the *whole* algorithm via composition; template method varies *steps* via inheritance.
- **vs Polymorphism** — strategy is polymorphism, just intentional and contract-driven instead of incidental.

## Use Cases

| Scenario                  | Problem                                                | Solution                                              |
|---------------------------|--------------------------------------------------------|-------------------------------------------------------|
| Field validation          | Email/phone/URL need different validation              | One `Validator` interface, one strategy per field kind |
| Export formats            | JSON/CSV/XML differ in serialization + content-type    | One `Exporter` strategy per format                    |
| Node processing modes     | Sync/async/batch chosen by load + config               | Context routes to right processor strategy            |
| Cache backend             | Memory in dev, Redis in prod                           | `CacheStrategy` selected from config at boot          |

## Code Example

```typescript
// design-patterns/strategy - Vanilla TypeScript Example
// Strategy Pattern - Vanilla TypeScript Example
// Pure TypeScript classes, no DI framework, no decorators

// --- Strategy Interface ---

export interface CompressionStrategy {
  compress(data: string): CompressedData;
  decompress(data: CompressedData): string;
  name: string;
}

export interface CompressedData {
  content: string;
  algorithm: string;
  originalSize: number;
  compressedSize: number;
}

// --- Concrete Strategies ---

export class RunLengthEncoding implements CompressionStrategy {
  name = 'rle';

  compress(data: string): CompressedData {
    let encoded = '';
    let count = 1;
    for (let i = 1; i <= data.length; i++) {
      if (i < data.length && data[i] === data[i - 1]) {
        count++;
      } else {
        encoded += count > 1 ? `${count}${data[i - 1]}` : data[i - 1];
        count = 1;
      }
    }
    return {
      content: encoded,
      algorithm: this.name,
      originalSize: data.length,
      compressedSize: encoded.length,
    };
  }

  decompress(data: CompressedData): string {
    let decoded = '';
    let i = 0;
    while (i < data.content.length) {
      let numStr = '';
      while (i < data.content.length && /\d/.test(data.content[i])) {
        numStr += data.content[i++];
      }
      const count = numStr ? parseInt(numStr, 10) : 1;
      decoded += data.content[i].repeat(count);
      i++;
    }
    return decoded;
  }
}

export class Base64Encoding implements CompressionStrategy {
  name = 'base64';

  compress(data: string): CompressedData {
    const encoded = Buffer.from(data).toString('base64');
    return {
      content: encoded,
      algorithm: this.name,
      originalSize: data.length,
      compressedSize: encoded.length,
    };
  }

  decompress(data: CompressedData): string {
    return Buffer.from(data.content, 'base64').toString('utf-8');
  }
}

export class NoOpCompression implements CompressionStrategy {
  name = 'none';

  compress(data: string): CompressedData {
    return {
      content: data,
      algorithm: this.name,
      originalSize: data.length,
      compressedSize: data.length,
    };
  }

  decompress(data: CompressedData): string {
    return data.content;
  }
}

// --- Context ---

export class DataCompressor {
  private strategy: CompressionStrategy;

  constructor(strategy: CompressionStrategy) {
    this.strategy = strategy;
  }

  setStrategy(strategy: CompressionStrategy): void {
    this.strategy = strategy;
  }

  compress(data: string): CompressedData {
    return this.strategy.compress(data);
  }

  decompress(data: CompressedData): string {
    return this.strategy.decompress(data);
  }

  getActiveStrategy(): string {
    return this.strategy.name;
  }
}

// --- Tests ---

describe('DataCompressor', () => {
  it('should compress with RLE', () => {
    const compressor = new DataCompressor(new RunLengthEncoding());
    const result = compressor.compress('aaabbbcc');
    expect(result.algorithm).toBe('rle');
    expect(result.content).toBe('3a3b2c');
  });

  it('should decompress RLE data', () => {
    const rle = new RunLengthEncoding();
    const compressed = rle.compress('aaabbbcc');
    expect(rle.decompress(compressed)).toBe('aaabbbcc');
  });

  it('should compress with Base64', () => {
    const compressor = new DataCompressor(new Base64Encoding());
    const result = compressor.compress('hello');
    expect(result.algorithm).toBe('base64');
    expect(result.content).toBe('aGVsbG8=');
  });

  it('should decompress Base64 data', () => {
    const b64 = new Base64Encoding();
    const compressed = b64.compress('hello world');
    expect(b64.decompress(compressed)).toBe('hello world');
  });

  it('should pass through with NoOp', () => {
    const compressor = new DataCompressor(new NoOpCompression());
    const result = compressor.compress('test');
    expect(result.content).toBe('test');
    expect(result.originalSize).toBe(result.compressedSize);
  });

  it('should allow swapping strategies at runtime', () => {
    const compressor = new DataCompressor(new NoOpCompression());
    expect(compressor.getActiveStrategy()).toBe('none');

    compressor.setStrategy(new Base64Encoding());
    expect(compressor.getActiveStrategy()).toBe('base64');
  });
});
```

## Implementation Steps

1. **Recognize variable behavior.** Look for large switches or repeated conditionals selecting an algorithm.
2. **Extract the contract.** Define a strategy interface; optionally include a `canHandle(input): boolean` for auto-selection.
3. **Implement concrete strategies.** Register each with DI. Constructor-inject their own dependencies.
4. **Build the context.** Inject all strategies; expose a method that selects + invokes the right one.
5. **Choose a selection mode:**
   - **Explicit** — caller passes the key.
   - **Auto** — context iterates strategies calling `canHandle`.
   - **Config-based** — environment variable chooses at boot.

## Best Practices

- **Always provide a default strategy** for unknown inputs.
- **Type-safe selection.** Discriminated unions or keyed `Record` over magic strings.
- **Strategy registry** when new strategies are added by other modules/packages.
- **Cache strategy instances** — don't `new` per request.
- **Keep context dumb.** It only selects and delegates; no business logic.

## Common Mistakes

- **Too many strategies** for trivial differences. Combine; use config flags.
- **No shared interface.** Strategies drift; clients downcast.
- **Context bloat.** Context starts inspecting strategy internals — leak.
- **Hardcoded selection.** Defeats the whole point. Use `canHandle` or config.

## References

- [Refactoring Guru — Strategy](https://refactoring.guru/design-patterns/strategy)
- [TypeScript Example](https://refactoring.guru/design-patterns/strategy/typescript/example)
