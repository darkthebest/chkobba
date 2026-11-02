// Observer Pattern - Express / Plain Node.js Example
// Uses Node.js native EventEmitter, no DI framework, jest for testing

import { EventEmitter } from 'events';

// --- Event Definitions ---

export interface DomainEvent {
  type: string;
  timestamp: Date;
  data: any;
}

export interface UserRegisteredEvent extends DomainEvent {
  type: 'user.registered';
  data: { userId: string; email: string; name: string };
}

export interface UserUpdatedEvent extends DomainEvent {
  type: 'user.updated';
  data: { userId: string; changes: Record<string, any> };
}

// --- Event Bus (Subject) ---

export class AppEventBus {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(50);
  }

  emit(event: DomainEvent): void {
    this.emitter.emit(event.type, event);
    this.emitter.emit('*', event); // Wildcard support
  }

  on(eventType: string, handler: (event: DomainEvent) => void): () => void {
    this.emitter.on(eventType, handler);
    return () => this.emitter.off(eventType, handler);
  }

  once(eventType: string, handler: (event: DomainEvent) => void): void {
    this.emitter.once(eventType, handler);
  }

  onAll(handler: (event: DomainEvent) => void): () => void {
    return this.on('*', handler);
  }

  listenerCount(eventType: string): number {
    return this.emitter.listenerCount(eventType);
  }
}

// --- Publisher (Subject) ---

export class UserService {
  constructor(private eventBus: AppEventBus) {}

  async register(email: string, name: string): Promise<string> {
    const userId = `user-${Date.now()}`;
    // ... save user to database ...

    this.eventBus.emit({
      type: 'user.registered',
      timestamp: new Date(),
      data: { userId, email, name },
    });

    return userId;
  }

  async updateProfile(userId: string, changes: Record<string, any>): Promise<void> {
    this.eventBus.emit({
      type: 'user.updated',
      timestamp: new Date(),
      data: { userId, changes },
    });
  }
}

// --- Observers (Subscribers) ---

export class WelcomeEmailHandler {
  public sentTo: string[] = [];

  register(eventBus: AppEventBus): () => void {
    return eventBus.on('user.registered', (event: UserRegisteredEvent) => {
      this.sentTo.push(event.data.email);
    });
  }
}

export class AuditLogHandler {
  public logs: string[] = [];

  register(eventBus: AppEventBus): () => void {
    return eventBus.onAll((event) => {
      this.logs.push(`${event.type}:${JSON.stringify(event.data)}`);
    });
  }
}

export class AnalyticsHandler {
  public events: string[] = [];

  register(eventBus: AppEventBus): () => void {
    return eventBus.on('user.registered', () => {
      this.events.push('track:signup');
    });
  }
}

// --- Express Route Usage ---

// import express from 'express';
// const app = express();
// const eventBus = new AppEventBus();
// const userService = new UserService(eventBus);
//
// // Register observers
// new WelcomeEmailHandler().register(eventBus);
// new AuditLogHandler().register(eventBus);
// new AnalyticsHandler().register(eventBus);
//
// app.post('/users', async (req, res) => {
//   const userId = await userService.register(req.body.email, req.body.name);
//   res.status(201).json({ userId });
// });

// --- Tests ---

describe('AppEventBus', () => {
  let eventBus: AppEventBus;

  beforeEach(() => {
    eventBus = new AppEventBus();
  });

  it('should emit and receive events', () => {
    const received: DomainEvent[] = [];
    eventBus.on('test.event', (e) => received.push(e));

    eventBus.emit({ type: 'test.event', timestamp: new Date(), data: { value: 1 } });
    expect(received).toHaveLength(1);
    expect(received[0].data.value).toBe(1);
  });

  it('should support unsubscribe', () => {
    const received: DomainEvent[] = [];
    const unsubscribe = eventBus.on('test.event', (e) => received.push(e));

    eventBus.emit({ type: 'test.event', timestamp: new Date(), data: {} });
    unsubscribe();
    eventBus.emit({ type: 'test.event', timestamp: new Date(), data: {} });

    expect(received).toHaveLength(1);
  });

  it('should support wildcard listeners', () => {
    const all: string[] = [];
    eventBus.onAll((e) => all.push(e.type));

    eventBus.emit({ type: 'a.event', timestamp: new Date(), data: {} });
    eventBus.emit({ type: 'b.event', timestamp: new Date(), data: {} });

    expect(all).toEqual(['a.event', 'b.event']);
  });
});

describe('UserService + Observers', () => {
  let eventBus: AppEventBus;
  let userService: UserService;
  let welcomeHandler: WelcomeEmailHandler;
  let auditHandler: AuditLogHandler;

  beforeEach(() => {
    eventBus = new AppEventBus();
    userService = new UserService(eventBus);
    welcomeHandler = new WelcomeEmailHandler();
    auditHandler = new AuditLogHandler();

    welcomeHandler.register(eventBus);
    auditHandler.register(eventBus);
  });

  it('should send welcome email on registration', async () => {
    await userService.register('alice@test.com', 'Alice');
    expect(welcomeHandler.sentTo).toContain('alice@test.com');
  });

  it('should audit all events', async () => {
    await userService.register('bob@test.com', 'Bob');
    expect(auditHandler.logs.length).toBeGreaterThan(0);
    expect(auditHandler.logs[0]).toContain('user.registered');
  });

  it('should support multiple observers for same event', async () => {
    const analytics = new AnalyticsHandler();
    analytics.register(eventBus);

    await userService.register('carol@test.com', 'Carol');
    expect(welcomeHandler.sentTo).toContain('carol@test.com');
    expect(analytics.events).toContain('track:signup');
  });
});
