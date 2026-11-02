// Observer Pattern - NestJS Example
// Uses EventEmitter2, @OnEvent decorator, NestJS module system

import { Injectable, Module } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';

// --- Event Definitions ---

export interface DomainEvent {
  eventName: string;
  timestamp: Date;
  aggregateId: string;
}

export interface OrderCreatedEvent extends DomainEvent {
  eventName: 'order.created';
  payload: {
    orderId: string;
    userId: string;
    total: number;
    items: { productId: string; quantity: number }[];
  };
}

export interface OrderCompletedEvent extends DomainEvent {
  eventName: 'order.completed';
  payload: {
    orderId: string;
    userId: string;
  };
}

// --- Publisher (Subject) ---

@Injectable()
export class OrderService {
  constructor(private eventEmitter: EventEmitter2) {}

  async createOrder(userId: string, items: { productId: string; quantity: number }[]): Promise<string> {
    const orderId = `order-${Date.now()}`;
    // ... save order to database ...

    this.eventEmitter.emit('order.created', {
      eventName: 'order.created',
      timestamp: new Date(),
      aggregateId: orderId,
      payload: { orderId, userId, total: 99.99, items },
    } satisfies OrderCreatedEvent);

    return orderId;
  }

  async completeOrder(orderId: string, userId: string): Promise<void> {
    this.eventEmitter.emit('order.completed', {
      eventName: 'order.completed',
      timestamp: new Date(),
      aggregateId: orderId,
      payload: { orderId, userId },
    } satisfies OrderCompletedEvent);
  }
}

// --- Observers (Subscribers) ---

@Injectable()
export class InventoryListener {
  public processed: string[] = [];

  @OnEvent('order.created')
  handleOrderCreated(event: OrderCreatedEvent): void {
    for (const item of event.payload.items) {
      this.processed.push(`reserve:${item.productId}:${item.quantity}`);
    }
  }
}

@Injectable()
export class NotificationListener {
  public notifications: string[] = [];

  @OnEvent('order.created')
  handleOrderCreated(event: OrderCreatedEvent): void {
    this.notifications.push(`email:${event.payload.userId}:order-confirmation`);
  }

  @OnEvent('order.completed')
  handleOrderCompleted(event: OrderCompletedEvent): void {
    this.notifications.push(`email:${event.payload.userId}:order-shipped`);
  }
}

@Injectable()
export class AuditLogger {
  public logs: string[] = [];

  @OnEvent('order.*')
  handleAnyOrderEvent(event: DomainEvent): void {
    this.logs.push(`${event.eventName}:${event.aggregateId}`);
  }
}

// --- Module ---

@Module({
  providers: [OrderService, InventoryListener, NotificationListener, AuditLogger],
  exports: [OrderService],
})
export class OrderModule {}

// --- Tests ---

describe('OrderService Events', () => {
  let orderService: OrderService;
  let inventory: InventoryListener;
  let notifications: NotificationListener;
  let audit: AuditLogger;
  let eventEmitter: EventEmitter2;

  beforeEach(async () => {
    eventEmitter = new EventEmitter2({ wildcard: true });

    const module = await Test.createTestingModule({
      providers: [
        { provide: EventEmitter2, useValue: eventEmitter },
        OrderService,
        InventoryListener,
        NotificationListener,
        AuditLogger,
      ],
    }).compile();

    orderService = module.get(OrderService);
    inventory = module.get(InventoryListener);
    notifications = module.get(NotificationListener);
    audit = module.get(AuditLogger);

    // Manually register listeners (in real NestJS, EventEmitterModule handles this)
    eventEmitter.on('order.created', (e) => inventory.handleOrderCreated(e));
    eventEmitter.on('order.created', (e) => notifications.handleOrderCreated(e));
    eventEmitter.on('order.completed', (e) => notifications.handleOrderCompleted(e));
    eventEmitter.on('order.*', (e) => audit.handleAnyOrderEvent(e));
  });

  it('should notify inventory on order creation', async () => {
    await orderService.createOrder('user-1', [{ productId: 'p1', quantity: 2 }]);
    expect(inventory.processed).toContain('reserve:p1:2');
  });

  it('should send confirmation email on order creation', async () => {
    await orderService.createOrder('user-1', []);
    expect(notifications.notifications).toContain('email:user-1:order-confirmation');
  });

  it('should send shipped email on order completion', async () => {
    await orderService.completeOrder('order-1', 'user-1');
    expect(notifications.notifications).toContain('email:user-1:order-shipped');
  });

  it('should audit all order events via wildcard', async () => {
    await orderService.createOrder('user-1', []);
    expect(audit.logs.length).toBeGreaterThan(0);
    expect(audit.logs[0]).toContain('order.created');
  });
});
