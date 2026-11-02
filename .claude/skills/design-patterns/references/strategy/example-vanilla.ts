// Strategy Pattern - Vanilla TypeScript Example
// Pure TypeScript classes, no DI framework, no decorators

// --- Strategy Interface ---

export interface CompressionStrategy {
  compress(data: string): CompressedData;
  decompress(data: CompressedData): string;
  name: string;
}

export interface CompressedData {
  content: string;
  algorithm: string;
  originalSize: number;
  compressedSize: number;
}

// --- Concrete Strategies ---

export class RunLengthEncoding implements CompressionStrategy {
  name = 'rle';

  compress(data: string): CompressedData {
    let encoded = '';
    let count = 1;
    for (let i = 1; i <= data.length; i++) {
      if (i < data.length && data[i] === data[i - 1]) {
        count++;
      } else {
        encoded += count > 1 ? `${count}${data[i - 1]}` : data[i - 1];
        count = 1;
      }
    }
    return {
      content: encoded,
      algorithm: this.name,
      originalSize: data.length,
      compressedSize: encoded.length,
    };
  }

  decompress(data: CompressedData): string {
    let decoded = '';
    let i = 0;
    while (i < data.content.length) {
      let numStr = '';
      while (i < data.content.length && /\d/.test(data.content[i])) {
        numStr += data.content[i++];
      }
      const count = numStr ? parseInt(numStr, 10) : 1;
      decoded += data.content[i].repeat(count);
      i++;
    }
    return decoded;
  }
}

export class Base64Encoding implements CompressionStrategy {
  name = 'base64';

  compress(data: string): CompressedData {
    const encoded = Buffer.from(data).toString('base64');
    return {
      content: encoded,
      algorithm: this.name,
      originalSize: data.length,
      compressedSize: encoded.length,
    };
  }

  decompress(data: CompressedData): string {
    return Buffer.from(data.content, 'base64').toString('utf-8');
  }
}

export class NoOpCompression implements CompressionStrategy {
  name = 'none';

  compress(data: string): CompressedData {
    return {
      content: data,
      algorithm: this.name,
      originalSize: data.length,
      compressedSize: data.length,
    };
  }

  decompress(data: CompressedData): string {
    return data.content;
  }
}

// --- Context ---

export class DataCompressor {
  private strategy: CompressionStrategy;

  constructor(strategy: CompressionStrategy) {
    this.strategy = strategy;
  }

  setStrategy(strategy: CompressionStrategy): void {
    this.strategy = strategy;
  }

  compress(data: string): CompressedData {
    return this.strategy.compress(data);
  }

  decompress(data: CompressedData): string {
    return this.strategy.decompress(data);
  }

  getActiveStrategy(): string {
    return this.strategy.name;
  }
}

// --- Tests ---

describe('DataCompressor', () => {
  it('should compress with RLE', () => {
    const compressor = new DataCompressor(new RunLengthEncoding());
    const result = compressor.compress('aaabbbcc');
    expect(result.algorithm).toBe('rle');
    expect(result.content).toBe('3a3b2c');
  });

  it('should decompress RLE data', () => {
    const rle = new RunLengthEncoding();
    const compressed = rle.compress('aaabbbcc');
    expect(rle.decompress(compressed)).toBe('aaabbbcc');
  });

  it('should compress with Base64', () => {
    const compressor = new DataCompressor(new Base64Encoding());
    const result = compressor.compress('hello');
    expect(result.algorithm).toBe('base64');
    expect(result.content).toBe('aGVsbG8=');
  });

  it('should decompress Base64 data', () => {
    const b64 = new Base64Encoding();
    const compressed = b64.compress('hello world');
    expect(b64.decompress(compressed)).toBe('hello world');
  });

  it('should pass through with NoOp', () => {
    const compressor = new DataCompressor(new NoOpCompression());
    const result = compressor.compress('test');
    expect(result.content).toBe('test');
    expect(result.originalSize).toBe(result.compressedSize);
  });

  it('should allow swapping strategies at runtime', () => {
    const compressor = new DataCompressor(new NoOpCompression());
    expect(compressor.getActiveStrategy()).toBe('none');

    compressor.setStrategy(new Base64Encoding());
    expect(compressor.getActiveStrategy()).toBe('base64');
  });
});
