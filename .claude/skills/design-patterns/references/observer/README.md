# Observer Pattern

Defines a one-to-many dependency: when one object (subject) changes state, all its dependents (observers) are notified automatically. The backbone of event-driven architecture and pub/sub.

Components:

- **Subject (Publisher)** — owns state, maintains observer list, emits notifications.
- **Observer (Subscriber)** — registers interest, reacts to notifications.
- **Event** — typed payload describing the change.

## When To Use

- Event-driven architecture (domain events, integration events).
- Multiple unrelated systems must react to the same state change (audit, notifications, cache invalidation, webhooks, analytics).
- Components must stay loosely coupled — publisher must not know subscribers.
- DDD-style domain events.
- Frontend: child→parent communication across non-adjacent components, async data streams.

## When NOT To Use

- Direct one-to-one synchronous call would do. Don't manufacture pub/sub for two collaborators.
- Synchronous request/response semantics — events are async and order-agnostic.
- Only one subscriber and unlikely to grow — direct method call.
- Strict ordering / transactional guarantees needed without an event broker that supports them.

## Disambiguation

- **vs Strategy** — strategy is one client picking one algorithm; observer is one publisher notifying many subscribers.
- **vs Mediator** — mediator centralizes many-to-many; observer is one-to-many fanout.
- **vs Callbacks** — callbacks are direct references; observer decouples via a subject + named events.

## Framework Implementations

<!-- @generated: event-patterns -->
**Event Patterns: Chkobba Online (Nakama realtime + pure rules engine + Expo client)**

There is no EventEmitter library on the server. The event system is made of these pieces (the project is greenfield, so all paths are **planned conventions**):

| Channel | Publisher | Observers | Transport |
|---|---|---|---|
| Domain events | `@chkobba/rules` (`applyMove` returns events) | Match handler | Plain return value (pure, synchronous) |
| Match messages | Authoritative match handler (`matchLoop`) | Seated clients | `dispatcher.broadcastMessage(opCode, data, [presence], null, true)` |
| Notifications | RPCs / hooks (invites, credit grants) | Offline or online user | `nk.notificationSend(...)` |
| Lifecycle hooks | Nakama core | Server module | `registerMatchmakerMatched`, `registerAfter*` / `registerBefore*` hooks |
| Client fan-out | nakama-js `Socket` (`onmatchdata`, `onnotification`, ...) | React components/hooks | Typed emitter in `apps/mobile/src` |

**1. Domain events from the rules engine** (`packages/rules/src/events.ts`)

The rules engine stays pure: no I/O and no subscriptions. `applyMove(game, seat, move)` returns `{ game, events }`, and the match handler is the observer that turns events into network messages. Event names use the `noun.pastTenseVerb` form.

```typescript
export type GameEvent =
  | { type: 'hand.dealt'; seat: Seat; cards: Card[] }             // HIDDEN: deliver only to that seat
  | { type: 'card.played'; seat: Seat; card: Card }
  | { type: 'capture.made'; seat: Seat; cards: Card[]; chkobba: boolean }
  | { type: 'turn.changed'; seat: Seat }
  | { type: 'round.ended'; teamScores: [number, number] }
  | { type: 'game.ended'; winnerTeam: 0 | 1; teamScores: [number, number] };

export interface MoveResult { game: GameState; events: GameEvent[]; }
```

**2. Opcode catalog** (`apps/server/src/match/opcodes.ts`, shared with the client via the protocol module). Use a plain `as const` object, which bundles safely for goja and has no `const enum` pitfalls under isolated transpilation.

```typescript
export const OpCode = {
  // client -> server (allow-listed in matchLoop)
  PLAY_CARD: 1,
  READY: 2,
  // server -> client
  STATE: 100,          // full per-seat snapshot (join, reconnect)
  HAND_DEALT: 101,     // per-seat only
  CARD_PLAYED: 102,
  CAPTURE_MADE: 103,
  TURN_CHANGED: 104,
  ROUND_ENDED: 105,
  GAME_ENDED: 106,
  SEAT_CHANGED: 107,   // bot took over / human reclaimed seat
  MOVE_REJECTED: 108,
} as const;
```

