export type RoutePreference = 'least-elevation' | 'loop' | 'fastest' | 'nature';

export const ROUTE_PREFERENCE_LABELS: Record<RoutePreference, string> = {
  'least-elevation': 'Minst lutning',
  loop: 'Rundtur',
  fastest: 'Snabbaste rutt',
  nature: 'Mest natur',
};
