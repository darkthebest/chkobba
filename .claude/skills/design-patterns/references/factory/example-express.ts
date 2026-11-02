// Factory Pattern - Express / Plain Node.js Example
// Uses manual instantiation, no DI framework, jest for testing

// --- Common Interface ---

export interface NotificationSender {
  send(recipient: string, message: string): Promise<SendResult>;
  validate(recipient: string): boolean;
}

export interface SendResult {
  success: boolean;
  messageId: string;
}

// --- Concrete Implementations ---

export class EmailNotificationSender implements NotificationSender {
  constructor(private smtpHost: string) {}

  async send(recipient: string, message: string): Promise<SendResult> {
    // SMTP sending logic
    return { success: true, messageId: `email-${Date.now()}` };
  }

  validate(recipient: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient);
  }
}

export class SmsNotificationSender implements NotificationSender {
  constructor(private apiKey: string) {}

  async send(recipient: string, message: string): Promise<SendResult> {
    // SMS API sending logic
    return { success: true, messageId: `sms-${Date.now()}` };
  }

  validate(recipient: string): boolean {
    return /^\+?[\d\s-]{10,}$/.test(recipient);
  }
}

export class SlackNotificationSender implements NotificationSender {
  constructor(private webhookUrl: string) {}

  async send(recipient: string, message: string): Promise<SendResult> {
    // Slack webhook logic
    return { success: true, messageId: `slack-${Date.now()}` };
  }

  validate(recipient: string): boolean {
    return recipient.startsWith('#') || recipient.startsWith('@');
  }
}

// --- Factory ---

type NotificationType = 'email' | 'sms' | 'slack';

export class NotificationFactory {
  private config: Record<string, string>;

  constructor(config: Record<string, string>) {
    this.config = config;
  }

  create(type: NotificationType): NotificationSender {
    switch (type) {
      case 'email':
        return new EmailNotificationSender(this.config.SMTP_HOST || 'localhost');
      case 'sms':
        return new SmsNotificationSender(this.config.SMS_API_KEY || '');
      case 'slack':
        return new SlackNotificationSender(this.config.SLACK_WEBHOOK || '');
      default:
        throw new Error(`Unknown notification type: ${type}`);
    }
  }
}

// --- Express Route Usage ---

// import express from 'express';
// const app = express();
// const factory = new NotificationFactory(process.env);
//
// app.post('/notify', async (req, res) => {
//   const { type, recipient, message } = req.body;
//   const sender = factory.create(type);
//   if (!sender.validate(recipient)) {
//     return res.status(400).json({ error: 'Invalid recipient' });
//   }
//   const result = await sender.send(recipient, message);
//   res.json(result);
// });

// --- Tests ---

describe('NotificationFactory', () => {
  const factory = new NotificationFactory({ SMTP_HOST: 'smtp.test.com' });

  it('should create email sender', () => {
    const sender = factory.create('email');
    expect(sender).toBeInstanceOf(EmailNotificationSender);
  });

  it('should create sms sender', () => {
    const sender = factory.create('sms');
    expect(sender).toBeInstanceOf(SmsNotificationSender);
  });

  it('should throw for unknown type', () => {
    expect(() => factory.create('unknown' as any)).toThrow('Unknown notification type');
  });

  it('should validate email recipients', () => {
    const sender = factory.create('email');
    expect(sender.validate('user@example.com')).toBe(true);
    expect(sender.validate('invalid')).toBe(false);
  });

  it('should send notification', async () => {
    const sender = factory.create('email');
    const result = await sender.send('user@example.com', 'Hello');
    expect(result.success).toBe(true);
    expect(result.messageId).toBeDefined();
  });
});
