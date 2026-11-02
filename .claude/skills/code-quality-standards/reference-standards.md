# Code Quality Standards - Reference Documentation

<purpose>
Supplementary reference containing SOLID principles, quality metrics, and anti-patterns documentation.
</purpose>

<relation-to-main>
This file contains detailed reference content extracted from SKILL.md. For naming conventions, code organization, and linting configuration, see the main SKILL.md.
</relation-to-main>

## SOLID Principles

<solid-principles>
  <description>
    All code should follow SOLID principles introduced by Robert C. Martin. These principles make code more maintainable, flexible, and testable.
  </description>

  <principle name="single-responsibility" abbreviation="SRP">
    <definition>A class should have one, and only one, reason to change.</definition>
    <description>Each class, module, or function should have only one job.</description>

    <violation-example>
```typescript
// Violation - Multiple responsibilities
class UserService {
  createUser(data: CreateUserDto) { /* ... */ }
  sendEmail(userId: number) { /* ... */ }
  generateReport(userId: number) { /* ... */ }
}
```
    </violation-example>

    <correct-example>
```typescript
// Correct - Single responsibility per service
class UserService {
  createUser(data: CreateUserDto) { /* ... */ }
}
class EmailService {
  sendEmail(userId: number) { /* ... */ }
}
class ReportService {
  generateReport(userId: number) { /* ... */ }
}
```
    </correct-example>

    <application-examples>
      <example>Processor classes: Each processor handles one type of operation</example>
      <example>Services: One service per domain entity</example>
      <example>Controllers: Each controller handles one resource</example>
    </application-examples>

  </principle>

  <principle name="open-closed" abbreviation="OCP">
    <definition>Software entities should be open for extension, but closed for modification.</definition>
    <description>You should be able to extend a class's behavior without modifying its existing code.</description>

    <violation-example>
```typescript
// Violation - Must modify class to add new behavior
class Processor {
  process(item: Item) {
    if (item.type === 'EMAIL') { /* email logic */ }
    else if (item.type === 'WEBHOOK') { /* webhook logic */ }
    // Must add new else-if for each new type
  }
}
```
    </violation-example>

    <correct-example>
```typescript
// Correct - Extend via new classes
interface Processor {
  process(item: Item): Promise<Result>;
}
class EmailProcessor implements Processor { /* ... */ }
class WebhookProcessor implements Processor { /* ... */ }
// New types just need new classes
```
    </correct-example>

    <application-examples>
      <example>Factory pattern for creating different processor types</example>
      <example>Strategy pattern for interchangeable algorithms</example>
      <example>Plugin architecture for extensibility</example>
    </application-examples>

  </principle>

  <principle name="liskov-substitution" abbreviation="LSP">
    <definition>Objects of a superclass should be replaceable with objects of subclasses without breaking the application.</definition>
    <description>Subtypes must be substitutable for their base types without altering program correctness.</description>

    <violation-example>
```typescript
// Violation - Subclass changes expected behavior
class Rectangle {
  setWidth(w: number) { this.width = w; }
  setHeight(h: number) { this.height = h; }
}
class Square extends Rectangle {
  setWidth(w: number) {
    this.width = w;
    this.height = w; // Breaks expectations
  }
}
```
    </violation-example>

    <correct-example>
```typescript
// Correct - Use composition or interfaces
interface Shape {
  getArea(): number;
}
class Rectangle implements Shape { /* ... */ }
class Square implements Shape { /* ... */ }
```
    </correct-example>

    <application-examples>
      <example>All processors implement the same interface consistently</example>
      <example>Storage adapters implement consistent interfaces</example>
      <example>Response DTOs extend base DTOs correctly</example>
    </application-examples>

  </principle>

  <principle name="interface-segregation" abbreviation="ISP">
    <definition>Clients should not be forced to depend on interfaces they do not use.</definition>
    <description>Many specific interfaces are better than one general-purpose interface.</description>

    <violation-example>
```typescript
// Violation - Fat interface
interface Worker {
  work(): void;
  eat(): void;
  sleep(): void;
  attendMeeting(): void;
}
```
    </violation-example>

    <correct-example>
```typescript
// Correct - Segregated interfaces
interface Workable { work(): void; }
interface Feedable { eat(): void; }
interface Restable { sleep(): void; }

class Developer implements Workable, Feedable, Restable { /* ... */ }
class Robot implements Workable { /* ... */ } // Doesn't need eat/sleep
```
    </correct-example>

    <application-examples>
      <example>Separate interfaces for read vs write operations</example>
      <example>Minimal interfaces for specific operations</example>
      <example>DTOs specific to operations (CreateDto, UpdateDto)</example>
    </application-examples>

  </principle>

  <principle name="dependency-inversion" abbreviation="DIP">
    <definition>High-level modules should not depend on low-level modules. Both should depend on abstractions.</definition>
    <description>Depend on interfaces, not concrete implementations.</description>

    <violation-example>
