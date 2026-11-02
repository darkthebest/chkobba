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