**3. Match handler as observer** (`apps/server/src/match/chkobba-match.ts`). It maps each event to an opcode and recipients. Public events go to every human presence, hidden events go to their owning seat only, and bot seats receive nothing. Each send is isolated, so one failure does not stop the others.

```typescript
function publishEvents(dispatcher: nkruntime.MatchDispatcher, logger: nkruntime.Logger, s: MatchState, events: GameEvent[]): void {
  for (const ev of events) {
    try {
      if (ev.type === 'hand.dealt') {
        const p = presenceForSeat(s, ev.seat);
        if (p) dispatcher.broadcastMessage(OpCode.HAND_DEALT, JSON.stringify({ cards: ev.cards }), [p], null, true);
        continue;
      }
      const humans = humanPresences(s);
      if (humans.length > 0) dispatcher.broadcastMessage(opCodeFor(ev), JSON.stringify(ev), humans, null, true);
    } catch (e) {
      logger.error('publish %s failed: %s', ev.type, String(e));
    }
  }
}
```

Lifecycle observers inside the match:
- `matchJoin` sends `OpCode.STATE` with `projectForSeat(game, seat)` to the joining presence. On reconnect it also broadcasts `SEAT_CHANGED` (the bot hands the seat back).
- `matchLeave` marks the seat as disconnected and lets the server bot play it, then broadcasts `SEAT_CHANGED`.
- Backfill: `matchLoop` counts ticks after creation. Once about 10 to 20 seconds have passed (`tickRate * seconds`), empty seats become bots and the deal starts.
- On `game.ended`: write leaderboard and stats records, then return `null` from `matchLoop` to end the match. **No wallet changes on results** (cosmetic-only economy).

**4. Nakama hooks and notifications** (`apps/server/src/main.ts`, `apps/server/src/social/`)

```typescript
function onMatchmakerMatched(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, matches: nkruntime.MatchmakerResult[]): string {
  const userIds = matches.map(function (m) { return m.presence.userId; });
  return nk.matchCreate(MATCH_NAME, { reservedUserIds: JSON.stringify(userIds) }); // clients receive match_id
}

export const NotificationCode = { TABLE_INVITE: 1, CREDITS_GRANTED: 2 } as const; // codes <= 0 are reserved by Nakama

// inside createPrivateTable, after the friend/group check:
nk.notificationSend(inviteeId, 'table_invite', { matchId, from: ctx.username }, NotificationCode.TABLE_INVITE, ctx.userId, true);
```

Register both with top-level function declarations: `initializer.registerMatchmakerMatched(onMatchmakerMatched)`. Use `registerAfter*` hooks only for side effects such as initializing default storage after authentication. Use `registerBefore*` hooks to guard or reject requests.

**5. Client fan-out** (`apps/mobile/src/net/match-events.ts`). A nakama-js `Socket` exposes **single-assignment** handlers (`socket.onmatchdata = ...`). Assign each handler once and fan out to typed subscribers so that screens and hooks can subscribe and unsubscribe independently.

```typescript
type ServerEvents = {
  [OpCode.STATE]: SeatView;
  [OpCode.CARD_PLAYED]: { seat: Seat; card: Card };
  [OpCode.GAME_ENDED]: { winnerTeam: 0 | 1; teamScores: [number, number] };
  // ...one entry per server -> client opcode
};

export const matchEvents = new TypedEventEmitter<ServerEvents>();
const decoder = new TextDecoder(); // polyfill if the Hermes build lacks TextDecoder

export function attachSocket(socket: Socket): void {
  socket.onmatchdata = (md) => {
    let payload: unknown;
    try { payload = JSON.parse(decoder.decode(md.data)); } catch { return; }
    matchEvents.emit(md.op_code as keyof ServerEvents, payload as never);
  };
  socket.onnotification = (n) => notificationEvents.emit(n.code as NotificationCodeValue, n.content);
  socket.ondisconnect = () => connectionEvents.emit('socket.disconnected', {});
}

// React usage: subscribe in an effect and always unsubscribe in the cleanup
useEffect(() => matchEvents.on(OpCode.CARD_PLAYED, (e) => animatePlay(e.seat, e.card)), []);
```

