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
