# Decorator Pattern

Attaches additional responsibilities to an object dynamically by wrapping it in another object with the *same interface*. Decorators provide a flexible alternative to subclassing for extending behavior.

## Two Distinct Concepts (Don't Confuse)

**TypeScript / JavaScript has two unrelated things called "decorator":**

1. **Classic Decorator Pattern (GoF)** — runtime object composition through wrapping. Wrapper implements the same interface as the wrapped object and delegates, optionally adding behavior before/after.
2. **TypeScript `@decorator` syntax** — language feature for class/method/parameter/property metadata. Processed at class-definition time, typically by a framework (interceptors, guards, etc.).

This reference covers **both**, but they solve different problems and are not interchangeable.

| Aspect          | Classic Decorator                       | TS `@decorator`                            |
|-----------------|------------------------------------------|--------------------------------------------|
| Composition     | Runtime, by wrapping                     | Compile-time, by annotation                |
| Interface       | Same as wrapped object                   | N/A — adds metadata                        |
| Stacking        | `LoggedStorage(CachedStorage(BaseStorage))` | Multiple `@` lines on one declaration   |
| Processed by    | Calling code                             | Framework interceptors/guards/reflectors   |

## When To Use

**Classic:** storage adapters that need caching + logging + compression layers, service wrappers (retry/circuit breaker), protocol wrappers (HTTP/WebSocket), multiple-behavior combinations.

**TS `@decorator`:** cross-cutting concerns expressed declaratively — auth/permission checks, caching with cache-tags, request validation, logging, metadata-driven framework wiring.

## When NOT To Use

- Single behavior + single concrete class → just subclass or compose directly.
- Static, never-varying wrapping → inheritance is simpler.
- Hot paths where wrapper indirection matters — measure first.
- Two or fewer responsibilities — wrapping = over-engineering.

## Disambiguation

- **vs Adapter** — adapter *changes* the interface; decorator *preserves* it.
- **vs Proxy** — proxy controls *access* (lazy load, security check); decorator adds *behavior*. Often structurally identical; intent differs.
- **vs Middleware chains** — middleware *is* decorator composition by another name (Express, NestJS interceptors).

## Project-Specific Patterns

<!-- @generated: caching-patterns -->
**Caching**: Not configured for this project.

No cache library and no cache-tag decorators. Constraints to keep in mind if caching is ever needed:

- **Match state is the only in-memory state.** The authoritative match handler's `state` object (returned from `matchInit`/`matchLoop` in `apps/server/src/match/chkobba-match.ts`) holds the deck, hands, and seats for the life of the match. It is not a cache. It is the source of truth until the match ends.
- **No module-level caches in the server bundle.** The Nakama JS runtime runs code in a pooled goja VM, so mutable globals are not shared or persisted between RPC calls. A `const cache = {}` at module scope is a bug.
- **Persistent read-mostly data** (cosmetics catalog, product-to-credits map) belongs in code constants or a server-owned storage collection, read per call.
- If a hot path ever shows up in profiling, evaluate Nakama's node-local runtime cache (`nk.localcache*`, check the API in the installed `nakama-common` version). Apply it as a classic wrapper around the read function, not as a TS `@decorator`.
<!-- @end: caching-patterns -->

<!-- @generated: security-stack -->
**Authorization Decorator: classic wrappers around `nkruntime.RpcFunction`**

The Nakama server runtime (goja, ES5 bundle, no `reflect-metadata`, no DI container) cannot use TS `@decorator` syntax for auth. Auth and validation are **classic decorators**: higher-order functions that take an `nkruntime.RpcFunction` and return one with the same signature. Planned location: `apps/server/src/security/rpc-guards.ts`. Errors come from `apps/server/src/security/errors.ts` and type guards from `apps/server/src/security/validate.ts`.