Rules for this project:
- Server-side observers use arrays and plain objects in match state. No `Map`/`Set` in serialized state, and no module-level listener registries, because the goja VM is pooled.
- The client treats every incoming message as a hint for rendering. The server snapshot (`OpCode.STATE`) is authoritative, and the client never computes captures or scores on its own.
- Event and opcode names are constants. No magic strings or numbers at call sites.
<!-- @end: event-patterns -->

## Code Example

```typescript
// design-patterns/observer - Vanilla TypeScript Example
// Observer Pattern - Vanilla TypeScript Example
// Pure TypeScript classes, no DI framework, no decorators

// --- Type-Safe Event Emitter ---

type EventMap = Record<string, any>;
type EventHandler<T> = (data: T) => void;

export class TypedEventEmitter<T extends EventMap> {
  private handlers = new Map<keyof T, Set<EventHandler<any>>>();

  on<K extends keyof T>(event: K, handler: EventHandler<T[K]>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    return () => this.off(event, handler);
  }

  off<K extends keyof T>(event: K, handler: EventHandler<T[K]>): void {
    this.handlers.get(event)?.delete(handler);
  }

  emit<K extends keyof T>(event: K, data: T[K]): void {
    this.handlers.get(event)?.forEach((handler) => {
      try {
        handler(data);
      } catch (err) {
        console.error(`Error in handler for ${String(event)}:`, err);
      }
    });
  }

  listenerCount<K extends keyof T>(event: K): number {
    return this.handlers.get(event)?.size || 0;
  }

  removeAllListeners<K extends keyof T>(event?: K): void {
    if (event) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
    }
  }
}

// --- Application Events ---

interface AppEvents {
  'task.created': { taskId: string; title: string; assignee: string };
  'task.completed': { taskId: string; completedBy: string };
  'task.commented': { taskId: string; comment: string; author: string };
}

// --- Subject (Publisher) ---

export class TaskManager {
  constructor(private events: TypedEventEmitter<AppEvents>) {}

  createTask(title: string, assignee: string): string {
    const taskId = `task-${Date.now()}`;
    this.events.emit('task.created', { taskId, title, assignee });
    return taskId;
  }

  completeTask(taskId: string, completedBy: string): void {
    this.events.emit('task.completed', { taskId, completedBy });
  }

  addComment(taskId: string, comment: string, author: string): void {
    this.events.emit('task.commented', { taskId, comment, author });
  }
}

// --- Observers ---

export class TaskNotifier {
  public notifications: string[] = [];

  subscribe(events: TypedEventEmitter<AppEvents>): () => void {
    const unsub1 = events.on('task.created', (data) => {
      this.notifications.push(`New task "${data.title}" assigned to ${data.assignee}`);
    });
    const unsub2 = events.on('task.completed', (data) => {
      this.notifications.push(`Task ${data.taskId} completed by ${data.completedBy}`);
    });
    return () => { unsub1(); unsub2(); };
  }
}

export class TaskActivityLog {
  public entries: string[] = [];

  subscribe(events: TypedEventEmitter<AppEvents>): void {
    events.on('task.created', (data) => this.entries.push(`created:${data.taskId}`));
    events.on('task.completed', (data) => this.entries.push(`completed:${data.taskId}`));
    events.on('task.commented', (data) => this.entries.push(`commented:${data.taskId}`));
  }
}

// --- Tests ---

describe('TypedEventEmitter', () => {
  let emitter: TypedEventEmitter<AppEvents>;

  beforeEach(() => {
    emitter = new TypedEventEmitter();
  });

  it('should emit and handle events', () => {
    const received: string[] = [];
    emitter.on('task.created', (data) => received.push(data.title));

    emitter.emit('task.created', { taskId: '1', title: 'Fix bug', assignee: 'Alice' });
    expect(received).toEqual(['Fix bug']);
  });

  it('should support unsubscribe', () => {
    const received: string[] = [];
    const unsubscribe = emitter.on('task.created', (data) => received.push(data.taskId));

    emitter.emit('task.created', { taskId: '1', title: 'A', assignee: 'X' });
    unsubscribe();
    emitter.emit('task.created', { taskId: '2', title: 'B', assignee: 'Y' });

    expect(received).toEqual(['1']);
  });

  it('should handle errors in handlers without breaking others', () => {
    const received: string[] = [];
    emitter.on('task.created', () => { throw new Error('Handler error'); });
    emitter.on('task.created', (data) => received.push(data.taskId));

    emitter.emit('task.created', { taskId: '1', title: 'A', assignee: 'X' });
    expect(received).toEqual(['1']); // Second handler still runs
  });

  it('should track listener count', () => {
    expect(emitter.listenerCount('task.created')).toBe(0);
    const unsub = emitter.on('task.created', () => {});
    expect(emitter.listenerCount('task.created')).toBe(1);
    unsub();
    expect(emitter.listenerCount('task.created')).toBe(0);
  });
});

describe('TaskManager + Observers', () => {
  let events: TypedEventEmitter<AppEvents>;
  let manager: TaskManager;
  let notifier: TaskNotifier;
  let log: TaskActivityLog;

  beforeEach(() => {
    events = new TypedEventEmitter();
    manager = new TaskManager(events);
    notifier = new TaskNotifier();
    log = new TaskActivityLog();

    notifier.subscribe(events);
    log.subscribe(events);
  });

  it('should notify on task creation', () => {
    manager.createTask('Fix bug', 'Alice');
    expect(notifier.notifications[0]).toContain('Fix bug');
    expect(notifier.notifications[0]).toContain('Alice');
  });

  it('should log all task activities', () => {
    const taskId = manager.createTask('Feature', 'Bob');
    manager.addComment(taskId, 'Looks good', 'Carol');
    manager.completeTask(taskId, 'Bob');

    expect(log.entries).toHaveLength(3);
    expect(log.entries[0]).toContain('created');
    expect(log.entries[1]).toContain('commented');
    expect(log.entries[2]).toContain('completed');
  });
});
```

