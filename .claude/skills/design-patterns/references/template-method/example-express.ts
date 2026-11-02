// Template Method Pattern - Express / Plain Node.js Example
// Uses abstract classes, no DI framework, jest for testing

// --- Abstract Base Class (Template) ---

export interface SyncResult {
  success: boolean;
  recordsSynced: number;
  errors: string[];
}

export abstract class BaseIntegrationSync {
  /** Template method - defines sync workflow (do not override) */
  async sync(): Promise<SyncResult> {
    const errors: string[] = [];

    try {
      await this.connect();
      const rawData = await this.fetchData();
      const transformed = await this.transform(rawData);
      const batches = this.batch(transformed);

      let totalSynced = 0;
      for (const batch of batches) {
        const count = await this.send(batch);
        totalSynced += count;
      }

      await this.afterSync(totalSynced);
      await this.disconnect();

      return { success: true, recordsSynced: totalSynced, errors };
    } catch (error) {
      errors.push((error as Error).message);
      await this.onError(error as Error);
      return { success: false, recordsSynced: 0, errors };
    }
  }

  /** Primitive - MUST implement: establish connection */
  protected abstract connect(): Promise<void>;

  /** Primitive - MUST implement: fetch raw data from source */
  protected abstract fetchData(): Promise<any[]>;

  /** Primitive - MUST implement: transform data to target format */
  protected abstract transform(data: any[]): Promise<any[]>;

  /** Primitive - MUST implement: send batch to destination */
  protected abstract send(batch: any[]): Promise<number>;

  /** Hook - override for custom batching (default: single batch) */
  protected batch(data: any[]): any[][] {
    return [data];
  }

  /** Hook - override for post-sync actions */
  protected async afterSync(totalSynced: number): Promise<void> {}

  /** Hook - override for custom disconnect */
  protected async disconnect(): Promise<void> {}

  /** Hook - override for custom error handling */
  protected async onError(error: Error): Promise<void> {
    console.error(`Sync failed: ${error.message}`);
  }
}

// --- Concrete Implementations ---

export class CrmSync extends BaseIntegrationSync {
  public connected = false;
  public sentBatches: any[][] = [];

  private data: any[] = [];

  constructor(data: any[] = []) {
    super();
    this.data = data;
  }

  protected async connect(): Promise<void> {
    this.connected = true;
  }

  protected async fetchData(): Promise<any[]> {
    return this.data;
  }

  protected async transform(data: any[]): Promise<any[]> {
    return data.map((item) => ({
      externalId: item.id,
      fullName: `${item.firstName} ${item.lastName}`,
      contactEmail: item.email,
    }));
  }

  protected batch(data: any[]): any[][] {
    const batchSize = 2;
    const batches: any[][] = [];
    for (let i = 0; i < data.length; i += batchSize) {
      batches.push(data.slice(i, i + batchSize));
    }
    return batches;
  }

  protected async send(batch: any[]): Promise<number> {
    this.sentBatches.push(batch);
    return batch.length;
  }

  protected async disconnect(): Promise<void> {
    this.connected = false;
  }
}

export class AnalyticsSync extends BaseIntegrationSync {
  public events: string[] = [];

  private rawEvents: any[];

  constructor(rawEvents: any[] = []) {
    super();
    this.rawEvents = rawEvents;
  }

  protected async connect(): Promise<void> {}

  protected async fetchData(): Promise<any[]> {
    return this.rawEvents;
  }

  protected async transform(data: any[]): Promise<any[]> {
    return data.map((event) => ({
      event_name: event.type,
      timestamp: event.ts,
      properties: event.data,
    }));
  }

  protected async send(batch: any[]): Promise<number> {
    this.events.push(...batch.map((b) => b.event_name));
    return batch.length;
  }

  protected async afterSync(totalSynced: number): Promise<void> {
    this.events.push(`sync_complete:${totalSynced}`);
  }
}

// --- Express Route Usage ---

// import express from 'express';
// const app = express();
//
// app.post('/sync/crm', async (req, res) => {
//   const sync = new CrmSync(req.body.contacts);
//   const result = await sync.sync();
//   res.json(result);
// });

// --- Tests ---

describe('CrmSync', () => {
  const contacts = [
    { id: '1', firstName: 'Alice', lastName: 'Smith', email: 'alice@test.com' },
    { id: '2', firstName: 'Bob', lastName: 'Jones', email: 'bob@test.com' },
    { id: '3', firstName: 'Carol', lastName: 'Lee', email: 'carol@test.com' },
  ];

  it('should sync all contacts', async () => {
    const sync = new CrmSync(contacts);
    const result = await sync.sync();
    expect(result.success).toBe(true);
    expect(result.recordsSynced).toBe(3);
  });

  it('should batch contacts in groups of 2', async () => {
    const sync = new CrmSync(contacts);
    await sync.sync();
    expect(sync.sentBatches).toHaveLength(2); // [2, 1]
    expect(sync.sentBatches[0]).toHaveLength(2);
    expect(sync.sentBatches[1]).toHaveLength(1);
  });

  it('should transform to CRM format', async () => {
    const sync = new CrmSync(contacts);
    await sync.sync();
    expect(sync.sentBatches[0][0]).toEqual({
      externalId: '1',
      fullName: 'Alice Smith',
      contactEmail: 'alice@test.com',
    });
  });

  it('should disconnect after sync', async () => {
    const sync = new CrmSync(contacts);
    await sync.sync();
    expect(sync.connected).toBe(false);
  });
});

describe('AnalyticsSync', () => {
  const events = [
    { type: 'page_view', ts: 1000, data: { page: '/home' } },
    { type: 'click', ts: 2000, data: { element: 'button' } },
  ];

  it('should sync analytics events', async () => {
    const sync = new AnalyticsSync(events);
    const result = await sync.sync();
    expect(result.success).toBe(true);
    expect(result.recordsSynced).toBe(2);
  });

  it('should call afterSync hook', async () => {
    const sync = new AnalyticsSync(events);
    await sync.sync();
    expect(sync.events).toContain('sync_complete:2');
  });
});
