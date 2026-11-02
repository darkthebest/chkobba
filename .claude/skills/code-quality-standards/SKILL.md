---
name: code-quality-standards
description: Expert in code quality standards, linting, formatting, best practices, code review criteria, and naming conventions. Use when reviewing code quality, enforcing coding standards, applying SOLID principles, establishing naming conventions, configuring linting rules, or assessing technical debt.
category: architecture
framework: [generic]
user-invocable: false
---

<!--
PLACEHOLDERS:
- apps/server/src: Source root directory
-->

# Code Quality Standards Skill

<role>
Code quality expert and standards enforcer. Evaluates code against established standards, identifies violations, provides corrective guidance, and ensures consistency across the codebase.
</role>

<expertise>
  <areas>
    <area>Linting rules and configuration</area>
    <area>Code formatting standards</area>
    <area>Naming conventions</area>
    <area>Code organization patterns</area>
    <area>SOLID principles application</area>
    <area>Design pattern recognition</area>
    <area>Code review execution</area>
    <area>Technical debt assessment</area>
  </areas>
</expertise>

<standards>
  <naming-conventions>
    <classes>
      <rule>PascalCase</rule>
      <example>class UserService {}</example>
    </classes>

    <interfaces>
      <rule>PascalCase with descriptive names</rule>
      <example>interface UserRepository {}</example>
    </interfaces>

    <functions>
      <rule>camelCase, verb-based</rule>
      <example>function getUserById(id: string): User {}</example>
    </functions>

    <constants>
      <rule>UPPER_SNAKE_CASE</rule>
      <example>const MAX_RETRY_COUNT = 3;</example>
    </constants>

    <private-members>
      <rule>prefix with underscore (optional)</rule>
      <example>private _internalState: State;</example>
    </private-members>

    <observables>
      <rule>suffix with $</rule>
      <example>readonly user$ = new BehaviorSubject&lt;User | null&gt;(null);</example>
    </observables>

  </naming-conventions>

  <code-organization>
    <class-structure>
      <order>
        <item priority="1">Static members</item>
        <item priority="2">Input/Output decorators</item>
        <item priority="3">Public properties</item>
        <item priority="4">Private properties</item>
        <item priority="5">Constructor</item>
        <item priority="6">Lifecycle hooks</item>
        <item priority="7">Public methods</item>
        <item priority="8">Private methods</item>
      </order>

      <example lang="typescript">

// Order: static, constructor, lifecycle, public, private
export class MyComponent {
// Static members
static readonly VERSION = '1.0.0';

// Input/Output
@Input() data!: Data;
@Output() changed = new EventEmitter&lt;void&gt;();

// Public properties
items = signal&lt;Item[]&gt;([]);

// Private properties
private destroy$ = new Subject&lt;void&gt;();

// Constructor
constructor(private service: Service) {}

// Lifecycle hooks
ngOnInit(): void {}
ngOnDestroy(): void {}

// Public methods
public handleClick(): void {}

// Private methods
private processData(): void {}
}
</example>
</class-structure>
</code-organization>

  <function-quality>
    <guidelines>
      <metric name="function-length" threshold="20" unit="lines" operator="less-than"/>
      <metric name="parameters" threshold="3" unit="count" operator="less-equal"/>
      <metric name="nesting-depth" threshold="3" unit="levels" operator="less-equal"/>
      <metric name="cyclomatic-complexity" threshold="10" unit="paths" operator="less-equal"/>
    </guidelines>

    <patterns>
      <good reason="Single responsibility, clear name, small">

function calculateTotalPrice(items: Item[]): number {
return items.reduce((sum, item) =&gt; sum + item.price, 0);
}
</good>

      <bad reason="Multiple responsibilities, unclear name, large">

function process(data: any): any {
// 100+ lines of mixed logic
}
</bad>
</patterns>
</function-quality>

  <error-handling>
    <principles>
      <principle>Use specific error types</principle>
      <principle>Provide helpful error messages</principle>
      <principle>Include context in error messages</principle>
      <principle>Name errors for identification</principle>
    </principles>

    <patterns>
      <good reason="Specific error types, helpful messages">

class ValidationError extends Error {
constructor(
public field: string,
message: string,
) {
super(`Validation failed for ${field}: ${message}`);
this.name = 'ValidationError';
}
}

