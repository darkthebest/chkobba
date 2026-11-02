// Observer Pattern - Angular Example
// Uses RxJS Subject/BehaviorSubject, Observable, TestBed

import { Injectable } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject, BehaviorSubject, Observable, Subscription, filter, map } from 'rxjs';

// --- Event Definitions ---

export interface AppEvent {
  type: string;
  timestamp: number;
  payload: any;
}

export interface UserLoggedInEvent extends AppEvent {
  type: 'user.loggedIn';
  payload: { userId: string; email: string };
}

export interface CartUpdatedEvent extends AppEvent {
  type: 'cart.updated';
  payload: { itemCount: number; total: number };
}

// --- Event Bus (Subject) ---

@Injectable({ providedIn: 'root' })
export class EventBusService {
  private eventSubject = new Subject<AppEvent>();

  emit(event: AppEvent): void {
    this.eventSubject.next(event);
  }

  on<T extends AppEvent>(eventType: string): Observable<T> {
    return this.eventSubject.pipe(
      filter((event) => event.type === eventType),
      map((event) => event as T),
    );
  }

  onAll(): Observable<AppEvent> {
    return this.eventSubject.asObservable();
  }
}

// --- State Store (BehaviorSubject) ---

export interface CartState {
  items: { id: string; name: string; price: number }[];
  total: number;
}

@Injectable({ providedIn: 'root' })
export class CartStore {
  private state = new BehaviorSubject<CartState>({ items: [], total: 0 });

  constructor(private eventBus: EventBusService) {}

  getState(): Observable<CartState> {
    return this.state.asObservable();
  }

  getCurrentState(): CartState {
    return this.state.value;
  }

  addItem(item: { id: string; name: string; price: number }): void {
    const current = this.state.value;
    const items = [...current.items, item];
    const total = items.reduce((sum, i) => sum + i.price, 0);
    this.state.next({ items, total });

    this.eventBus.emit({
      type: 'cart.updated',
      timestamp: Date.now(),
      payload: { itemCount: items.length, total },
    });
  }

  removeItem(id: string): void {
    const current = this.state.value;
    const items = current.items.filter((i) => i.id !== id);
    const total = items.reduce((sum, i) => sum + i.price, 0);
    this.state.next({ items, total });

    this.eventBus.emit({
      type: 'cart.updated',
      timestamp: Date.now(),
      payload: { itemCount: items.length, total },
    });
  }
}

// --- Observer Component (Subscriber) ---

@Injectable({ providedIn: 'root' })
export class CartBadgeService {
  public itemCount = 0;
  private subscription?: Subscription;

  constructor(private eventBus: EventBusService) {}

  startListening(): void {
    this.subscription = this.eventBus
      .on<CartUpdatedEvent>('cart.updated')
      .subscribe((event) => {
        this.itemCount = event.payload.itemCount;
      });
  }

  stopListening(): void {
    this.subscription?.unsubscribe();
  }
}

// --- Tests ---

describe('EventBusService', () => {
  let eventBus: EventBusService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [EventBusService] });
    eventBus = TestBed.inject(EventBusService);
  });

  it('should emit and receive typed events', (done) => {
    eventBus.on<UserLoggedInEvent>('user.loggedIn').subscribe((event) => {
      expect(event.payload.userId).toBe('u1');
      expect(event.payload.email).toBe('a@b.com');
      done();
    });

    eventBus.emit({
      type: 'user.loggedIn',
      timestamp: Date.now(),
      payload: { userId: 'u1', email: 'a@b.com' },
    });
  });

  it('should filter events by type', () => {
    const received: string[] = [];
    eventBus.on('cart.updated').subscribe(() => received.push('cart'));
    eventBus.on('user.loggedIn').subscribe(() => received.push('user'));

    eventBus.emit({ type: 'cart.updated', timestamp: Date.now(), payload: {} });
    expect(received).toEqual(['cart']);
  });
});

describe('CartStore + CartBadgeService', () => {
  let cart: CartStore;
  let badge: CartBadgeService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [EventBusService, CartStore, CartBadgeService],
    });
    cart = TestBed.inject(CartStore);
    badge = TestBed.inject(CartBadgeService);
    badge.startListening();
  });

  afterEach(() => {
    badge.stopListening();
  });

  it('should update badge count when item added', () => {
    cart.addItem({ id: '1', name: 'Widget', price: 10 });
    expect(badge.itemCount).toBe(1);

    cart.addItem({ id: '2', name: 'Gadget', price: 20 });
    expect(badge.itemCount).toBe(2);
  });

  it('should update badge count when item removed', () => {
    cart.addItem({ id: '1', name: 'Widget', price: 10 });
    cart.addItem({ id: '2', name: 'Gadget', price: 20 });
    cart.removeItem('1');
    expect(badge.itemCount).toBe(1);
  });

  it('should expose cart state as observable', (done) => {
    cart.addItem({ id: '1', name: 'Widget', price: 10 });
    cart.getState().subscribe((state) => {
      expect(state.total).toBe(10);
      done();
    });
  });
});