```typescript
type Rpc = nkruntime.RpcFunction; // (ctx, logger, nk, payload: string) => string | void
type TypedHandler<T> = (ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, input: T) => string;

// Authentication: identity comes only from ctx.userId, never from the payload
export function requireUser(inner: Rpc): Rpc {
  return function (ctx, logger, nk, payload) {
    if (!ctx.userId) throw errUnauthenticated;
    return inner(ctx, logger, nk, payload);
  };
}

// Server-to-server only (e.g. RevenueCat webhook called with http_key): no user session, shared secret from ctx.env
export function requireWebhookSecret(headerName: string, envKey: string, inner: Rpc): Rpc {
  return function (ctx, logger, nk, payload) {
    const expected = ctx.env[envKey];
    const got = ctx.headers && ctx.headers[headerName] ? ctx.headers[headerName][0] : '';
    if (ctx.userId || !expected || got !== expected) throw errForbidden;
    return inner(ctx, logger, nk, payload);
  };
}

// Input validation: parse once and narrow the type with a hand-written guard
export function withPayload<T>(isValid: (v: unknown) => v is T, handler: TypedHandler<T>): Rpc {
  return function (ctx, logger, nk, payload) {
    let parsed: unknown;
    try { parsed = JSON.parse(payload || '{}'); } catch (_e) { throw errBadInput; }
    if (!isValid(parsed)) throw errBadInput;
    return handler(ctx, logger, nk, parsed);
  };
}

// Cooldown for abuse-prone RPCs (report_user, validate_purchase); timestamp kept in server-owned storage
export function withCooldown(action: string, seconds: number, inner: Rpc): Rpc {
  return function (ctx, logger, nk, payload) {
    if (!withinCooldown(nk, ctx.userId, action, seconds)) throw errRateLimited;
    return inner(ctx, logger, nk, payload);
  };
}
```

**Usage: compose inside a top-level function declaration.** Nakama requires every function passed to `nkruntime.Initializer` to be declared in global scope. `initializer.registerRpc(id, requireUser(...))` and `const rpcX = requireUser(...)` are **not** valid registrations. Wrap the composition in a named function instead:

```typescript
// apps/server/src/main.ts
function rpcCreatePrivateTable(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string | void {
  return requireUser(withPayload(isCreatePrivateTableInput, createPrivateTable))(ctx, logger, nk, payload);
}

function rpcReportUser(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string | void {
  return requireUser(withCooldown('report', 60, withPayload(isReportInput, reportUser)))(ctx, logger, nk, payload);
}

function InitModule(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, initializer: nkruntime.Initializer) {
  initializer.registerRpc(RpcId.CreatePrivateTable, rpcCreatePrivateTable);
  initializer.registerRpc(RpcId.ReportUser, rpcReportUser);
}
!InitModule && InitModule.bind(null);
```

Stack order: `requireUser` goes outermost, so unauthenticated calls are rejected before any storage reads. `withCooldown` comes next, so a flood of requests is rejected before any parsing work. `withPayload` is innermost and hands the typed input to the business handler.

**Match handler equivalent.** Match messages do not pass through RPC wrappers. Inside `matchLoop` (`apps/server/src/match/chkobba-match.ts`), the same layering is applied per message as a chain of checks: seat ownership via `msg.sender.userId`, then the per-seat rate limit, then the opcode allow-list and payload size cap, then parse, then turn check and `legalMoves(...)` from `@chkobba/rules`, then apply. Hidden state goes out only per presence (`[presence]`), never to `null` (everyone).
<!-- @end: security-stack -->

## Code Example