## Implementation Steps

1. **Identify subject and observers.** What changes state? Who reacts? What payload?
2. **Define typed event interfaces.** Include `eventName`, `timestamp`, `aggregateId`, payload. Centralize names in a `EVENT_NAMES` constant.
3. **Implement the publisher.** Emit events after state changes commit (post-transaction if persisting).
4. **Implement subscribers.** Each handles one concern (audit, notify, cache-invalidate). One observer ≠ one God listener.
5. **Register with the framework's event system.** EventEmitter2 / @OnEvent in NestJS, RxJS Subject in Angular, etc.

## Best Practices

- **Hierarchical naming.** `project.created`, `lead.captured`, `dt.published`. Enables wildcard subscribers (`project.*`).
- **Type the payload.** Define an interface per event; type-check handlers.
- **Catch errors per observer.** A throw in observer A must not break observers B and C. Catch + log inside the handler.
- **Async by default.** Don't depend on subscriber ordering or completion.
- **Unsubscribe on destroy** (frontend). `takeUntilDestroyed`, `OnDestroy`, or auto-unsubscribe pattern — otherwise memory leaks.
- **Wildcard for namespace listeners.** Single audit listener subscribing to `*` is fine; a switch on event name inside is not — split.

## Common Mistakes

- **Forgetting to unsubscribe** → memory leaks in long-lived frontends.
- **Throwing inside observer** → breaks the chain for other listeners.
- **Assuming sync execution** → race conditions when state isn't committed yet.
- **Tight coupling to payload shape** → version events, or use a stable contract.
- **Magic event-name strings** scattered across handlers → typos, broken refactors. Use a constants module.
- **Emitting before persistence commits** → observers act on data that may roll back.

## References

- [Refactoring Guru — Observer](https://refactoring.guru/design-patterns/observer)
- [TypeScript Example](https://refactoring.guru/design-patterns/observer/typescript/example)
