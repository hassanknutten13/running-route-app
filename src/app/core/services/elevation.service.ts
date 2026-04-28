import { Injectable } from '@angular/core';

import { ElevationSummary } from '../../shared/models/elevation-summary.model';
import { RoutePreference } from '../../shared/models/route-preference.model';

@Injectable({ providedIn: 'root' })
export class ElevationService {
  createMockSummary(distanceKm: number, preference: RoutePreference, variant: number): ElevationSummary {
    const preferenceFactor: Record<RoutePreference, number> = {
      'least-elevation': 4.5,
      loop: 7,
      fastest: 6,
      nature: 8.5,
    };

    const gainMeters = Math.round(distanceKm * preferenceFactor[preference] + variant * 9);

    return {
      gainMeters,
      lossMeters: Math.max(4, Math.round(gainMeters * 0.82)),
      highestPointMeters: 25 + gainMeters + variant * 3,
    };
  }
}
