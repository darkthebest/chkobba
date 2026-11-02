# Template Method Pattern

Defines the skeleton of an algorithm in a base class and lets subclasses override specific steps without changing the algorithm's overall structure. Reuses the invariant parts, parameterizes the variable parts.

Components:

- **Abstract base class** — owns the template method (the skeleton).
- **Template method** — public, *not* overridden by subclasses; orchestrates step order.
- **Primitive operations** — abstract methods subclasses *must* implement.
- **Hooks** — non-abstract methods with sensible defaults; subclasses *may* override.

## When To Use

- Multiple implementations share a workflow but differ in a few steps.
- The invariant order of operations is a property of the algorithm and must not be reorderable.
- New variants only need to fill the same few hook points (3+).
- Need to enforce a "framework calls you" inversion of control.

## When NOT To Use

- No common structure — use **Strategy** instead.
- Algorithm needs to be swapped at runtime — use **Strategy**.
- Too much variation between subclasses — composition (Strategy) scales better than inheritance.
- Only one concrete implementation — YAGNI.
- Want to change the order itself — template method's skeleton is rigid by design.

## Disambiguation

- **vs Strategy** — template method varies *steps* via inheritance; strategy varies the *whole* algorithm via composition. Pick strategy if you'll need runtime swap or many variants.
- **vs Factory Method** — factory method is a *specific application* of template method that creates an object as one of its steps.

## Use Cases

| Scenario              | Invariant Skeleton                                       | Variable Steps                          |
|-----------------------|----------------------------------------------------------|------------------------------------------|
| Base node processor   | beforeProcess → validate → execute → afterProcess → onError | `validate`, `execute`               |
| Integration sync      | connect → fetch → transform → batch → send → disconnect  | `transform`, `send`                      |
| Report generator      | fetch → transform → calculate → format → deliver         | `fetchData`, `format`                    |
| HTTP request handler  | parse → authenticate → authorize → handle → respond      | `handle`                                 |

Example structure for "base node processor":

```
process()  // template method, final
  ├─ beforeProcess()        // hook: default no-op
  ├─ validate()             // primitive: subclass MUST implement
  ├─ execute()              // primitive: subclass MUST implement
  ├─ afterProcess()         // hook: default no-op
  ├─ getNextNode()          // hook: default = first connection
  └─ onError(err)           // hook: default = log
```

## Code Example