function validateEmail(email: string): void {
if (!email.includes('@')) {
throw new ValidationError('email', 'Must contain @ symbol');
}
}
</good>

      <bad reason="Generic errors, vague messages">

function validate(data: any): void {
if (!data.email.includes('@')) {
throw new Error('Invalid');
}
}
</bad>
</patterns>
</error-handling>

  <comments>
    <principles>
      <principle>Explain why, not what</principle>
      <principle>Avoid stating the obvious</principle>
      <principle>Document complex algorithms</principle>
      <principle>Reference performance considerations</principle>
    </principles>

    <patterns>
      <good reason="Explains why, not what">

// Use binary search for O(log n) performance on large arrays
const index = binarySearch(sortedArray, target);
</good>

      <bad reason="States the obvious">

// Create a new array
const newArray = [];
</bad>
</patterns>
</comments>
</standards>

<linting-configuration>
  <eslint>
    <rule name="no-console" severity="warn" reason="Avoid console logs in production"/>
    <rule name="no-debugger" severity="error" reason="Remove debugger statements"/>
    <rule name="prefer-const" severity="error" reason="Use const for immutable values"/>
    <rule name="no-var" severity="error" reason="Use let/const instead of var"/>
    <rule name="@typescript-eslint/no-explicit-any" severity="warn" reason="Type safety"/>
    <rule name="@typescript-eslint/explicit-function-return-type" severity="warn" reason="Document return types"/>
  </eslint>

  <prettier>
    <option name="printWidth" value="100" reason="Reasonable line length"/>
    <option name="tabWidth" value="2" reason="Standard indentation"/>
    <option name="useTabs" value="false" reason="Spaces for consistency"/>
    <option name="semi" value="true" reason="Explicit statement termination"/>
    <option name="singleQuote" value="true" reason="Consistency"/>
    <option name="trailingComma" value="es5" reason="Cleaner diffs"/>
    <option name="bracketSpacing" value="true" reason="Readability"/>
  </prettier>
</linting-configuration>

<review-workflow>
  <checklist category="functionality">
    <check priority="critical">Code works as intended</check>
    <check priority="critical">Edge cases handled</check>
    <check priority="critical">Errors handled properly</check>
    <check priority="high">No breaking changes</check>
  </checklist>

  <checklist category="quality">
    <check priority="high">Clean, readable code</check>
    <check priority="high">Proper naming</check>
    <check priority="medium">No code duplication</check>
    <check priority="high">SOLID principles followed</check>
    <check priority="low">Comments where needed</check>
  </checklist>

  <checklist category="testing">
    <check priority="critical">Tests included</check>
    <check priority="critical">Tests pass</check>
    <check priority="high">Coverage maintained</check>
    <check priority="medium">Edge cases tested</check>
  </checklist>

  <checklist category="performance">
    <check priority="high">No performance regressions</check>
    <check priority="medium">Efficient algorithms</check>
    <check priority="high">Resource cleanup</check>
    <check priority="high">Memory leaks prevented</check>
  </checklist>

  <checklist category="security">
    <check priority="critical">Input validated</check>
    <check priority="critical">No secrets in code</check>
    <check priority="critical">Authentication checked</check>
    <check priority="critical">Authorization verified</check>
  </checklist>

  <checklist category="standards">
    <check priority="high">Linting passes</check>
    <check priority="medium">Formatting correct</check>
    <check priority="low">Import order correct</check>
    <check priority="medium">Project conventions followed</check>
  </checklist>
</review-workflow>

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

<anti-patterns>
  <pattern name="magic-numbers">
    <problem>Hard-coded numeric values without explanation</problem>
    <bad>
if (user.age &gt; 18) { } // What does 18 mean?
    </bad>
    <good>
const MINIMUM_AGE = 18;
if (user.age &gt; MINIMUM_AGE) { }
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

## Supplementary Reference

<resources>
  <file path="${CLAUDE_SKILL_DIR}/reference-standards.md">
    SOLID principles detailed guide, quality metrics, and anti-patterns reference.
  </file>
</resources>

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

<activation-triggers>
  <keywords>
    <keyword>code quality</keyword>
    <keyword>linting</keyword>
    <keyword>formatting</keyword>
    <keyword>best practices</keyword>
    <keyword>code review</keyword>
    <keyword>naming conventions</keyword>
    <keyword>standards</keyword>
    <keyword>SOLID</keyword>
    <keyword>clean code</keyword>
  </keywords>
</activation-triggers>
