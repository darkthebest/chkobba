// Adapter Pattern - Angular Example
// Uses @Injectable() decorators, constructor injection, TestBed, and RxJS

import { Injectable, InjectionToken } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { map } from 'rxjs/operators';

// --- Target Interface ---

export interface MapProvider {
  geocode(address: string): Observable<GeoLocation>;
  reverseGeocode(lat: number, lng: number): Observable<string>;
}

export interface GeoLocation {
  lat: number;
  lng: number;
  formattedAddress: string;
}

export const MAP_PROVIDER = new InjectionToken<MapProvider>('MapProvider');

// --- Adaptees (Third-Party SDKs) ---

export class GoogleMapsSDK {
  findPlace(query: string): Observable<{ geometry: { lat: number; lng: number }; address: string }> {
    return of({ geometry: { lat: 40.7128, lng: -74.006 }, address: '350 5th Ave, NY' });
  }

  findAddress(lat: number, lng: number): Observable<{ formatted: string }> {
    return of({ formatted: '350 5th Ave, New York, NY 10118' });
  }
}

export class MapboxSDK {
  forwardGeocode(text: string): Observable<{ center: [number, number]; place_name: string }> {
    return of({ center: [-74.006, 40.7128], place_name: '350 5th Ave, NY' });
  }

  reverseGeocode(lng: number, lat: number): Observable<{ place_name: string }> {
    return of({ place_name: '350 5th Ave, New York, NY 10118' });
  }
}

// --- Adapters ---

@Injectable()
export class GoogleMapsAdapter implements MapProvider {
  constructor(private sdk: GoogleMapsSDK) {}

  geocode(address: string): Observable<GeoLocation> {
    return this.sdk.findPlace(address).pipe(
      map((result) => ({
        lat: result.geometry.lat,
        lng: result.geometry.lng,
        formattedAddress: result.address,
      })),
    );
  }

  reverseGeocode(lat: number, lng: number): Observable<string> {
    return this.sdk.findAddress(lat, lng).pipe(map((result) => result.formatted));
  }
}

@Injectable()
export class MapboxAdapter implements MapProvider {
  constructor(private sdk: MapboxSDK) {}

  geocode(address: string): Observable<GeoLocation> {
    return this.sdk.forwardGeocode(address).pipe(
      map((result) => ({
        lat: result.center[1],
        lng: result.center[0],
        formattedAddress: result.place_name,
      })),
    );
  }

  reverseGeocode(lat: number, lng: number): Observable<string> {
    return this.sdk.reverseGeocode(lng, lat).pipe(map((result) => result.place_name));
  }
}

// --- Client Service ---

@Injectable({ providedIn: 'root' })
export class LocationService {
  constructor(private mapProvider: MapProvider) {}

  findLocation(address: string): Observable<GeoLocation> {
    return this.mapProvider.geocode(address);
  }

  getAddress(lat: number, lng: number): Observable<string> {
    return this.mapProvider.reverseGeocode(lat, lng);
  }
}

// --- Tests ---

describe('GoogleMapsAdapter', () => {
  let adapter: GoogleMapsAdapter;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [GoogleMapsAdapter, GoogleMapsSDK],
    });
    adapter = TestBed.inject(GoogleMapsAdapter);
  });

  it('should adapt geocode to common interface', (done) => {
    adapter.geocode('350 5th Ave').subscribe((result) => {
      expect(result.lat).toBe(40.7128);
      expect(result.lng).toBe(-74.006);
      expect(result.formattedAddress).toBeDefined();
      done();
    });
  });

  it('should adapt reverse geocode', (done) => {
    adapter.reverseGeocode(40.7128, -74.006).subscribe((address) => {
      expect(typeof address).toBe('string');
      expect(address.length).toBeGreaterThan(0);
      done();
    });
  });
});

describe('MapboxAdapter', () => {
  let adapter: MapboxAdapter;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [MapboxAdapter, MapboxSDK],
    });
    adapter = TestBed.inject(MapboxAdapter);
  });

  it('should adapt Mapbox geocode (note: center is [lng, lat])', (done) => {
    adapter.geocode('350 5th Ave').subscribe((result) => {
      expect(result.lat).toBe(40.7128);
      expect(result.lng).toBe(-74.006);
      done();
    });
  });

  it('should adapt Mapbox reverse geocode', (done) => {
    adapter.reverseGeocode(40.7128, -74.006).subscribe((address) => {
      expect(typeof address).toBe('string');
      done();
    });
  });
});
