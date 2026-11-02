// Template Method Pattern - NestJS Example
// Uses @Injectable(), abstract classes, NestJS module system

import { Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';

// --- Abstract Base Class (Template) ---

export interface ProcessResult {
  success: boolean;
  output?: any;
  error?: string;
}

@Injectable()
export abstract class BaseNodeProcessor {
  /** Template method - defines algorithm skeleton (do not override) */
  async process(context: Record<string, any>): Promise<ProcessResult> {
    try {
      await this.beforeProcess(context);
      const isValid = await this.validate(context);
      if (!isValid) {
        return { success: false, error: 'Validation failed' };
      }
      const output = await this.execute(context);
      await this.afterProcess(context, output);
      return { success: true, output };
    } catch (error) {
      return this.onError(error as Error, context);
    }
  }

  /** Primitive operation - MUST be implemented by subclasses */
  protected abstract validate(context: Record<string, any>): Promise<boolean>;

  /** Primitive operation - MUST be implemented by subclasses */
  protected abstract execute(context: Record<string, any>): Promise<any>;

  /** Hook - override for custom pre-processing */
  protected async beforeProcess(context: Record<string, any>): Promise<void> {}

  /** Hook - override for custom post-processing */
  protected async afterProcess(context: Record<string, any>, output: any): Promise<void> {}

  /** Hook - override for custom error handling */
  protected onError(error: Error, context: Record<string, any>): ProcessResult {
    return { success: false, error: error.message };
  }
}

// --- Concrete Implementations ---

@Injectable()
export class EmailNodeProcessor extends BaseNodeProcessor {
  public hooksCalled: string[] = [];

  protected async validate(context: Record<string, any>): Promise<boolean> {
    return !!context.to && !!context.subject;
  }

  protected async execute(context: Record<string, any>): Promise<any> {
    return { messageId: `msg-${Date.now()}`, to: context.to, subject: context.subject };
  }

  protected async beforeProcess(context: Record<string, any>): Promise<void> {
    this.hooksCalled.push('beforeProcess');
  }

  protected async afterProcess(context: Record<string, any>, output: any): Promise<void> {
    this.hooksCalled.push('afterProcess');
  }
}

@Injectable()
export class WebhookNodeProcessor extends BaseNodeProcessor {
  protected async validate(context: Record<string, any>): Promise<boolean> {
    return !!context.url && !!context.method;
  }

  protected async execute(context: Record<string, any>): Promise<any> {
    return { status: 200, url: context.url, method: context.method };
  }
}

@Injectable()
export class TransformNodeProcessor extends BaseNodeProcessor {
  protected async validate(context: Record<string, any>): Promise<boolean> {
    return !!context.data && !!context.format;
  }

  protected async execute(context: Record<string, any>): Promise<any> {
    const { data, format } = context;
    if (format === 'json') return JSON.stringify(data);
    if (format === 'csv') return Object.values(data).join(',');
    throw new Error(`Unsupported format: ${format}`);
  }
}

// --- Module ---

@Module({
  providers: [EmailNodeProcessor, WebhookNodeProcessor, TransformNodeProcessor],
  exports: [EmailNodeProcessor, WebhookNodeProcessor, TransformNodeProcessor],
})
export class ProcessorModule {}

// --- Tests ---

describe('EmailNodeProcessor', () => {
  let processor: EmailNodeProcessor;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [EmailNodeProcessor],
    }).compile();
    processor = module.get(EmailNodeProcessor);
  });

  it('should process valid email context', async () => {
    const result = await processor.process({ to: 'user@test.com', subject: 'Hello' });
    expect(result.success).toBe(true);
    expect(result.output.messageId).toBeDefined();
  });

  it('should fail validation for missing fields', async () => {
    const result = await processor.process({ to: 'user@test.com' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Validation failed');
  });

  it('should call hooks in correct order', async () => {
    await processor.process({ to: 'user@test.com', subject: 'Hi' });
    expect(processor.hooksCalled).toEqual(['beforeProcess', 'afterProcess']);
  });
});

describe('WebhookNodeProcessor', () => {
  let processor: WebhookNodeProcessor;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [WebhookNodeProcessor],
    }).compile();
    processor = module.get(WebhookNodeProcessor);
  });

  it('should process valid webhook context', async () => {
    const result = await processor.process({ url: 'https://api.test.com', method: 'POST' });
    expect(result.success).toBe(true);
    expect(result.output.status).toBe(200);
  });
});

describe('TransformNodeProcessor', () => {
  let processor: TransformNodeProcessor;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [TransformNodeProcessor],
    }).compile();
    processor = module.get(TransformNodeProcessor);
  });

  it('should transform data to JSON', async () => {
    const result = await processor.process({ data: { a: 1 }, format: 'json' });
    expect(result.success).toBe(true);
    expect(result.output).toBe('{"a":1}');
  });

  it('should handle unsupported format gracefully', async () => {
    const result = await processor.process({ data: { a: 1 }, format: 'xml' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unsupported format');
  });
});
