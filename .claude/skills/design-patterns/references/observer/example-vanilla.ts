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
