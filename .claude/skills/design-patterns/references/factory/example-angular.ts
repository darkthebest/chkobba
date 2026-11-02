 // Factory Pattern - Angular Example
// Uses @Injectable() decorators, constructor injection, TestBed, and RxJS

import { Injectable } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';

// --- Common Interface ---

export interface DataExporter {
  export(data: any[]): Observable<ExportResult>;
  supports(format: string): boolean;
}

export interface ExportResult {
  content: Blob;
  filename: string;
  mimeType: string;
}

// --- Concrete Implementations ---

@Injectable({ providedIn: 'root' })
export class CsvExporter implements DataExporter {
  export(data: any[]): Observable<ExportResult> {
    const headers = Object.keys(data[0] || {}).join(',');
    const rows = data.map((row) => Object.values(row).join(','));
    const csv = [headers, ...rows].join('\n');

    return of({
      content: new Blob([csv], { type: 'text/csv' }),
      filename: `export-${Date.now()}.csv`,
      mimeType: 'text/csv',
    });
  }

  supports(format: string): boolean {
    return format === 'csv';
  }
}

@Injectable({ providedIn: 'root' })
export class JsonExporter implements DataExporter {
  export(data: any[]): Observable<ExportResult> {
    const json = JSON.stringify(data, null, 2);

    return of({
      content: new Blob([json], { type: 'application/json' }),
      filename: `export-${Date.now()}.json`,
      mimeType: 'application/json',
    });
  }

  supports(format: string): boolean {
    return format === 'json';
  }
}

// --- Factory Service ---

@Injectable({ providedIn: 'root' })
export class ExporterFactory {
  private exporters: DataExporter[];

  constructor(
    private csvExporter: CsvExporter,
    private jsonExporter: JsonExporter,
  ) {
    this.exporters = [this.csvExporter, this.jsonExporter];
  }

  getExporter(format: string): DataExporter {
    const exporter = this.exporters.find((e) => e.supports(format));
    if (!exporter) {
      throw new Error(`No exporter found for format: ${format}`);
    }
    return exporter;
  }

  getSupportedFormats(): string[] {
    return ['csv', 'json'];
  }
}

// --- Client Component Usage ---

@Injectable({ providedIn: 'root' })
export class ExportService {
  constructor(private factory: ExporterFactory) {}

  exportData(data: any[], format: string): Observable<ExportResult> {
    const exporter = this.factory.getExporter(format);
    return exporter.export(data);
  }
}

// --- Tests ---

describe('ExporterFactory', () => {
  let factory: ExporterFactory;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ExporterFactory, CsvExporter, JsonExporter],
    });
    factory = TestBed.inject(ExporterFactory);
  });

  it('should return CSV exporter for csv format', () => {
    const exporter = factory.getExporter('csv');
    expect(exporter).toBeInstanceOf(CsvExporter);
  });

  it('should return JSON exporter for json format', () => {
    const exporter = factory.getExporter('json');
    expect(exporter).toBeInstanceOf(JsonExporter);
  });

  it('should throw for unsupported format', () => {
    expect(() => factory.getExporter('xml')).toThrow();
  });

  it('should list supported formats', () => {
    expect(factory.getSupportedFormats()).toEqual(['csv', 'json']);
  });
});