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
