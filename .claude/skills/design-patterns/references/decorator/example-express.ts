// Decorator Pattern - Express / Plain Node.js Example
// Uses middleware composition, no DI framework, jest for testing

// --- Classic Decorator Pattern: Service Wrappers ---

export interface DataService {
  fetch(id: string): Promise<any>;
  save(id: string, data: any): Promise<void>;
}

export class DatabaseService implements DataService {
  private store = new Map<string, any>();

  async fetch(id: string): Promise<any> {
    return this.store.get(id) || null;
  }

  async save(id: string, data: any): Promise<void> {
    this.store.set(id, data);
  }
}

export class RetryDecorator implements DataService {
  constructor(
    private inner: DataService,
    private maxRetries: number = 3,
  ) {}

  async fetch(id: string): Promise<any> {
    return this.withRetry(() => this.inner.fetch(id));
  }

  async save(id: string, data: any): Promise<void> {
    return this.withRetry(() => this.inner.save(id, data));
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err as Error;
      }
    }
    throw lastError;
  }
}

export class CachingDecorator implements DataService {
  private cache = new Map<string, { data: any; expiry: number }>();

  constructor(
    private inner: DataService,
    private ttlMs: number = 60_000,
  ) {}

  async fetch(id: string): Promise<any> {
    const cached = this.cache.get(id);
    if (cached && Date.now() < cached.expiry) {
      return cached.data;
    }
    const data = await this.inner.fetch(id);
    if (data) {
      this.cache.set(id, { data, expiry: Date.now() + this.ttlMs });
    }
    return data;
  }

  async save(id: string, data: any): Promise<void> {
    this.cache.delete(id);
    await this.inner.save(id, data);
  }
}

export class LoggingDecorator implements DataService {
  private logs: string[] = [];

  constructor(private inner: DataService) {}

  async fetch(id: string): Promise<any> {
    this.logs.push(`fetch:${id}`);
    return this.inner.fetch(id);
  }

  async save(id: string, data: any): Promise<void> {
    this.logs.push(`save:${id}`);
    await this.inner.save(id, data);
  }

  getLogs(): string[] {
    return [...this.logs];
  }
}

// --- Middleware Decorator (Express-Style) ---

export type Middleware = (req: any, res: any, next: () => void) => void;

export function withTiming(handler: Middleware): Middleware {
  return (req, res, next) => {
    const start = Date.now();
    handler(req, res, () => {
      console.log(`${req.method} ${req.url} - ${Date.now() - start}ms`);
      next();
    });
  };
}

// --- Express Route Usage ---

// import express from 'express';
// const app = express();
//
// const service: DataService = new LoggingDecorator(
//   new CachingDecorator(
//     new RetryDecorator(
//       new DatabaseService(),
//     ),
//   ),
// );
//
// app.get('/data/:id', async (req, res) => {
//   const data = await service.fetch(req.params.id);
//   if (!data) return res.status(404).json({ error: 'Not found' });
//   res.json(data);
// });

// --- Tests ---

describe('Decorator Chain', () => {
  let service: LoggingDecorator;

  beforeEach(() => {
    service = new LoggingDecorator(
      new CachingDecorator(new RetryDecorator(new DatabaseService())),
    );
  });

  it('should pass through decorator chain for save and fetch', async () => {
    await service.save('1', { name: 'Alice' });
    const result = await service.fetch('1');
    expect(result).toEqual({ name: 'Alice' });
  });

  it('should log operations', async () => {
    await service.save('1', { name: 'Alice' });
    await service.fetch('1');
    expect(service.getLogs()).toEqual(['save:1', 'fetch:1']);
  });
});

describe('CachingDecorator', () => {
  it('should return cached data on second fetch', async () => {
    const db = new DatabaseService();
    const cached = new CachingDecorator(db, 10_000);

    await db.save('1', { name: 'Alice' });
    await cached.fetch('1');

    // Modify underlying data
    await db.save('1', { name: 'Bob' });

    // Should still return cached Alice
    const result = await cached.fetch('1');
    expect(result).toEqual({ name: 'Alice' });
  });

  it('should invalidate cache on save', async () => {
    const db = new DatabaseService();
    const cached = new CachingDecorator(db, 10_000);

    await cached.save('1', { name: 'Alice' });
    await cached.fetch('1');
    await cached.save('1', { name: 'Bob' });

    const result = await cached.fetch('1');
    expect(result).toEqual({ name: 'Bob' });
  });
});

describe('RetryDecorator', () => {
  it('should retry on failure', async () => {
    let attempts = 0;
    const flaky: DataService = {
      async fetch() {
        attempts++;
        if (attempts < 3) throw new Error('Transient error');
        return { data: 'ok' };
      },
      async save() {},
    };

    const retried = new RetryDecorator(flaky, 3);
    const result = await retried.fetch('1');
    expect(result).toEqual({ data: 'ok' });
    expect(attempts).toBe(3);
  });
});