```typescript
// Violation - Direct dependency on concrete class
class OrderService {
  private emailService = new SendGridEmailService();

  processOrder(order: Order) {
    this.emailService.send(order.email, 'Order confirmed');
  }
}
```
    </violation-example>

    <correct-example>
```typescript
// Correct - Depend on abstraction
interface EmailService {
  send(to: string, message: string): Promise<void>;
}

class OrderService {
  constructor(private emailService: EmailService) {}

  processOrder(order: Order) {
    this.emailService.send(order.email, 'Order confirmed');
  }
}
```
    </correct-example>

    <application-examples>
      <example>Dependency injection throughout services</example>
      <example>Repository patterns with injected repositories</example>
      <example>Adapters injected via interfaces</example>
    </application-examples>

  </principle>

  <application-guidelines>
    <guideline-table>
| Principle | Question to Ask                                               | If Violated                     |
| --------- | ------------------------------------------------------------- | ------------------------------- |
| **SRP**   | Does this class/function have more than one reason to change? | Extract into separate classes   |
| **OCP**   | Will I need to modify this code to add new behavior?          | Use interfaces and polymorphism |
| **LSP**   | Can I substitute any subtype without issues?                  | Rethink inheritance hierarchy   |
| **ISP**   | Does the interface have methods clients don't need?           | Split into smaller interfaces   |
| **DIP**   | Does high-level code depend on low-level details?             | Introduce abstractions          |
    </guideline-table>
  </application-guidelines>

  <when-to-apply>
    <do>
      <situation>Building reusable components, services, or libraries</situation>
      <situation>Code will likely change or extend</situation>
    </do>
    <dont>
      <situation>Over-engineer simple CRUD operations</situation>
      <situation>Create unnecessary abstractions for code that won't change</situation>
    </dont>
    <balance>Simplicity vs. flexibility based on actual requirements</balance>
  </when-to-apply>
</solid-principles>

## Quality Metrics

<quality-metrics>
  <code-complexity>
    <metric name="cyclomatic-complexity" threshold="10" unit="per-function" operator="less-equal"/>
    <metric name="cognitive-complexity" threshold="15" unit="per-function" operator="less-equal"/>
    <metric name="function-length" threshold="20" unit="lines" operator="less-equal"/>
    <metric name="file-length" threshold="300" unit="lines" operator="less-equal"/>
  </code-complexity>

  <test-coverage>
    <metric name="statements" threshold="80" unit="percent" operator="greater-equal"/>
    <metric name="branches" threshold="80" unit="percent" operator="greater-equal"/>
    <metric name="functions" threshold="80" unit="percent" operator="greater-equal"/>
    <metric name="lines" threshold="80" unit="percent" operator="greater-equal"/>
  </test-coverage>

  <maintainability>
    <metric name="technical-debt-ratio" threshold="5" unit="percent" operator="less-equal"/>
    <metric name="code-duplication" threshold="3" unit="percent" operator="less-equal"/>
    <metric name="comment-density" min="10" max="20" unit="percent"/>
  </maintainability>
</quality-metrics>

## Anti-Patterns

<anti-patterns>
  <pattern name="magic-numbers">
    <problem>Hard-coded numeric values without explanation</problem>
    <bad>
if (user.age > 18) { } // What does 18 mean?
    </bad>
    <good>
const MINIMUM_AGE = 18;
if (user.age > MINIMUM_AGE) { }
    </good>
  </pattern>

  <pattern name="long-functions">
    <problem>Functions with too many responsibilities or lines</problem>
    <bad>
function processOrder() {
  // 100+ lines of code
}
    </bad>
    <good>
function processOrder() {
  validateOrder();
  calculateTotal();
  applyDiscount();
  submitPayment();
}
    </good>
  </pattern>

  <pattern name="god-objects">
    <problem>Classes that know or do too much</problem>
    <bad>
class Application {
  // Handles everything
}
    </bad>
    <good>
class UserService {}
class OrderService {}
class PaymentService {}
    </good>
  </pattern>
</anti-patterns>

## Best Practices Summary

<best-practices>
  <practice>Write self-documenting code</practice>
  <practice>Keep functions small and focused</practice>
  <practice>Follow SOLID principles (see above)</practice>
  <practice>Use meaningful names</practice>
  <practice>Avoid premature optimization</practice>
  <practice>Refactor regularly</practice>
  <practice>Delete dead code</practice>
  <practice>Maintain consistent style</practice>
  <practice>Write tests first (TDD)</practice>
  <practice>Review your own code first</practice>
</best-practices>
