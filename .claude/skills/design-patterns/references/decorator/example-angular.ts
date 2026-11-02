// Decorator Pattern - Angular Example
// Uses @Injectable(), custom decorators, RxJS operators as decorators

import { Injectable } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, of, tap, delay, shareReplay } from 'rxjs';

// --- Classic Decorator Pattern: HTTP Client Wrappers ---

export interface HttpClient {
  get<T>(url: string): Observable<T>;
  post<T>(url: string, body: any): Observable<T>;
}

@Injectable({ providedIn: 'root' })
export class BaseHttpClient implements HttpClient {
  get<T>(url: string): Observable<T> {
    // Wraps Angular HttpClient or fetch
    return of({ data: 'response' } as any);
  }

  post<T>(url: string, body: any): Observable<T> {
    return of({ data: 'created' } as any);
  }
}

@Injectable({ providedIn: 'root' })
export class CachingHttpClient implements HttpClient {
  private cache = new Map<string, Observable<any>>();

  constructor(private inner: BaseHttpClient) {}

  get<T>(url: string): Observable<T> {
    if (!this.cache.has(url)) {
      this.cache.set(url, this.inner.get<T>(url).pipe(shareReplay(1)));
    }
    return this.cache.get(url)!;
  }

  post<T>(url: string, body: any): Observable<T> {
    // POST requests bypass cache and invalidate related GET
    this.cache.delete(url);
    return this.inner.post<T>(url, body);
  }

  clearCache(): void {
    this.cache.clear();
  }
}

@Injectable({ providedIn: 'root' })
export class LoggingHttpClient implements HttpClient {
  private logs: string[] = [];

  constructor(private inner: CachingHttpClient) {}

  get<T>(url: string): Observable<T> {
    this.logs.push(`GET ${url}`);
    return this.inner.get<T>(url).pipe(
      tap(() => this.logs.push(`GET ${url} completed`)),
    );
  }

  post<T>(url: string, body: any): Observable<T> {
    this.logs.push(`POST ${url}`);
    return this.inner.post<T>(url, body).pipe(
      tap(() => this.logs.push(`POST ${url} completed`)),
    );
  }

  getLogs(): string[] {
    return [...this.logs];
  }
}

// --- TypeScript Decorator: Method Timing ---

export function Timed(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const original = descriptor.value;
  descriptor.value = function (...args: any[]) {
    const start = performance.now();
    const result = original.apply(this, args);
    if (result instanceof Observable) {
      return result.pipe(
        tap(() => {
          console.log(`${propertyKey} took ${(performance.now() - start).toFixed(2)}ms`);
        }),
      );
    }
    console.log(`${propertyKey} took ${(performance.now() - start).toFixed(2)}ms`);
    return result;
  };
  return descriptor;
}

// --- Service Using Decorator ---

@Injectable({ providedIn: 'root' })
export class DataService {
  constructor(private http: LoggingHttpClient) {}

  @Timed
  fetchUsers(): Observable<any[]> {
    return this.http.get('/api/users');
  }
}

// --- Tests ---

describe('Classic Decorator - HTTP Client Wrappers', () => {
  let client: LoggingHttpClient;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [BaseHttpClient, CachingHttpClient, LoggingHttpClient],
    });
    client = TestBed.inject(LoggingHttpClient);
  });

  it('should log GET requests', (done) => {
    client.get('/api/users').subscribe(() => {
      const logs = client.getLogs();
      expect(logs).toContain('GET /api/users');
      expect(logs).toContain('GET /api/users completed');
      done();
    });
  });

  it('should log POST requests', (done) => {
    client.post('/api/users', { name: 'Alice' }).subscribe(() => {
      expect(client.getLogs()).toContain('POST /api/users');
      done();
    });
  });
});

describe('TypeScript Decorator - @Timed', () => {
  it('should not alter method behavior', () => {
    class Example {
      @Timed
      compute(): number {
        return 42;
      }
    }
    expect(new Example().compute()).toBe(42);
  });
});