```typescript
// design-patterns/template-method - Vanilla TypeScript Example
// Template Method Pattern - Vanilla TypeScript Example
// Pure TypeScript classes, no DI framework, no decorators

// --- Abstract Base Class (Template) ---

export interface ReportOutput {
  title: string;
  generatedAt: Date;
  sections: ReportSection[];
  summary: string;
}

export interface ReportSection {
  heading: string;
  content: string;
}

export abstract class BaseReportGenerator {
  /** Template method - defines report generation workflow */
  generate(): ReportOutput {
    const rawData = this.fetchData();
    const transformed = this.transformData(rawData);
    const sections = this.buildSections(transformed);
    const summary = this.summarize(transformed);
    const title = this.getTitle();

    this.afterGenerate(sections.length);

    return {
      title,
      generatedAt: new Date(),
      sections,
      summary,
    };
  }

  /** Primitive - MUST implement: get report title */
  protected abstract getTitle(): string;

  /** Primitive - MUST implement: fetch raw data */
  protected abstract fetchData(): any[];

  /** Primitive - MUST implement: transform raw data */
  protected abstract transformData(data: any[]): any[];

  /** Primitive - MUST implement: build report sections */
  protected abstract buildSections(data: any[]): ReportSection[];

  /** Hook - override for custom summary (default: record count) */
  protected summarize(data: any[]): string {
    return `Total records: ${data.length}`;
  }

  /** Hook - override for post-generation actions */
  protected afterGenerate(sectionCount: number): void {}
}

// --- Concrete Implementations ---

export class SalesReport extends BaseReportGenerator {
  private sales: { product: string; amount: number; date: string }[];

  constructor(sales: { product: string; amount: number; date: string }[]) {
    super();
    this.sales = sales;
  }

  protected getTitle(): string {
    return 'Monthly Sales Report';
  }

  protected fetchData(): any[] {
    return this.sales;
  }

  protected transformData(data: any[]): any[] {
    // Group by product
    const grouped = new Map<string, number>();
    for (const sale of data) {
      grouped.set(sale.product, (grouped.get(sale.product) || 0) + sale.amount);
    }
    return Array.from(grouped.entries()).map(([product, total]) => ({ product, total }));
  }

  protected buildSections(data: any[]): ReportSection[] {
    return data.map((item) => ({
      heading: item.product,
      content: `Total sales: $${item.total.toFixed(2)}`,
    }));
  }

  protected summarize(data: any[]): string {
    const grandTotal = data.reduce((sum, item) => sum + item.total, 0);
    return `${data.length} products, Grand total: $${grandTotal.toFixed(2)}`;
  }
}

export class UserActivityReport extends BaseReportGenerator {
  private activities: { user: string; action: string; count: number }[];
  public postActions: string[] = [];

  constructor(activities: { user: string; action: string; count: number }[]) {
    super();
    this.activities = activities;
  }

  protected getTitle(): string {
    return 'User Activity Report';
  }

  protected fetchData(): any[] {
    return this.activities;
  }

  protected transformData(data: any[]): any[] {
    // Group by user
    const grouped = new Map<string, { actions: string[]; totalCount: number }>();
    for (const activity of data) {
      const existing = grouped.get(activity.user) || { actions: [], totalCount: 0 };
      existing.actions.push(activity.action);
      existing.totalCount += activity.count;
      grouped.set(activity.user, existing);
    }
    return Array.from(grouped.entries()).map(([user, info]) => ({
      user,
      ...info,
    }));
  }

  protected buildSections(data: any[]): ReportSection[] {
    return data.map((item) => ({
      heading: item.user,
      content: `Actions: ${item.actions.join(', ')} (Total: ${item.totalCount})`,
    }));
  }

  protected afterGenerate(sectionCount: number): void {
    this.postActions.push(`report_generated:${sectionCount}_sections`);
  }
}

// --- Tests ---

describe('SalesReport', () => {
  const sales = [
    { product: 'Widget', amount: 100, date: '2024-01-01' },
    { product: 'Widget', amount: 150, date: '2024-01-15' },
    { product: 'Gadget', amount: 200, date: '2024-01-10' },
  ];

  it('should generate a report with grouped sections', () => {
    const report = new SalesReport(sales).generate();
    expect(report.title).toBe('Monthly Sales Report');
    expect(report.sections).toHaveLength(2); // Widget, Gadget
  });

  it('should calculate correct totals per product', () => {
    const report = new SalesReport(sales).generate();
    const widgetSection = report.sections.find((s) => s.heading === 'Widget');
    expect(widgetSection?.content).toContain('$250.00');
  });

  it('should produce a grand total summary', () => {
    const report = new SalesReport(sales).generate();
    expect(report.summary).toContain('$450.00');
    expect(report.summary).toContain('2 products');
  });

  it('should include generation timestamp', () => {
    const report = new SalesReport(sales).generate();
    expect(report.generatedAt).toBeInstanceOf(Date);
  });
});

describe('UserActivityReport', () => {
  const activities = [
    { user: 'Alice', action: 'login', count: 5 },
    { user: 'Alice', action: 'purchase', count: 2 },
    { user: 'Bob', action: 'login', count: 3 },
  ];

  it('should group activities by user', () => {
    const report = new UserActivityReport(activities).generate();
    expect(report.sections).toHaveLength(2); // Alice, Bob
  });

  it('should call afterGenerate hook', () => {
    const generator = new UserActivityReport(activities);
    generator.generate();
    expect(generator.postActions).toContain('report_generated:2_sections');
  });

  it('should use default summarize when not overridden', () => {
    const report = new UserActivityReport(activities).generate();
    expect(report.summary).toContain('Total records: 2');
  });
});
```

## Implementation Steps

1. **Find the invariant.** What sequence is the same across all current and future variants?
2. **Build the abstract base.** Define the template method (public, calls steps in order) and the primitives (abstract).
3. **Add hooks where useful.** Optional override points with sensible defaults. Document each.
4. **Implement concrete subclasses.** Only the primitives are required; override hooks for custom behavior; call `super.hook()` to extend rather than replace.
5. **Clients call the template method**, never the steps individually.

## Best Practices

- **Mark the template method "final."** TypeScript has no `final`, so use convention (`// final`, JSDoc, or naming).
- **Distinguish kinds clearly.** Naming: `process` (template), `doValidate` (primitive abstract), `onBefore` (hook). Consistency helps readers.
- **Sensible hook defaults.** A hook with no default forces subclasses to implement; that's a primitive in disguise — promote it.
- **Document override expectations.** Explain when/why to override each hook.
- **Call `super` when extending hooks.** Keeps parent behavior; replace only when you mean to.

## Common Mistakes

- **Subclass overrides the template method** — defeats the whole point. Convention + code review must catch this.
- **Too many hooks** — base class becomes a god class. Keep hooks minimal; promote heavy variation to a strategy.
- **No defaults on hooks** — forces meaningless overrides in every subclass.
- **Business logic in the template** — the skeleton should only orchestrate. Move logic into primitives.
- **Forgetting `abstract` keyword** on primitives — subclasses silently inherit a no-op, bugs ensue.

## References

- [Refactoring Guru — Template Method](https://refactoring.guru/design-patterns/template-method)
- [TypeScript Example](https://refactoring.guru/design-patterns/template-method/typescript/example)
