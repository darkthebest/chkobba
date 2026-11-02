// Adapter Pattern - Vanilla TypeScript Example
// Pure TypeScript classes, no DI framework, no decorators

// --- Target Interface ---

export interface PaymentGateway {
  charge(amount: number, currency: string, token: string): Promise<PaymentResult>;
  refund(transactionId: string, amount?: number): Promise<RefundResult>;
}

export interface PaymentResult {
  transactionId: string;
  status: 'succeeded' | 'failed';
  amount: number;
  currency: string;
}

export interface RefundResult {
  refundId: string;
  status: 'succeeded' | 'failed';
  amount: number;
}

// --- Adaptees (Third-Party SDKs) ---

export class StripeSDK {
  async createPaymentIntent(params: {
    amount: number;
    currency: string;
    payment_method: string;
    confirm: boolean;
  }): Promise<{ id: string; status: string; amount: number }> {
    return { id: `pi_${Date.now()}`, status: 'succeeded', amount: params.amount };
  }

  async createRefund(params: {
    payment_intent: string;
    amount?: number;
  }): Promise<{ id: string; status: string; amount: number }> {
    return { id: `re_${Date.now()}`, status: 'succeeded', amount: params.amount || 0 };
  }
}

export class PayPalSDK {
  async createOrder(body: {
    intent: string;
    purchase_units: { amount: { value: string; currency_code: string } }[];
  }): Promise<{ id: string; status: string }> {
    return { id: `PP-${Date.now()}`, status: 'COMPLETED' };
  }

  async captureRefund(
    captureId: string,
    body: { amount?: { value: string; currency_code: string } },
  ): Promise<{ id: string; status: string }> {
    return { id: `PPR-${Date.now()}`, status: 'COMPLETED' };
  }
}

// --- Adapters ---

export class StripeAdapter implements PaymentGateway {
  constructor(private stripe: StripeSDK) {}

  async charge(amount: number, currency: string, token: string): Promise<PaymentResult> {
    const intent = await this.stripe.createPaymentIntent({
      amount: Math.round(amount * 100), // Stripe uses cents
      currency: currency.toLowerCase(),
      payment_method: token,
      confirm: true,
    });

    return {
      transactionId: intent.id,
      status: intent.status === 'succeeded' ? 'succeeded' : 'failed',
      amount,
      currency,
    };
  }

  async refund(transactionId: string, amount?: number): Promise<RefundResult> {
    const refund = await this.stripe.createRefund({
      payment_intent: transactionId,
      amount: amount ? Math.round(amount * 100) : undefined,
    });

    return {
      refundId: refund.id,
      status: refund.status === 'succeeded' ? 'succeeded' : 'failed',
      amount: refund.amount / 100,
    };
  }
}

export class PayPalAdapter implements PaymentGateway {
  constructor(private paypal: PayPalSDK) {}

  async charge(amount: number, currency: string, token: string): Promise<PaymentResult> {
    const order = await this.paypal.createOrder({
      intent: 'CAPTURE',
      purchase_units: [{ amount: { value: amount.toFixed(2), currency_code: currency } }],
    });

    return {
      transactionId: order.id,
      status: order.status === 'COMPLETED' ? 'succeeded' : 'failed',
      amount,
      currency,
    };
  }

  async refund(transactionId: string, amount?: number): Promise<RefundResult> {
    const refund = await this.paypal.captureRefund(transactionId, {
      amount: amount ? { value: amount.toFixed(2), currency_code: 'USD' } : undefined,
    });

    return {
      refundId: refund.id,
      status: refund.status === 'COMPLETED' ? 'succeeded' : 'failed',
      amount: amount || 0,
    };
  }
}

// --- Tests ---

describe('StripeAdapter', () => {
  let adapter: StripeAdapter;
  let mockStripe: jest.Mocked<StripeSDK>;

  beforeEach(() => {
    mockStripe = {
      createPaymentIntent: jest.fn().mockResolvedValue({ id: 'pi_123', status: 'succeeded', amount: 5000 }),
      createRefund: jest.fn().mockResolvedValue({ id: 're_456', status: 'succeeded', amount: 5000 }),
    } as any;
    adapter = new StripeAdapter(mockStripe);
  });

  it('should convert amount to cents for Stripe', async () => {
    await adapter.charge(50, 'USD', 'tok_123');
    expect(mockStripe.createPaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 5000 }),
    );
  });

  it('should map Stripe response to common interface', async () => {
    const result = await adapter.charge(50, 'USD', 'tok_123');
    expect(result.transactionId).toBe('pi_123');
    expect(result.status).toBe('succeeded');
    expect(result.amount).toBe(50);
  });

  it('should handle refund', async () => {
    const result = await adapter.refund('pi_123', 25);
    expect(result.refundId).toBe('re_456');
    expect(result.status).toBe('succeeded');
  });
});

describe('PayPalAdapter', () => {
  let adapter: PayPalAdapter;
  let mockPayPal: jest.Mocked<PayPalSDK>;

  beforeEach(() => {
    mockPayPal = {
      createOrder: jest.fn().mockResolvedValue({ id: 'PP-789', status: 'COMPLETED' }),
      captureRefund: jest.fn().mockResolvedValue({ id: 'PPR-101', status: 'COMPLETED' }),
    } as any;
    adapter = new PayPalAdapter(mockPayPal);
  });

  it('should map PayPal COMPLETED to succeeded', async () => {
    const result = await adapter.charge(50, 'USD', 'order_123');
    expect(result.status).toBe('succeeded');
    expect(result.transactionId).toBe('PP-789');
  });

  it('should format amount as string for PayPal', async () => {
    await adapter.charge(49.99, 'USD', 'order_123');
    expect(mockPayPal.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        purchase_units: [{ amount: { value: '49.99', currency_code: 'USD' } }],
      }),
    );
  });
});
