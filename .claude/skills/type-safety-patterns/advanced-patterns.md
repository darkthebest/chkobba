# Type Safety Patterns - Advanced Patterns

<purpose>
Supplementary reference containing advanced type safety patterns, anti-patterns, and review checklists.
</purpose>

<relation-to-main>
This file contains advanced patterns extracted from SKILL.md. For core null safety, type guards, and runtime validation, see the main SKILL.md.
</relation-to-main>

## Advanced Patterns

<pattern name="option-type">
  <description>Functional programming pattern for nullable values</description>
  <use-case>When you want to make null handling explicit and composable</use-case>
  <code language="typescript">
```typescript
type Option<T> = T | null;

function map<T, U>(option: Option<T>, fn: (value: T) => U): Option<U> {
  return option === null ? null : fn(option);
}
```
  </code>
</pattern>

<pattern name="result-type">
  <description>Discriminated union for success/failure results</description>
  <use-case>When you want to handle errors without exceptions</use-case>
  <code language="typescript">
```typescript
type Result<T, E> = { success: true; value: T } | { success: false; error: E };

function divide(a: number, b: number): Result<number, string> {
  if (b === 0) {
    return { success: false, error: 'Division by zero' };
  }
  return { success: true, value: a / b };
}
```
  </code>
</pattern>

<pattern name="builder-pattern-with-type-safety">
  <description>Type-safe builder with compile-time required field checking</description>
  <use-case>When constructing complex objects with required and optional fields</use-case>
  <code language="typescript">
```typescript
class UserBuilder {
  private user: Partial<User> = {};

  setId(id: string): this {
    this.user.id = id;
    return this;
  }

  setEmail(email: string): this {
    this.user.email = email;
    return this;
  }

  build(): User {
    if (!this.user.id || !this.user.email) {
      throw new Error('Missing required fields');
    }
    return this.user as User;
  }
}
```
  </code>
</pattern>

## Anti-Patterns

<anti-patterns>
  <category name="non-null-assertion">
    <description>
      Non-null assertion operator (!) bypasses null checks - use sparingly and only when certain
    </description>

    <anti-pattern severity="high">
      <problem>Bypasses type safety without proof of non-null</problem>
      <code language="typescript">
```typescript
// AVOID if possible
const user = getUser()!; // Asserts user is not null
```
      </code>
    </anti-pattern>

    <safer-alternative>
      <approach>Explicit null check with error handling</approach>
      <code language="typescript">
```typescript
// BETTER: Handle null case
const user = getUser();
if (!user) {
  throw new Error('User not found');
}
console.log(user.name);
```
      </code>
    </safer-alternative>

    <safer-alternative>
      <approach>Optional chaining with fallback</approach>
      <code language="typescript">
```typescript
// OR use optional chaining
const name = getUser()?.name ?? 'Anonymous';
```
      </code>
    </safer-alternative>

  </category>

  <category name="unsafe-type-assertion">
    <description>
      Type assertion (as) forces TypeScript to treat value as a type without runtime verification
    </description>

    <anti-pattern severity="critical">
      <problem>No runtime check - crashes if data doesn't match</problem>
      <code language="typescript">
```typescript
// UNSAFE type assertion
const user = data as User; // No runtime check
```
      </code>
    </anti-pattern>

    <safer-alternative>
      <approach>Use type guard for runtime verification</approach>
      <code language="typescript">
```typescript
// BETTER: Use type guard
if (isUser(data)) {
  const user = data; // TypeScript knows it's User
}
```
      </code>
    </safer-alternative>

    <safer-alternative>
      <approach>Runtime validation with schema</approach>
      <code language="typescript">
```typescript
// OR runtime validation
const user = UserSchema.parse(data); // Runtime check
```
      </code>
    </safer-alternative>

  </category>
</anti-patterns>

## Review Checklist

<review-checklist>
  <description>
    Use this checklist when implementing new features or reviewing code for type safety
  </description>

  <item category="configuration" priority="critical">
    <check>Strict mode enabled in tsconfig.json</check>
    <verification>grep "strict": true tsconfig.json</verification>
  </item>

  <item category="type-usage" priority="critical">
    <check>No `any` types (or documented exceptions with // @ts-expect-error)</check>
    <verification>Search codebase for ": any" and "as any"</verification>
  </item>

  <item category="null-safety" priority="high">
    <check>Null checks before property access</check>
    <verification>Look for direct property access on nullable types</verification>
  </item>

  <item category="type-narrowing" priority="high">
    <check>Type guards implemented for unknown data</check>
    <verification>Check all unknown -> specific type conversions</verification>
  </item>

  <item category="validation" priority="high">
    <check>Runtime validation for external data (API, user input)</check>
    <verification>Verify Zod schemas at boundary points</verification>
  </item>

  <item category="exhaustiveness" priority="medium">
    <check>Exhaustiveness checking in switch statements</check>
    <verification>Check for "never" type in default cases</verification>
  </item>

  <item category="generics" priority="medium">
    <check>Generic constraints where appropriate</check>
    <verification>Review generic functions for proper constraints</verification>
  </item>

  <item category="error-handling" priority="medium">
    <check>Proper error handling (no silent failures)</check>
    <verification>Check all try-catch blocks and error paths</verification>
  </item>

  <item category="assertions" priority="high">
    <check>No unsafe type assertions (as, !) without justification</check>
    <verification>Search for "as" and "!" operators</verification>
  </item>

  <item category="documentation" priority="low">
    <check>Documentation for complex types</check>
    <verification>Check JSDoc comments on complex types</verification>
  </item>
</review-checklist>

## Best Practices

<best-practices>
  <practice priority="critical">Enable strict mode always</practice>
  <practice priority="critical">Use unknown instead of any</practice>
  <practice priority="high">Implement proper type guards</practice>
  <practice priority="high">Handle null/undefined explicitly</practice>
  <practice priority="high">Use discriminated unions for states</practice>
  <practice priority="high">Validate external data at runtime</practice>
  <practice priority="medium">Leverage type inference</practice>
  <practice priority="medium">Use const assertions where appropriate</practice>
  <practice priority="medium">Implement exhaustiveness checking</practice>
  <practice priority="low">Document complex types</practice>
</best-practices>

## Activation Triggers

<activation>
  <triggers>
    <keyword>type safety</keyword>
    <keyword>strict mode</keyword>
    <keyword>null safety</keyword>
    <keyword>type guards</keyword>
    <keyword>TypeScript</keyword>
    <keyword>type checking</keyword>
    <keyword>type inference</keyword>
    <keyword>generic constraints</keyword>
    <keyword>exhaustiveness</keyword>
    <keyword>runtime validation</keyword>
    <keyword>type assertion</keyword>
    <keyword>non-null assertion</keyword>
  </triggers>

  <scenarios>
    <scenario>Implementing new TypeScript features or modules</scenario>
    <scenario>Reviewing code for type safety issues</scenario>
    <scenario>Debugging type-related compilation errors</scenario>
    <scenario>Migrating from loose typing to strict mode</scenario>
    <scenario>Implementing runtime validation at API boundaries</scenario>
    <scenario>Creating type guards for unknown data</scenario>
    <scenario>Setting up discriminated unions</scenario>
    <scenario>Adding exhaustiveness checking to switch statements</scenario>
  </scenarios>
</activation>
