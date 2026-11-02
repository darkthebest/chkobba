// Template Method Pattern - Angular Example
// Uses @Injectable(), abstract classes, TestBed, RxJS Observable

import { Injectable } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';

// --- Abstract Base Class (Template) ---

export interface FormResult<T> {
  success: boolean;
  data?: T;
  errors?: string[];
}

@Injectable()
export abstract class BaseFormHandler<TInput, TOutput> {
  /** Template method - defines form submission workflow */
  submit(input: TInput): Observable<FormResult<TOutput>> {
    const errors = this.validate(input);
    if (errors.length > 0) {
      return of({ success: false, errors });
    }

    const transformed = this.transform(input);

    return this.save(transformed).pipe(
      tap((result) => this.afterSave(input, result)),
      map((result) => ({ success: true, data: result })),
      catchError((err) => of(this.onError(err))),
    );
  }

  /** Primitive - MUST be implemented: validation rules */
  protected abstract validate(input: TInput): string[];

  /** Primitive - MUST be implemented: data transformation */
  protected abstract transform(input: TInput): any;

  /** Primitive - MUST be implemented: persistence logic */
  protected abstract save(data: any): Observable<TOutput>;

  /** Hook - override for post-save side effects */
  protected afterSave(input: TInput, result: TOutput): void {}

  /** Hook - override for custom error handling */
  protected onError(error: Error): FormResult<TOutput> {
    return { success: false, errors: [error.message] };
  }
}

// --- Concrete Implementations ---

export interface UserFormInput {
  name: string;
  email: string;
  age: number;
}

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  age: number;
}

@Injectable({ providedIn: 'root' })
export class UserFormHandler extends BaseFormHandler<UserFormInput, UserRecord> {
  public savedRecords: UserRecord[] = [];

  protected validate(input: UserFormInput): string[] {
    const errors: string[] = [];
    if (!input.name || input.name.length < 2) errors.push('Name must be at least 2 characters');
    if (!input.email?.includes('@')) errors.push('Invalid email');
    if (input.age < 0 || input.age > 150) errors.push('Invalid age');
    return errors;
  }

  protected transform(input: UserFormInput): any {
    return {
      ...input,
      name: input.name.trim(),
      email: input.email.toLowerCase().trim(),
    };
  }

  protected save(data: any): Observable<UserRecord> {
    const record: UserRecord = { id: `user-${Date.now()}`, ...data };
    this.savedRecords.push(record);
    return of(record);
  }
}

export interface ContactFormInput {
  subject: string;
  message: string;
  email: string;
}

export interface TicketRecord {
  ticketId: string;
  subject: string;
  status: string;
}

@Injectable({ providedIn: 'root' })
export class ContactFormHandler extends BaseFormHandler<ContactFormInput, TicketRecord> {
  public notifications: string[] = [];

  protected validate(input: ContactFormInput): string[] {
    const errors: string[] = [];
    if (!input.subject) errors.push('Subject is required');
    if (!input.message || input.message.length < 10) errors.push('Message must be at least 10 characters');
    if (!input.email?.includes('@')) errors.push('Invalid email');
    return errors;
  }

  protected transform(input: ContactFormInput): any {
    return { subject: input.subject, message: input.message, email: input.email.toLowerCase() };
  }

  protected save(data: any): Observable<TicketRecord> {
    return of({ ticketId: `ticket-${Date.now()}`, subject: data.subject, status: 'open' });
  }

  protected afterSave(input: ContactFormInput, result: TicketRecord): void {
    this.notifications.push(`Ticket ${result.ticketId} created for ${input.email}`);
  }
}

// --- Tests ---

describe('UserFormHandler', () => {
  let handler: UserFormHandler;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [UserFormHandler] });
    handler = TestBed.inject(UserFormHandler);
  });

  it('should submit valid form data', (done) => {
    handler.submit({ name: 'Alice', email: 'alice@test.com', age: 30 }).subscribe((result) => {
      expect(result.success).toBe(true);
      expect(result.data?.name).toBe('Alice');
      expect(result.data?.id).toBeDefined();
      done();
    });
  });

  it('should return validation errors for invalid data', (done) => {
    handler.submit({ name: '', email: 'bad', age: -1 }).subscribe((result) => {
      expect(result.success).toBe(false);
      expect(result.errors?.length).toBeGreaterThan(0);
      done();
    });
  });

  it('should normalize email to lowercase', (done) => {
    handler.submit({ name: 'Bob', email: 'BOB@Test.COM', age: 25 }).subscribe((result) => {
      expect(result.data?.email).toBe('bob@test.com');
      done();
    });
  });
});

describe('ContactFormHandler', () => {
  let handler: ContactFormHandler;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ContactFormHandler] });
    handler = TestBed.inject(ContactFormHandler);
  });

  it('should create a support ticket', (done) => {
    handler
      .submit({ subject: 'Help', message: 'I need assistance with my order', email: 'user@test.com' })
      .subscribe((result) => {
        expect(result.success).toBe(true);
        expect(result.data?.status).toBe('open');
        done();
      });
  });

  it('should send notification after save', (done) => {
    handler
      .submit({ subject: 'Bug', message: 'Found a bug in the system', email: 'dev@test.com' })
      .subscribe(() => {
        expect(handler.notifications.length).toBe(1);
        expect(handler.notifications[0]).toContain('dev@test.com');
        done();
      });
  });
});
