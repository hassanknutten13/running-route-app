import { Coordinates } from './coordinates.model';
import { ElevationSummary } from './elevation-summary.model';
import { RoutePreference } from './route-preference.model';

export interface RouteOption {
  id: string;
  name: string;
  distanceKm: number;
  estimatedTimeMinutes: number;
  elevationMeters: number;
  preference: RoutePreference;
  recommended: boolean;
  path: Coordinates[];
  elevation: ElevationSummary;
}