```typescript
// design-patterns/decorator - Vanilla TypeScript Example
// Decorator Pattern - Vanilla TypeScript Example
// Pure TypeScript classes, no DI framework, no decorators

// --- Classic Decorator Pattern: Stream Processing ---

export interface MessageStream {
  send(message: string): Promise<void>;
  receive(): Promise<string | null>;
}

export class BasicStream implements MessageStream {
  private messages: string[] = [];

  async send(message: string): Promise<void> {
    this.messages.push(message);
  }

  async receive(): Promise<string | null> {
    return this.messages.shift() || null;
  }
}

export class EncryptedStream implements MessageStream {
  constructor(
    private inner: MessageStream,
    private key: string,
  ) {}

  async send(message: string): Promise<void> {
    const encrypted = this.encrypt(message);
    await this.inner.send(encrypted);
  }

  async receive(): Promise<string | null> {
    const encrypted = await this.inner.receive();
    return encrypted ? this.decrypt(encrypted) : null;
  }

  private encrypt(text: string): string {
    return Buffer.from(`${this.key}:${text}`).toString('base64');
  }

  private decrypt(encoded: string): string {
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    return decoded.substring(this.key.length + 1);
  }
}

export class CompressedStream implements MessageStream {
  constructor(private inner: MessageStream) {}

  async send(message: string): Promise<void> {
    const compressed = this.compress(message);
    await this.inner.send(compressed);
  }

  async receive(): Promise<string | null> {
    const compressed = await this.inner.receive();
    return compressed ? this.decompress(compressed) : null;
  }

  private compress(text: string): string {
    // Simplified: prefix with length
    return `${text.length}:${text}`;
  }

  private decompress(data: string): string {
    const colonIndex = data.indexOf(':');
    return data.substring(colonIndex + 1);
  }
}

export class BufferedStream implements MessageStream {
  private buffer: string[] = [];
  private flushSize: number;

  constructor(
    private inner: MessageStream,
    flushSize: number = 5,
  ) {
    this.flushSize = flushSize;
  }

  async send(message: string): Promise<void> {
    this.buffer.push(message);
    if (this.buffer.length >= this.flushSize) {
      await this.flush();
    }
  }

  async receive(): Promise<string | null> {
    return this.inner.receive();
  }

  async flush(): Promise<void> {
    const batch = this.buffer.splice(0);
    for (const msg of batch) {
      await this.inner.send(msg);
    }
  }

  getBufferSize(): number {
    return this.buffer.length;
  }
}

// --- Decorator Composition Helper ---

export function composeStream(...decorators: ((stream: MessageStream) => MessageStream)[]): MessageStream {
  let stream: MessageStream = new BasicStream();
  for (const decorate of decorators) {
    stream = decorate(stream);
  }
  return stream;
}

// --- Tests ---

describe('BasicStream', () => {
  it('should send and receive messages', async () => {
    const stream = new BasicStream();
    await stream.send('hello');
    expect(await stream.receive()).toBe('hello');
    expect(await stream.receive()).toBeNull();
  });
});

describe('EncryptedStream', () => {
  it('should encrypt and decrypt transparently', async () => {
    const stream = new EncryptedStream(new BasicStream(), 'secret');
    await stream.send('hello world');
    expect(await stream.receive()).toBe('hello world');
  });
});

describe('CompressedStream', () => {
  it('should compress and decompress transparently', async () => {
    const stream = new CompressedStream(new BasicStream());
    await stream.send('test message');
    expect(await stream.receive()).toBe('test message');
  });
});

describe('BufferedStream', () => {
  it('should buffer messages until flush size', async () => {
    const inner = new BasicStream();
    const buffered = new BufferedStream(inner, 3);

    await buffered.send('msg1');
    await buffered.send('msg2');
    expect(buffered.getBufferSize()).toBe(2);
    expect(await inner.receive()).toBeNull(); // Not flushed yet

    await buffered.send('msg3'); // Triggers flush
    expect(buffered.getBufferSize()).toBe(0);
    expect(await inner.receive()).toBe('msg1');
  });
});

describe('Decorator Composition', () => {
  it('should compose multiple decorators', async () => {
    const stream = composeStream(
      (s) => new CompressedStream(s),
      (s) => new EncryptedStream(s, 'key'),
    );

    await stream.send('composed message');
    expect(await stream.receive()).toBe('composed message');
  });
});
```

## Implementation Steps

**Classic Decorator:**

1. Define the common interface both component and decorators implement.
2. Implement the concrete component (base behavior).
3. Create a base decorator: holds a reference to a component, delegates everything.
4. Concrete decorators extend the base, override specific methods, add behavior, call `super.method()` to delegate.
5. Compose at runtime: `new Logging(new Cached(new Base()))`.

**TypeScript `@decorator`:**

1. Define a metadata interface for the decorator's payload.
2. Write the decorator function — usually `Reflect.defineMetadata` (or framework-specific `SetMetadata`).
3. Implement the interceptor/guard that reads the metadata at request time and acts.
4. Type the decorator factory for compile-time safety.

## Best Practices

- **Same-interface invariant** (classic). Wrapped + wrapper must be interchangeable; clients never know they're holding a decorator.
- **Single responsibility per decorator.** Logging is one decorator; caching another. Stack them.
- **Stack order matters.** `Logging(Cache(Base))` logs cache hits; `Cache(Logging(Base))` caches log output (probably not what you want).
- **Metadata over hardcoding** (TS `@`). Store config in metadata, read in interceptor — separation of concerns.
- **DI everywhere.** Don't `new Decorator(...)` manually; let the container compose.
- **Watch decorator overhead** in hot paths — measure.

## Common Mistakes

- **Breaking the interface.** Decorator adds new public method; clients now need to know it exists. Goodbye polymorphism.
- **Tight coupling to concrete class** instead of interface — can't stack with other decorators.
- **Wrong stacking order.** Caching before logging vs after gives different observability.
- **Silent error swallowing** in decorator logic.
- **Metadata key collisions** when multiple TS decorators reuse the same `Reflect` key.

## References

- [Refactoring Guru — Decorator](https://refactoring.guru/design-patterns/decorator)
- [TypeScript Decorators Handbook](https://www.typescriptlang.org/docs/handbook/decorators.html)
- [TC39 Decorators Proposal](https://github.com/tc39/proposal-decorators)
