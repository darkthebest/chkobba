// Strategy Pattern - NestJS Example
// Uses @Injectable(), constructor injection, NestJS module system

import { Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';

// --- Strategy Interface ---

export interface ValidationStrategy {
  validate(value: string): ValidationResult;
  canHandle(fieldType: string): boolean;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

// --- Concrete Strategies ---

@Injectable()
export class EmailValidationStrategy implements ValidationStrategy {
  validate(value: string): ValidationResult {
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    return {
      isValid,
      errors: isValid ? [] : ['Invalid email format'],
    };
  }

  canHandle(fieldType: string): boolean {
    return fieldType === 'email';
  }
}

@Injectable()
export class PhoneValidationStrategy implements ValidationStrategy {
  validate(value: string): ValidationResult {
    const cleaned = value.replace(/[\s\-()]/g, '');
    const isValid = /^\+?\d{10,15}$/.test(cleaned);
    return {
      isValid,
      errors: isValid ? [] : ['Invalid phone number format'],
    };
  }

  canHandle(fieldType: string): boolean {
    return fieldType === 'phone';
  }
}

@Injectable()
export class UrlValidationStrategy implements ValidationStrategy {
  validate(value: string): ValidationResult {
    try {
      new URL(value);
      return { isValid: true, errors: [] };
    } catch {
      return { isValid: false, errors: ['Invalid URL format'] };
    }
  }

  canHandle(fieldType: string): boolean {
    return fieldType === 'url';
  }
}

// --- Context (Strategy Selector) ---

@Injectable()
export class FieldValidator {
  private strategies: ValidationStrategy[];

  constructor(
    emailStrategy: EmailValidationStrategy,
    phoneStrategy: PhoneValidationStrategy,
    urlStrategy: UrlValidationStrategy,
  ) {
    this.strategies = [emailStrategy, phoneStrategy, urlStrategy];
  }

  validate(fieldType: string, value: string): ValidationResult {
    const strategy = this.strategies.find((s) => s.canHandle(fieldType));
    if (!strategy) {
      return { isValid: true, errors: [] }; // Default: no validation
    }
    return strategy.validate(value);
  }
}

// --- Module ---

@Module({
  providers: [
    EmailValidationStrategy,
    PhoneValidationStrategy,
    UrlValidationStrategy,
    FieldValidator,
  ],
  exports: [FieldValidator],
})
export class ValidationModule {}

// --- Tests ---

describe('FieldValidator', () => {
  let validator: FieldValidator;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        EmailValidationStrategy,
        PhoneValidationStrategy,
        UrlValidationStrategy,
        FieldValidator,
      ],
    }).compile();

    validator = module.get(FieldValidator);
  });

  it('should validate emails', () => {
    expect(validator.validate('email', 'user@test.com').isValid).toBe(true);
    expect(validator.validate('email', 'invalid').isValid).toBe(false);
  });

  it('should validate phone numbers', () => {
    expect(validator.validate('phone', '+1234567890').isValid).toBe(true);
    expect(validator.validate('phone', 'abc').isValid).toBe(false);
  });

  it('should validate URLs', () => {
    expect(validator.validate('url', 'https://example.com').isValid).toBe(true);
    expect(validator.validate('url', 'not-a-url').isValid).toBe(false);
  });

  it('should return valid for unknown field types', () => {
    expect(validator.validate('unknown', 'anything').isValid).toBe(true);
  });
});
