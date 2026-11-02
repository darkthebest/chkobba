// Adapter Pattern - NestJS Example
// Uses @Injectable(), constructor injection, NestJS module system

import { Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';

// --- Target Interface ---

export interface EmailProvider {
  send(to: string, subject: string, body: string): Promise<SendResult>;
  sendBatch(messages: EmailMessage[]): Promise<SendResult[]>;
}

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
}

export interface SendResult {
  success: boolean;
  messageId: string;
}

// --- Adaptees (Third-Party Clients) ---

export class SendGridClient {
  async sendMail(params: { to: string; subject: string; html: string }): Promise<{ id: string }> {
    return { id: `sg-${Date.now()}` };
  }
}

export class SesClient {
  async sendEmail(params: {
    Destination: { ToAddresses: string[] };
    Message: { Subject: { Data: string }; Body: { Html: { Data: string } } };
  }): Promise<{ MessageId: string }> {
    return { MessageId: `ses-${Date.now()}` };
  }
}

// --- Adapters ---

@Injectable()
export class SendGridAdapter implements EmailProvider {
  constructor(private readonly client: SendGridClient) {}

  async send(to: string, subject: string, body: string): Promise<SendResult> {
    const response = await this.client.sendMail({ to, subject, html: body });
    return { success: true, messageId: response.id };
  }

  async sendBatch(messages: EmailMessage[]): Promise<SendResult[]> {
    return Promise.all(messages.map((msg) => this.send(msg.to, msg.subject, msg.body)));
  }
}

@Injectable()
export class SesAdapter implements EmailProvider {
  constructor(private readonly client: SesClient) {}

  async send(to: string, subject: string, body: string): Promise<SendResult> {
    const response = await this.client.sendEmail({
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: subject },
        Body: { Html: { Data: body } },
      },
    });
    return { success: true, messageId: response.MessageId };
  }

  async sendBatch(messages: EmailMessage[]): Promise<SendResult[]> {
    return Promise.all(messages.map((msg) => this.send(msg.to, msg.subject, msg.body)));
  }
}

// --- Client Service ---

@Injectable()
export class NotificationService {
  constructor(private readonly emailProvider: EmailProvider) {}

  async notifyUser(email: string, subject: string, message: string): Promise<SendResult> {
    return this.emailProvider.send(email, subject, message);
  }
}

// --- Module ---

@Module({
  providers: [
    SendGridClient,
    { provide: 'EmailProvider', useClass: SendGridAdapter },
    NotificationService,
  ],
  exports: [NotificationService],
})
export class EmailModule {}

// --- Tests ---

describe('SendGridAdapter', () => {
  let adapter: SendGridAdapter;
  let mockClient: jest.Mocked<SendGridClient>;

  beforeEach(async () => {
    mockClient = { sendMail: jest.fn().mockResolvedValue({ id: 'sg-123' }) } as any;

    const module = await Test.createTestingModule({
      providers: [
        { provide: SendGridClient, useValue: mockClient },
        SendGridAdapter,
      ],
    }).compile();

    adapter = module.get(SendGridAdapter);
  });

  it('should adapt SendGrid send to common interface', async () => {
    const result = await adapter.send('user@test.com', 'Hello', '<p>Hi</p>');
    expect(result.success).toBe(true);
    expect(result.messageId).toBe('sg-123');
    expect(mockClient.sendMail).toHaveBeenCalledWith({
      to: 'user@test.com',
      subject: 'Hello',
      html: '<p>Hi</p>',
    });
  });

  it('should send batch messages', async () => {
    const messages = [
      { to: 'a@test.com', subject: 'A', body: 'Body A' },
      { to: 'b@test.com', subject: 'B', body: 'Body B' },
    ];
    const results = await adapter.sendBatch(messages);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.success)).toBe(true);
  });
});

describe('SesAdapter', () => {
  let adapter: SesAdapter;

  beforeEach(async () => {
    const mockSes = { sendEmail: jest.fn().mockResolvedValue({ MessageId: 'ses-456' }) };

    const module = await Test.createTestingModule({
      providers: [
        { provide: SesClient, useValue: mockSes },
        SesAdapter,
      ],
    }).compile();

    adapter = module.get(SesAdapter);
  });

  it('should adapt SES send to common interface', async () => {
    const result = await adapter.send('user@test.com', 'Hello', '<p>Hi</p>');
    expect(result.success).toBe(true);
    expect(result.messageId).toBe('ses-456');
  });
});
