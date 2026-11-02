// Strategy Pattern - Angular Example
// Uses @Injectable() decorators, constructor injection, TestBed, and RxJS

import { Injectable } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';

// --- Strategy Interface ---

export interface SortStrategy<T> {
  sort(items: T[], key: keyof T): Observable<T[]>;
  name: string;
}

// --- Concrete Strategies ---

@Injectable({ providedIn: 'root' })
export class AlphabeticalSortStrategy implements SortStrategy<any> {
  name = 'alphabetical';

  sort<T>(items: T[], key: keyof T): Observable<T[]> {
    const sorted = [...items].sort((a, b) => {
      const valA = String(a[key]).toLowerCase();
      const valB = String(b[key]).toLowerCase();
      return valA.localeCompare(valB);
    });
    return of(sorted);
  }
}

@Injectable({ providedIn: 'root' })
export class DateSortStrategy implements SortStrategy<any> {
  name = 'date';

  sort<T>(items: T[], key: keyof T): Observable<T[]> {
    const sorted = [...items].sort((a, b) => {
      return new Date(b[key] as string).getTime() - new Date(a[key] as string).getTime();
    });
    return of(sorted);
  }
}

@Injectable({ providedIn: 'root' })
export class NumericSortStrategy implements SortStrategy<any> {
  name = 'numeric';

  sort<T>(items: T[], key: keyof T): Observable<T[]> {
    const sorted = [...items].sort((a, b) => {
      return Number(b[key]) - Number(a[key]);
    });
    return of(sorted);
  }
}

// --- Context Service ---

@Injectable({ providedIn: 'root' })
export class ListSorterService {
  private strategies: Map<string, SortStrategy<any>>;

  constructor(
    private alphabetical: AlphabeticalSortStrategy,
    private dateSorter: DateSortStrategy,
    private numeric: NumericSortStrategy,
  ) {
    this.strategies = new Map([
      ['alphabetical', this.alphabetical],
      ['date', this.dateSorter],
      ['numeric', this.numeric],
    ]);
  }

  sort<T>(items: T[], key: keyof T, strategyName: string): Observable<T[]> {
    const strategy = this.strategies.get(strategyName);
    if (!strategy) {
      throw new Error(`Unknown sort strategy: ${strategyName}`);
    }
    return strategy.sort(items, key);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this.strategies.keys());
  }
}

// --- Tests ---

interface TestItem {
  name: string;
  date: string;
  score: number;
}

describe('ListSorterService', () => {
  let service: ListSorterService;

  const items: TestItem[] = [
    { name: 'Charlie', date: '2024-03-01', score: 85 },
    { name: 'Alice', date: '2024-01-15', score: 92 },
    { name: 'Bob', date: '2024-02-10', score: 78 },
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ListSorterService, AlphabeticalSortStrategy, DateSortStrategy, NumericSortStrategy],
    });
    service = TestBed.inject(ListSorterService);
  });

  it('should sort alphabetically', (done) => {
    service.sort(items, 'name', 'alphabetical').subscribe((sorted) => {
      expect(sorted[0].name).toBe('Alice');
      expect(sorted[1].name).toBe('Bob');
      expect(sorted[2].name).toBe('Charlie');
      done();
    });
  });

  it('should sort by date (newest first)', (done) => {
    service.sort(items, 'date', 'date').subscribe((sorted) => {
      expect(sorted[0].name).toBe('Charlie');
      done();
    });
  });

  it('should sort numerically (highest first)', (done) => {
    service.sort(items, 'score', 'numeric').subscribe((sorted) => {
      expect(sorted[0].name).toBe('Alice');
      done();
    });
  });

  it('should throw for unknown strategy', () => {
    expect(() => service.sort(items, 'name', 'unknown')).toThrow();
  });

  it('should list available strategies', () => {
    expect(service.getAvailableStrategies()).toEqual(['alphabetical', 'date', 'numeric']);
  });
});
