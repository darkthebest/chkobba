// Adapter Pattern - Express / Plain Node.js Example
// Uses manual instantiation, no DI framework, jest for testing

// --- Target Interface ---

export interface StorageProvider {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<boolean>;
}

// --- Adaptees (Third-Party Clients) ---

export class RedisClientLib {
  private store = new Map<string, { value: string; expiry?: number }>();

  async GET(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiry && Date.now() > entry.expiry) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async SET(key: string, value: string): Promise<void> {
    this.store.set(key, { value });
  }

  async SETEX(key: string, seconds: number, value: string): Promise<void> {
    this.store.set(key, { value, expiry: Date.now() + seconds * 1000 });
  }

  async DEL(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }
}

export class S3ClientLib {
  private objects = new Map<string, string>();

  async getObject(params: { Bucket: string; Key: string }): Promise<{ Body: string }> {
    const val = this.objects.get(params.Key);
    if (!val) throw new Error('NoSuchKey');
    return { Body: val };
  }

  async putObject(params: { Bucket: string; Key: string; Body: string }): Promise<void> {
    this.objects.set(params.Key, params.Body);
  }

  async deleteObject(params: { Bucket: string; Key: string }): Promise<void> {
    this.objects.delete(params.Key);
  }
}

// --- Adapters ---

export class RedisStorageAdapter implements StorageProvider {
  constructor(private client: RedisClientLib) {}

  async get(key: string): Promise<string | null> {
    return this.client.GET(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.SETEX(key, ttlSeconds, value);
    } else {
      await this.client.SET(key, value);
    }
  }

  async delete(key: string): Promise<boolean> {
    const count = await this.client.DEL(key);
    return count > 0;
  }
}

export class S3StorageAdapter implements StorageProvider {
  constructor(
    private client: S3ClientLib,
    private bucket: string,
  ) {}

  async get(key: string): Promise<string | null> {
    try {
      const result = await this.client.getObject({ Bucket: this.bucket, Key: key });
      return result.Body;
    } catch {
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    await this.client.putObject({ Bucket: this.bucket, Key: key, Body: value });
  }

  async delete(key: string): Promise<boolean> {
    try {
      await this.client.deleteObject({ Bucket: this.bucket, Key: key });
      return true;
    } catch {
      return false;
    }
  }
}

// --- Express Route Usage ---

// import express from 'express';
// const app = express();
// const storage: StorageProvider = new RedisStorageAdapter(new RedisClientLib());
//
// app.get('/cache/:key', async (req, res) => {
//   const value = await storage.get(req.params.key);
//   if (!value) return res.status(404).json({ error: 'Not found' });
//   res.json({ key: req.params.key, value });
// });
//
// app.put('/cache/:key', async (req, res) => {
//   await storage.set(req.params.key, req.body.value, req.body.ttl);
//   res.status(204).send();
// });

// --- Tests ---

describe('RedisStorageAdapter', () => {
  let adapter: RedisStorageAdapter;

  beforeEach(() => {
    adapter = new RedisStorageAdapter(new RedisClientLib());
  });

  it('should set and get a value', async () => {
    await adapter.set('key1', 'value1');
    expect(await adapter.get('key1')).toBe('value1');
  });

  it('should return null for missing key', async () => {
    expect(await adapter.get('missing')).toBeNull();
  });

  it('should delete a key', async () => {
    await adapter.set('key1', 'value1');
    expect(await adapter.delete('key1')).toBe(true);
    expect(await adapter.get('key1')).toBeNull();
  });

  it('should return false when deleting missing key', async () => {
    expect(await adapter.delete('missing')).toBe(false);
  });
});

describe('S3StorageAdapter', () => {
  let adapter: S3StorageAdapter;

  beforeEach(() => {
    adapter = new S3StorageAdapter(new S3ClientLib(), 'test-bucket');
  });

  it('should set and get a value', async () => {
    await adapter.set('doc.json', '{"data":1}');
    expect(await adapter.get('doc.json')).toBe('{"data":1}');
  });

  it('should return null for missing object', async () => {
    expect(await adapter.get('missing.json')).toBeNull();
  });
});
