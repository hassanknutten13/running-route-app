import { Coordinates } from './coordinates.model';
import { RoutePreference } from './route-preference.model';

export interface RouteRequest {
  start: Coordinates;
  distanceKm: number;
  preference: RoutePreference;
}
