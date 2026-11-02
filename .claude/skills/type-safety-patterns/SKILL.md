---
name: type-safety-patterns
description: Expert in TypeScript strict mode configuration, null safety handling, custom type guards, and runtime validation with Zod schemas. Use when implementing type safety, configuring strict mode, handling null checks, creating type guards, or validating types at runtime.
category: utility
framework: [typescript]
---

# Type Safety Patterns Skill

<role>
TypeScript type safety expert specializing in strict mode configuration, type guards, null safety, and runtime validation patterns.
</role>

<expertise>
  <core-competencies>
    <competency name="strict-mode">TypeScript strict mode configuration and compiler flags</competency>
    <competency name="null-safety">Null/undefined handling with optional chaining and nullish coalescing</competency>
    <competency name="type-guards">Type narrowing with custom type guard functions</competency>
    <competency name="exhaustiveness">Exhaustiveness checking with discriminated unions</competency>
    <competency name="generics">Generic constraints and type inference optimization</competency>
    <competency name="runtime-validation">Runtime type validation with Zod schemas</competency>
  </core-competencies>

  <principles>
    <principle priority="critical">Enable strict mode always - no exceptions</principle>
    <principle priority="critical">Prefer unknown over any for truly unknown data</principle>
    <principle priority="high">Validate external data at runtime boundaries</principle>
    <principle priority="high">Handle null/undefined explicitly, never assume non-null</principle>
  </principles>
</expertise>

## Configuration

<strict-mode-flags>
  <flag name="strict" required="true">Master flag - enables all strict type checking options</flag>
  <flag name="noImplicitAny" required="true">Error on expressions with implied 'any' type</flag>
  <flag name="strictNullChecks" required="true">Null and undefined are not in every type</flag>
  <flag name="strictFunctionTypes" required="true">Check function parameter types contravariantly</flag>
  <flag name="noUnusedLocals" recommended="true">Report errors on unused local variables</flag>
</strict-mode-flags>

<tsconfig-example>
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noUnusedLocals": true
  }
}
```
</tsconfig-example>

## Null Safety Patterns

<category name="null-safety">
  <pattern name="optional-chaining">
    <description>Use ?. and ?? operators for concise null handling</description>
    <code language="typescript">
```typescript
// Safe with optional chaining
function getLength(str: string | null | undefined): number {
  return str?.length ?? 0;
}

// Property access
const name = user?.profile?.name ?? 'Anonymous';
```
    </code>
  </pattern>

  <pattern name="explicit-null-check">
    <description>Check for null before accessing properties</description>
    <code language="typescript">
```typescript
function processUser(user: User | null): void {
  if (user === null) {
    return;
  }
  console.log(user.name); // TypeScript knows user is User
}
```
    </code>
  </pattern>
</category>

## Type Guards

<category name="type-guards">
  <pattern name="primitive-type-guard">
    <description>Use typeof for primitive types</description>
    <code language="typescript">
```typescript
function isString(value: unknown): value is string {
  return typeof value === 'string';
}
```
    </code>
  </pattern>

  <pattern name="object-type-guard">
    <description>Check object structure and properties</description>
    <code language="typescript">
```typescript
function isUser(value: unknown): value is User {
  return typeof value === 'object' && value !== null && 'id' in value && 'email' in value;
}

if (isUser(data)) {
  console.log(data.email); // TypeScript knows data is User
}
```
    </code>
  </pattern>
</category>

## Discriminated Unions

<category name="discriminated-unions">
  <pattern name="tagged-union">
    <description>Use a discriminant field to distinguish between union members</description>
    <code language="typescript">
```typescript
type ApiResponse<T> =
  | { status: 'success'; data: T }
  | { status: 'error'; error: string }
  | { status: 'loading' };

function handleResponse<T>(response: ApiResponse<T>): void {
  switch (response.status) {
    case 'success':
      console.log(response.data);
      break;
    case 'error':
      console.error(response.error);
      break;
    case 'loading':
      console.log('Loading...');
      break;
  }
}
```
    </code>
  </pattern>

  <pattern name="exhaustiveness-check">
    <description>Use never type in default case to catch unhandled cases</description>
    <code language="typescript">
```typescript
type NodeType = 'email' | 'sms' | 'webhook';

function processNode(type: NodeType): string {
  switch (type) {
    case 'email': return 'Email';
    case 'sms': return 'SMS';
    case 'webhook': return 'Webhook';
    default:
      const exhaustiveCheck: never = type; // Error if new type added
      throw new Error(`Unhandled type: ${exhaustiveCheck}`);
  }
}
```
    </code>
  </pattern>
</category>

## Runtime Validation

<category name="runtime-validation">
  <pattern name="zod-schema">
    <description>Define schema, infer type, validate at runtime</description>
    <code language="typescript">
```typescript
import { z } from 'zod';

const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  age: z.number().int().positive().optional(),
});

type User = z.infer<typeof UserSchema>;

function parseUser(data: unknown): User {
  return UserSchema.parse(data); // Throws if invalid
}
```
    </code>
  </pattern>
</category>

## Anti-Patterns

<anti-patterns>
  <category name="non-null-assertion">
    <problem>The ! operator bypasses null checks</problem>
    <bad>
```typescript
const user = getUser()!; // Unsafe assertion
```
    </bad>
    <good>
```typescript
const user = getUser();
if (!user) throw new Error('User not found');
console.log(user.name);
```
    </good>
  </category>

  <category name="type-assertion">
    <problem>The as operator has no runtime check</problem>
    <bad>
```typescript
const user = data as User; // No runtime check
```
    </bad>
    <good>
```typescript
if (isUser(data)) {
  const user = data; // Safe with type guard
}
```
    </good>
  </category>
</anti-patterns>

## Best Practices

<best-practices>
  <practice priority="critical">Enable strict mode always</practice>
  <practice priority="critical">Use unknown instead of any</practice>
  <practice priority="high">Implement proper type guards</practice>
  <practice priority="high">Handle null/undefined explicitly</practice>
  <practice priority="high">Use discriminated unions for states</practice>
  <practice priority="high">Validate external data at runtime</practice>
</best-practices>

## Supplementary Reference

<resources>
  <file path="${CLAUDE_SKILL_DIR}/advanced-patterns.md">
    Advanced patterns including Option/Result types, Builder pattern, review checklists, and activation triggers.
  </file>
</resources>
