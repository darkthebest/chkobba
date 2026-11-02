# Adapter Pattern

Converts an existing (foreign / legacy / third-party) interface into the one your application expects. Lets clients work with multiple incompatible APIs through a single domain-level contract.

Two variants:

- **Object Adapter** (composition, has-a) — recommended in TypeScript.
- **Class Adapter** (inheritance, is-a) — rare; uses multiple inheritance which TS lacks natively.

Components:

- **Target** — the interface your app speaks (domain-shaped).
- **Adaptee** — the foreign API you must integrate.
- **Adapter** — implements Target, holds an Adaptee, translates both ways.

## When To Use

- Integrating third-party APIs (Stripe, HubSpot, SendGrid, etc.) without leaking their shapes.
- Supporting multiple providers behind one app interface (CRM, email, payments, storage).
- Replacing a service implementation without touching callers.
- Wrapping legacy code whose interface you can't (or shouldn't) change.

## When NOT To Use

- Interfaces already match — no adaptation needed.
- Only thin wrapping required, no interface conversion. Use a service module instead.
- One-time, throwaway integration. Adapter overhead > benefit.
- You control both sides. Just align the interfaces.

## Disambiguation

- **vs Decorator** — adapter *changes* the interface; decorator *preserves* it while adding behavior.
- **vs Facade** — facade simplifies a complex subsystem; adapter translates between mismatched interfaces.
- **vs Proxy** — proxy controls access to the same interface; adapter exposes a different one.

## Use Cases

| Domain         | Foreign APIs                          | Target Interface         |
|----------------|---------------------------------------|--------------------------|
| CRM            | HubSpot, Mailchimp, Salesforce        | `CrmProvider`            |
| Storage        | Mongo, Redis, S3                      | `LeadStorage`            |
| Email          | SendGrid, SES, Resend                 | `EmailProvider`          |
| Payments       | Stripe, PayPal                        | `PaymentGateway`         |

## Code Example

```typescript
// design-patterns/adapter - Vanilla TypeScript Example
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
```

## Implementation Steps

1. **Design Target from the app's viewpoint.** Domain terms, no third-party concepts leaked.
2. **Study the Adaptee.** Document API differences, missing features, error shapes.
3. **Implement the adapter.** Inject the Adaptee client, translate inputs and outputs, translate errors.
4. **Client code uses the Target only** — never imports the Adaptee.

## Best Practices

- **Domain-first interface design.** Don't shape Target around the foreign API; shape it around your use case.
- **Bidirectional translation.** Map outgoing fields to the API, incoming responses back to domain types.
- **Translate errors.** Convert third-party error classes into app-specific exceptions; never let them bubble.
- **DI for selection.** Choose adapter via config / factory. Same interface = swap implementations freely.
- **Document feature gaps.** If `EmailProvider.scheduleSend` is unsupported by one provider, decide upfront: throw `NotImplementedError`, log warning, or silently noop — and document.
- **Polymorphic tests.** Parameterize one test suite over every adapter; catches missing methods early.

## Common Mistakes

- **Leaking adaptee types.** Target exposes `Stripe.Customer` — now every caller depends on Stripe.
- **Incomplete adaptation.** Some methods half-implemented; mocks pass, prod breaks.
- **Business logic inside adapter.** Adapter is pure translation. Domain logic belongs in the service.
- **No error translation.** Third-party error classes propagate; callers branch on them.
- **Tight coupling.** Client `if (adapter instanceof StripeAdapter)` — defeats polymorphism.

## References

- [Refactoring Guru — Adapter](https://refactoring.guru/design-patterns/adapter)
- [TypeScript Example](https://refactoring.guru/design-patterns/adapter/typescript/example)
- [Dependency Inversion Principle](https://refactoring.guru/principles/dependency-inversion)
