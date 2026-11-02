a// Factory Pattern - NestJS Example
// Uses @Injectable() decorators, constructor injection, and NestJS testing utilities

import { Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';

// --- Common Interface ---

export interface Processor {
  process(data: any): Promise<ProcessResult>;
  validate(data: any): boolean;
}

export interface ProcessResult {
  success: boolean;
  output?: any;
}

// --- Concrete Implementations ---

@Injectable()
export class EmailProcessor implements Processor {
  async process(data: any): Promise<ProcessResult> {
    // Email-specific processing logic
    return { success: true, output: { messageId: `msg-${Date.now()}` } };
  }

  validate(data: any): boolean {
    return !!data?.to && !!data?.subject;
  }
}

@Injectable()
export class WebhookProcessor implements Processor {
  async process(data: any): Promise<ProcessResult> {
    // Webhook-specific processing logic
    return { success: true, output: { status: 200 } };
  }

  validate(data: any): boolean {
    return !!data?.url && !!data?.method;
  }
}

// --- Factory ---

type ProcessorType = 'email' | 'webhook';

interface ProcessorMap {
  email: EmailProcessor;
  webhook: WebhookProcessor;
}

@Injectable()
export class ProcessorFactory {
  constructor(
    private readonly emailProcessor: EmailProcessor,
    private readonly webhookProcessor: WebhookProcessor,
  ) {}

  createProcessor<T extends ProcessorType>(type: T): ProcessorMap[T] {
    const processors: Record<ProcessorType, Processor> = {
      email: this.emailProcessor,
      webhook: this.webhookProcessor,
    };

    const processor = processors[type];
    if (!processor) {
      throw new Error(`Unknown processor type: ${type}`);
    }

    return processor as ProcessorMap[T];
  }
}

// --- Client Service ---

@Injectable()
export class FlowService {
  constructor(private readonly processorFactory: ProcessorFactory) {}

  async processNode(type: ProcessorType, data: any): Promise<ProcessResult> {
    const processor = this.processorFactory.createProcessor(type);
    if (!processor.validate(data)) {
      return { success: false };
    }
    return processor.process(data);
  }
}

// --- Module Registration ---

@Module({
  providers: [EmailProcessor, WebhookProcessor, ProcessorFactory, FlowService],
  exports: [FlowService],
})
export class ProcessorModule {}

// --- Tests ---

describe('ProcessorFactory', () => {
  let factory: ProcessorFactory;
  let emailProcessor: EmailProcessor;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ProcessorFactory,
        { provide: EmailProcessor, useValue: { process: jest.fn(), validate: jest.fn() } },
        { provide: WebhookProcessor, useValue: { process: jest.fn(), validate: jest.fn() } },
      ],
    }).compile();

    factory = module.get(ProcessorFactory);
    emailProcessor = module.get(EmailProcessor);
  });

  it('should return correct processor for type', () => {
    const processor = factory.createProcessor('email');
    expect(processor).toBe(emailProcessor);
  });

  it('should throw for unknown type', () => {
    expect(() => factory.createProcessor('unknown' as any)).toThrow();
  });
});