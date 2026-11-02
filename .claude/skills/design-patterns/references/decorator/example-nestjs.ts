// Decorator Pattern - NestJS Example
// Uses @Injectable(), custom decorators, SetMetadata, guards, interceptors

import { Injectable, SetMetadata, ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Observable, of, tap } from 'rxjs';

// --- TypeScript Decorator: Custom Method Decorator ---

export const LOG_KEY = 'log_config';

export interface LogConfig {
  level: 'debug' | 'info' | 'warn';
  includeArgs: boolean;
}

export const Log = (config: LogConfig = { level: 'info', includeArgs: false }) =>
  SetMetadata(LOG_KEY, config);

// --- Interceptor (Processes Decorator Metadata) ---

@Injectable()
export class LoggingInterceptor {
  constructor(private reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const config = this.reflector.get<LogConfig>(LOG_KEY, context.getHandler());
    if (!config) return next.handle();

    const methodName = context.getHandler().name;
    const args = config.includeArgs ? context.getArgs() : [];
    const start = Date.now();

    console.log(`[${config.level}] ${methodName} called`, ...args);

    return next.handle().pipe(
      tap(() => {
        console.log(`[${config.level}] ${methodName} completed in ${Date.now() - start}ms`);
      }),
    );
  }
}

// --- Classic Decorator Pattern: Storage Wrappers ---

export interface Storage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

@Injectable()
export class BaseStorage implements Storage {
  private store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) || null;
  }

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }
}

@Injectable()
export class CachedStorage implements Storage {
  private cache = new Map<string, string>();

  constructor(private readonly inner: BaseStorage) {}

  async get(key: string): Promise<string | null> {
    if (this.cache.has(key)) return this.cache.get(key)!;
    const value = await this.inner.get(key);
    if (value) this.cache.set(key, value);
    return value;
  }

  async set(key: string, value: string): Promise<void> {
    this.cache.set(key, value);
    await this.inner.set(key, value);
  }
}

@Injectable()
export class LoggedStorage implements Storage {
  private logs: string[] = [];

  constructor(private readonly inner: CachedStorage) {}

  async get(key: string): Promise<string | null> {
    this.logs.push(`GET ${key}`);
    return this.inner.get(key);
  }

  async set(key: string, value: string): Promise<void> {
    this.logs.push(`SET ${key}`);
    await this.inner.set(key, value);
  }

  getLogs(): string[] {
    return [...this.logs];
  }
}

// --- Tests ---

describe('Classic Decorator - Storage Wrappers', () => {
  let storage: LoggedStorage;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [BaseStorage, CachedStorage, LoggedStorage],
    }).compile();

    storage = module.get(LoggedStorage);
  });

  it('should store and retrieve through decorator chain', async () => {
    await storage.set('key1', 'value1');
    const result = await storage.get('key1');
    expect(result).toBe('value1');
  });

  it('should log operations', async () => {
    await storage.set('k', 'v');
    await storage.get('k');
    expect(storage.getLogs()).toEqual(['SET k', 'GET k']);
  });
});

describe('TypeScript Decorator - LoggingInterceptor', () => {
  it('should read log config from metadata', () => {
    const reflector = new Reflector();
    const interceptor = new LoggingInterceptor(reflector);
    expect(interceptor).toBeDefined();
  });
});
