---
name: typescript-refactoring
description: Expert in TypeScript refactoring with emphasis on eliminating any types, discriminated unions, progressive strict mode migration, and advanced generic patterns. Use when refactoring TypeScript, eliminating any types, migrating to strict mode, improving type safety, or modernizing TypeScript code.
category: refactoring
framework: [typescript]
---

# TypeScript Refactoring Skill

<role>
TypeScript refactoring expert specializing in type safety, advanced patterns, and progressive enhancement from loose to strict typing.
</role>

<core-expertise>
  <capability area="type-system">Complete mastery of TypeScript's type system including primitives, literals, unions, intersections, and mapped types</capability>
  <capability area="generics">Expert in generic programming, constraints, variance, and type parameter inference</capability>
  <capability area="type-guards">Proficient in type narrowing, custom type guards, assertion functions, and discriminated unions</capability>
  <capability area="utility-types">Deep knowledge of built-in utility types and creating custom mapped/conditional types</capability>
  <capability area="strict-mode">Specialization in strict mode migration and enforcement</capability>
  <capability area="interface-design">Best practices for interface vs type aliases, extensibility, and composition</capability>
  <capability area="type-inference">Optimizing type inference to reduce explicit annotations while maintaining safety</capability>
</core-expertise>

<pattern-library>
  <pattern category="generics">
    <name>Generic Functions</name>
    <use-case>Type-safe reusable functions that work with multiple types</use-case>
    <example language="typescript">
```typescript
function identity<T>(value: T): T {
  return value;
}

function map<T, U>(array: T[], fn: (item: T) => U): U[] {
return array.map(fn);
}

````
    </example>
  </pattern>

  <pattern category="type-guards">
    <name>Type Guards & Assertions</name>
    <use-case>Runtime type checking and narrowing for type safety</use-case>
    <example language="typescript">
```typescript
function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function assertDefined<T>(value: T | undefined): asserts value is T {
  if (value === undefined) {
    throw new Error('Value is undefined');
  }
}
````

    </example>

  </pattern>

  <pattern category="utility-types">
    <name>Custom Utility Types</name>
    <use-case>Creating reusable type transformations with mapped types</use-case>
    <example language="typescript">
```typescript
type Partial<T> = {
  [P in keyof T]?: T[P];
};

type ReadOnly<T> = {
readonly [P in keyof T]: T[P];
};

type Pick<T, K extends keyof T> = {
[P in K]: T[P];
};

````
    </example>
  </pattern>

  <pattern category="discriminated-unions">
    <name>Discriminated Unions</name>
    <use-case>Type-safe handling of multiple variants with exhaustiveness checking</use-case>
    <example language="typescript">
```typescript
type Result<T, E> =
  | { success: true; value: T }
  | { success: false; error: E };

function handleResult<T, E>(result: Result<T, E>): void {
  if (result.success) {
    console.log(result.value); // Type: T
  } else {
    console.error(result.error); // Type: E
  }
}
````

    </example>

  </pattern>
</pattern-library>

<refactoring-strategies>
  <strategy name="eliminate-any" priority="high">
    <description>Replace 'any' types with specific types or 'unknown' for better type safety</description>
    <before-after>
```typescript
// Before
function process(data: any): any {
  return data.value;
}

// After
interface Data {
value: string;
}

function process(data: Data): string {
return data.value;
}

````
    </before-after>
    <benefits>
      <benefit>Catches errors at compile time</benefit>
      <benefit>Enables IDE autocomplete</benefit>
      <benefit>Self-documenting code</benefit>
    </benefits>
  </strategy>

  <strategy name="discriminated-unions" priority="high">
    <description>Convert loose unions with optional fields into discriminated unions for exhaustive type checking</description>
    <before-after>
```typescript
// Before
interface Node {
  type: string;
  value?: string;
  children?: Node[];
}

// After
type Node =
  | { type: 'text'; value: string }
  | { type: 'container'; children: Node[] };
````

    </before-after>
    <benefits>
      <benefit>Exhaustive pattern matching</benefit>
      <benefit>Eliminates undefined checks</benefit>
      <benefit>Better IntelliSense support</benefit>
    </benefits>

  </strategy>

  <strategy name="strict-mode-migration" priority="medium">
    <description>Gradually enable TypeScript strict mode flags to catch more errors</description>
    <migration-path>
      <step order="1">Enable noImplicitAny</step>
      <step order="2">Enable strictNullChecks</step>
      <step order="3">Enable strictFunctionTypes</step>
      <step order="4">Enable strictBindCallApply</step>
      <step order="5">Enable strictPropertyInitialization</step>
      <step order="6">Enable noImplicitThis</step>
      <step order="7">Enable alwaysStrict</step>
    </migration-path>
    <configuration language="json">
```typescript
// Enable strict mode in tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true
  }
}
```
    </configuration>
  </strategy>
</refactoring-strategies>

<best-practices>
  <rule priority="critical">Use strict mode always - catches errors early and enforces best practices</rule>
  <rule priority="critical">Avoid 'any' type - use 'unknown' instead and narrow with type guards</rule>
  <rule priority="high">Prefer interfaces for objects - better extensibility and error messages</rule>
  <rule priority="high">Use type aliases for unions - clearer intent and better semantics</rule>
  <rule priority="medium">Leverage type inference - reduce noise while maintaining safety</rule>
  <rule priority="medium">Use const assertions - for literal types and readonly arrays/objects</rule>
  <rule priority="medium">Implement proper type guards - enable safe type narrowing</rule>
  <rule priority="low">Document complex types - add JSDoc comments for clarity</rule>
</best-practices>

<decision-framework>
  <decision question="Interface vs Type Alias?">
    <option choice="interface">
      <when>Defining object shapes</when>
      <when>Need declaration merging</when>
      <when>Want extends/implements syntax</when>
      <when>Better error messages desired</when>
    </option>
    <option choice="type">
      <when>Defining unions or intersections</when>
      <when>Need mapped or conditional types</when>
      <when>Creating utility types</when>
      <when>Aliasing primitives or tuples</when>
    </option>
  </decision>

  <decision question="Type Guard vs Type Assertion?">
    <option choice="type-guard">
      <when>Runtime validation needed</when>
      <when>Value could be multiple types</when>
      <when>Need to narrow in if/else blocks</when>
      <when>Working with unknown/any</when>
    </option>
    <option choice="assertion">
      <when>You know the type for certain</when>
      <when>After validation elsewhere</when>
      <when>Working with DOM APIs</when>
      <warning>Use sparingly - bypasses type system</warning>
    </option>
  </decision>

  <decision question="Generic Constraints?">
    <guideline>Add constraints when you need specific properties/methods on the generic type</guideline>
    <example language="typescript">
```typescript
// Without constraint - can't access .length
function logLength<T>(value: T): void {
  console.log(value.length); // Error
}

// With constraint - safe to access .length
function logLength<T extends { length: number }>(value: T): void {
console.log(value.length); // OK
}

```
    </example>
  </decision>
</decision-framework>

<activation-triggers>
  <trigger>TypeScript</trigger>
  <trigger>types</trigger>
  <trigger>interfaces</trigger>
  <trigger>generics</trigger>
  <trigger>type safety</trigger>
  <trigger>strict mode</trigger>
  <trigger>refactoring</trigger>
  <trigger>type guards</trigger>
  <trigger>utility types</trigger>
  <trigger>type narrowing</trigger>
  <trigger>discriminated unions</trigger>
  <trigger>type inference</trigger>
</activation-triggers>
```
