// Strategy Pattern - Express / Plain Node.js Example
// Uses manual instantiation, no DI framework, jest for testing

// --- Strategy Interface ---

export interface PricingStrategy {
  calculate(basePrice: number, quantity: number): PricingResult;
  name: string;
}

export interface PricingResult {
  unitPrice: number;
  total: number;
  discount: number;
  label: string;
}

// --- Concrete Strategies ---

export class StandardPricingStrategy implements PricingStrategy {
  name = 'standard';

  calculate(basePrice: number, quantity: number): PricingResult {
    const total = basePrice * quantity;
    return { unitPrice: basePrice, total, discount: 0, label: 'Standard pricing' };
  }
}

export class BulkPricingStrategy implements PricingStrategy {
  name = 'bulk';
  private discountRate: number;

  constructor(discountRate = 0.15) {
    this.discountRate = discountRate;
  }

  calculate(basePrice: number, quantity: number): PricingResult {
    const discount = quantity >= 10 ? this.discountRate : 0;
    const unitPrice = basePrice * (1 - discount);
    const total = unitPrice * quantity;
    return { unitPrice, total, discount, label: `Bulk pricing (${discount * 100}% off)` };
  }
}

export class SubscriptionPricingStrategy implements PricingStrategy {
  name = 'subscription';
  private monthlyDiscount: number;

  constructor(monthlyDiscount = 0.2) {
    this.monthlyDiscount = monthlyDiscount;
  }

  calculate(basePrice: number, quantity: number): PricingResult {
    const unitPrice = basePrice * (1 - this.monthlyDiscount);
    const total = unitPrice * quantity;
    return {
      unitPrice,
      total,
      discount: this.monthlyDiscount,
      label: `Subscription (${this.monthlyDiscount * 100}% off)`,
    };
  }
}

// --- Context ---

export class PricingCalculator {
  private strategies: Map<string, PricingStrategy> = new Map();

  register(strategy: PricingStrategy): void {
    this.strategies.set(strategy.name, strategy);
  }

  calculate(strategyName: string, basePrice: number, quantity: number): PricingResult {
    const strategy = this.strategies.get(strategyName);
    if (!strategy) {
      throw new Error(`Pricing strategy not found: ${strategyName}`);
    }
    return strategy.calculate(basePrice, quantity);
  }
}

// --- Express Route Usage ---

// import express from 'express';
// const app = express();
// const calculator = new PricingCalculator();
// calculator.register(new StandardPricingStrategy());
// calculator.register(new BulkPricingStrategy());
// calculator.register(new SubscriptionPricingStrategy());
//
// app.post('/pricing', (req, res) => {
//   const { strategy, basePrice, quantity } = req.body;
//   try {
//     const result = calculator.calculate(strategy, basePrice, quantity);
//     res.json(result);
//   } catch (err) {
//     res.status(400).json({ error: err.message });
//   }
// });

// --- Tests ---

describe('PricingCalculator', () => {
  let calculator: PricingCalculator;

  beforeEach(() => {
    calculator = new PricingCalculator();
    calculator.register(new StandardPricingStrategy());
    calculator.register(new BulkPricingStrategy(0.15));
    calculator.register(new SubscriptionPricingStrategy(0.2));
  });

  it('should calculate standard pricing', () => {
    const result = calculator.calculate('standard', 100, 5);
    expect(result.total).toBe(500);
    expect(result.discount).toBe(0);
  });

  it('should apply bulk discount for 10+ items', () => {
    const result = calculator.calculate('bulk', 100, 10);
    expect(result.discount).toBe(0.15);
    expect(result.unitPrice).toBe(85);
    expect(result.total).toBe(850);
  });

  it('should not apply bulk discount for fewer than 10 items', () => {
    const result = calculator.calculate('bulk', 100, 5);
    expect(result.discount).toBe(0);
    expect(result.total).toBe(500);
  });

  it('should apply subscription discount', () => {
    const result = calculator.calculate('subscription', 100, 1);
    expect(result.unitPrice).toBe(80);
    expect(result.discount).toBe(0.2);
  });

  it('should throw for unknown strategy', () => {
    expect(() => calculator.calculate('unknown', 100, 1)).toThrow('Pricing strategy not found');
  });
});
