# Factory Pattern

Factory Method defines an interface for creating objects, letting concrete factories decide which class to instantiate. Abstract Factory creates *families* of related objects without specifying concrete classes.

## When To Use

- Multiple related concrete classes share a common interface (3+).
- Class to instantiate is determined at runtime by a key/type/config.
- New variants are added frequently — want to obey Open/Closed.
- A switch/if-else on type for `new SomeThing(...)` is growing unmaintainable.
- Creating families of related objects (Abstract Factory): e.g. `Storage` + matching `Cache` + matching `Serializer`.

## When NOT To Use

- Only 1–2 concrete types. A conditional is fine.
- Type known at compile time, no runtime variation.
- Trivial construction with no shared interface across products.
- DI alone solves it — don't add a factory layer on top of a working DI container.

## Disambiguation

- **vs Strategy** — factory *creates*; strategy *uses*. They compose: factories often return strategies.
- **vs Builder** — builder constructs a single complex object step by step; factory picks which class to instantiate.

## Use Cases

| Scenario                          | Problem                                           | Solution                                          |
|-----------------------------------|---------------------------------------------------|---------------------------------------------------|
| Node processors                   | Each node type needs different processor          | Factory returns processor for `node.type`         |
| Integration providers             | HubSpot/Mailchimp/Salesforce — different APIs     | Factory returns provider matching integration kind|
| Storage backends (Abstract)       | Mongo vs Redis families with own cache + serializer| Abstract factory builds the whole family          |
| Field validators                  | Email/phone/date need different validators        | Factory returns validator for field type          |

## Code Example

```typescript
// design-patterns/factory - Vanilla TypeScript Example
// Factory Pattern - Vanilla TypeScript Example
// Pure TypeScript classes, no DI framework, no decorators

// --- Common Interface ---

export interface Logger {
  log(level: LogLevel, message: string, context?: Record<string, any>): void;
  flush(): Promise<void>;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// --- Concrete Implementations ---

export class ConsoleLogger implements Logger {
  log(level: LogLevel, message: string, context?: Record<string, any>): void {
    const timestamp = new Date().toISOString();
    const ctx = context ? ` ${JSON.stringify(context)}` : '';
    console[level](`[${timestamp}] [${level.toUpperCase()}] ${message}${ctx}`);
  }

  async flush(): Promise<void> {
    // Console doesn't need flushing
  }
}

export class FileLogger implements Logger {
  private buffer: string[] = [];

  constructor(private filePath: string) {}

  log(level: LogLevel, message: string, context?: Record<string, any>): void {
    const timestamp = new Date().toISOString();
    const entry = JSON.stringify({ timestamp, level, message, ...context });
    this.buffer.push(entry);
  }

  async flush(): Promise<void> {
    // Write buffer to file (simplified)
    this.buffer = [];
  }
}

export class JsonLogger implements Logger {
  private entries: object[] = [];

  log(level: LogLevel, message: string, context?: Record<string, any>): void {
    this.entries.push({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(context || {}),
    });
  }

  async flush(): Promise<void> {
    // Send entries to logging service
    this.entries = [];
  }

  getEntries(): object[] {
    return [...this.entries];
  }
}

// --- Factory ---

export type LoggerType = 'console' | 'file' | 'json';

export class LoggerFactory {
  static create(type: LoggerType, options?: Record<string, any>): Logger {
    switch (type) {
      case 'console':
        return new ConsoleLogger();
      case 'file':
        return new FileLogger(options?.filePath || 'app.log');
      case 'json':
        return new JsonLogger();
      default:
        throw new Error(`Unknown logger type: ${type}`);
    }
  }
}

// --- Registry Pattern (alternative) ---

export class LoggerRegistry {
  private factories = new Map<string, () => Logger>();

  register(type: string, factory: () => Logger): void {
    this.factories.set(type, factory);
  }

  create(type: string): Logger {
    const factory = this.factories.get(type);
    if (!factory) {
      throw new Error(`Logger not registered: ${type}`);
    }
    return factory();
  }
}

// --- Tests ---

describe('LoggerFactory', () => {
  it('should create console logger', () => {
    const logger = LoggerFactory.create('console');
    expect(logger).toBeInstanceOf(ConsoleLogger);
  });

  it('should create file logger with options', () => {
    const logger = LoggerFactory.create('file', { filePath: 'test.log' });
    expect(logger).toBeInstanceOf(FileLogger);
  });

  it('should create json logger', () => {
    const logger = LoggerFactory.create('json');
    expect(logger).toBeInstanceOf(JsonLogger);
  });

  it('should throw for unknown type', () => {
    expect(() => LoggerFactory.create('unknown' as any)).toThrow();
  });
});

describe('LoggerRegistry', () => {
  it('should create registered loggers', () => {
    const registry = new LoggerRegistry();
    registry.register('console', () => new ConsoleLogger());
    registry.register('json', () => new JsonLogger());

    expect(registry.create('console')).toBeInstanceOf(ConsoleLogger);
    expect(registry.create('json')).toBeInstanceOf(JsonLogger);
  });

  it('should throw for unregistered type', () => {
    const registry = new LoggerRegistry();
    expect(() => registry.create('unknown')).toThrow('Logger not registered');
  });
});
```

## Implementation Steps

1. **Define product interface.** Common contract every concrete class implements.
2. **Implement concrete products.** Register each with the framework's DI container.
3. **Build the factory.** Inject all concrete products via constructor; expose a `create(key)` (or `for(type)`) method that returns the matching product.
4. **Wire client code to the interface**, never to the concrete class.

## Best Practices

- **DI over `new`.** Inject concrete products into the factory; let the container manage lifecycle.
- **Type-safe lookup.** Use discriminated unions or a `Record<Key, Product>` map for compile-time safety.
- **Registry for self-registration.** Concrete products self-register with the factory on init — avoids hardcoded lists.
- **Descriptive errors for unknown keys.** Include the requested key and supported keys in the error message.
- **Test products independently.** The factory test only verifies routing; product tests verify behavior.

## Common Mistakes

- **`new` inside the factory.** Defeats DI — instances escape the container.
- **Missing common interface.** Products diverge over time; clients downcast.
- **God factory.** One factory creating unrelated families. Split into separate factories.
- **Static factories.** Cannot be mocked / replaced in tests.

## References

- [Refactoring Guru — Factory Method](https://refactoring.guru/design-patterns/factory-method)
- [Refactoring Guru — Abstract Factory](https://refactoring.guru/design-patterns/abstract-factory)
- [TypeScript Example](https://refactoring.guru/design-patterns/factory-method/typescript/example)
