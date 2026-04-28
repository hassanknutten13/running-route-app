import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment.local';
import { Coordinates } from '../../shared/models/coordinates.model';
import { RouteOption } from '../../shared/models/route-option.model';
import { RoutePreference, ROUTE_PREFERENCE_LABELS } from '../../shared/models/route-preference.model';
import { RouteRequest } from '../../shared/models/route-request.model';
import { ElevationService } from './elevation.service';

interface OpenRouteServiceFeatureCollection {
  features: OpenRouteServiceFeature[];
}

interface OpenRouteServiceFeature {
  geometry: {
    coordinates: [number, number][];
  };
  properties?: {
    summary?: {
      distance?: number;
      duration?: number;
    };
  };
}

interface RouteCandidate {
  id: string;
  name: string;
  directionDegrees: number;
  targetDistanceKm: number;
  waypoints: Coordinates[];
}

interface ScoredRoute {
  option: RouteOption;
  score: number;
  directionDegrees: number;
  center: Coordinates;
}

@Injectable({ providedIn: 'root' })
export class RouteService {
  private readonly http = inject(HttpClient);
  private readonly elevationService = inject(ElevationService);

  async generateRoutes(request: RouteRequest): Promise<RouteOption[]> {
    if (!environment.openRouteServiceApiKey) {
      return this.generateMockFallbackRoutes(request);
    }

    const candidates = this.generateRouteCandidates(request);
    const settledRoutes = await Promise.all(
      candidates.map(async (candidate, index) => {
        try {
          const feature = await this.fetchWalkingRoute(candidate.waypoints);
          return this.createScoredRoute(request, candidate, feature, index);
        } catch (error) {
          console.warn(`OpenRouteService candidate ${candidate.id} failed.`, error);
          return null;
        }
      }),
    );

    const scoredRoutes = settledRoutes.filter((route): route is ScoredRoute => route !== null);

    if (scoredRoutes.length === 0) {
      throw new Error('Kunde inte hämta några rutter från OpenRouteService. Kontrollera API-nyckeln och försök igen.');
    }

    return this.pickDiverseTopRoutes(scoredRoutes).map((route, index) => ({
      ...route.option,
      id: `route-${index + 1}`,
      recommended: index === 0,
    }));
  }

  private async fetchWalkingRoute(waypoints: Coordinates[]): Promise<OpenRouteServiceFeature> {
    const response = await firstValueFrom(
      this.http.post<OpenRouteServiceFeatureCollection>(
        'https://api.openrouteservice.org/v2/directions/foot-walking/geojson',
        {
          coordinates: waypoints.map((point) => this.toOpenRouteServiceCoordinate(point)),
        },
        {
          headers: {
            Authorization: environment.openRouteServiceApiKey,
            'Content-Type': 'application/json',
          },
        },
      ),
    );

    const feature = response.features[0];

    if (!feature?.geometry.coordinates.length) {
      throw new Error('OpenRouteService returned no route geometry.');
    }

    return feature;
  }

  private generateRouteCandidates(request: RouteRequest): RouteCandidate[] {
    const candidateCount = 10;
    const baseBearing = this.preferenceBearingOffset(request.preference);

    return Array.from({ length: candidateCount }, (_, index) => {
      const directionDegrees = (baseBearing + index * (360 / candidateCount)) % 360;
      const spreadDegrees = request.preference === 'loop' ? 78 : 58 + (index % 3) * 10;
      const targetDistanceKm = this.adjustDistance(request.distanceKm, index);
      const outwardKm = Math.max(0.6, targetDistanceKm * (0.27 + (index % 2) * 0.035));
      const firstWaypoint = this.destinationPoint(request.start, outwardKm, directionDegrees - spreadDegrees / 2);
      const secondWaypoint = this.destinationPoint(request.start, outwardKm, directionDegrees + spreadDegrees / 2);

      return {
        id: `candidate-${index + 1}`,
        name: this.createRouteName(request.preference, directionDegrees, index),
        directionDegrees,
        targetDistanceKm,
        waypoints: [request.start, firstWaypoint, secondWaypoint, request.start],
      };
    });
  }

  private createScoredRoute(
    request: RouteRequest,
    candidate: RouteCandidate,
    feature: OpenRouteServiceFeature,
    index: number,
  ): ScoredRoute {
    const path = this.toLeafletCoordinates(feature.geometry.coordinates);
    const distanceKm = this.getRouteDistanceKm(feature, candidate.targetDistanceKm);
    const estimatedTimeMinutes = this.getRouteDurationMinutes(feature, distanceKm, index);
    const elevationMeters = this.estimateElevationGain(path, distanceKm, candidate.directionDegrees);
    const elevation = {
      gainMeters: elevationMeters,
      lossMeters: Math.max(4, Math.round(elevationMeters * 0.82)),
      highestPointMeters: 25 + elevationMeters,
    };
    const center = this.calculateRouteCenter(path);

    return {
      option: {
        id: candidate.id,
        name: candidate.name,
        distanceKm,
        estimatedTimeMinutes,
        elevationMeters,
        preference: request.preference,
        recommended: false,
        path,
        elevation,
      },
      score: this.calculateScore({
        preference: request.preference,
        requestedDistanceKm: request.distanceKm,
        actualDistanceKm: distanceKm,
        durationMinutes: estimatedTimeMinutes,
        elevationMeters,
        natureScore: this.estimateNatureScore(path, candidate.directionDegrees),
        routePath: path,
      }),
      directionDegrees: candidate.directionDegrees,
      center,
    };
  }

  private calculateScore(input: {
    preference: RoutePreference;
    requestedDistanceKm: number;
    actualDistanceKm: number;
    durationMinutes: number;
    elevationMeters: number;
    natureScore: number;
    routePath: Coordinates[];
  }): number {
    const distancePenalty = this.calculateDistancePenalty(input.requestedDistanceKm, input.actualDistanceKm);
    const loopBonus = this.calculateLoopScore(input.routePath) * 16;
    const preferenceScore = this.calculatePreferenceScore(input);

    return preferenceScore + loopBonus - distancePenalty;
  }

  private calculatePreferenceScore(input: {
    preference: RoutePreference;
    requestedDistanceKm: number;
    actualDistanceKm: number;
    durationMinutes: number;
    elevationMeters: number;
    natureScore: number;
    routePath: Coordinates[];
  }): number {
    switch (input.preference) {
      case 'least-elevation':
        return 90 - input.elevationMeters * 1.25;
      case 'loop':
        return this.calculateLoopScore(input.routePath) * 75;
      case 'fastest':
        return 95 - input.durationMinutes * 1.15;
      case 'nature':
        return input.natureScore * 90;
    }
  }

  private calculateDistancePenalty(requestedDistanceKm: number, actualDistanceKm: number): number {
    const absoluteDeltaKm = Math.abs(requestedDistanceKm - actualDistanceKm);
    const relativeDelta = absoluteDeltaKm / Math.max(requestedDistanceKm, 1);
    return absoluteDeltaKm * 8 + relativeDelta * 70;
  }

  private calculateLoopScore(path: Coordinates[]): number {
    if (path.length < 4) {
      return 0;
    }

    const start = path[0];
    const end = path[path.length - 1];
    const startEndDistanceKm = this.distanceBetweenKm(start, end);
    const bounds = this.calculateBounds(path);
    const areaScore = Math.min(1, Math.max(0, bounds.widthKm * bounds.heightKm * 2.8));
    const closesLoopScore = Math.max(0, 1 - startEndDistanceKm / 0.18);

    return closesLoopScore * 0.62 + areaScore * 0.38;
  }

  private calculateDiversity(route: ScoredRoute, selectedRoutes: ScoredRoute[]): number {
    if (selectedRoutes.length === 0) {
      return 1;
    }

    const similarities = selectedRoutes.map((selectedRoute) => {
      const directionDelta = this.angleDifference(route.directionDegrees, selectedRoute.directionDegrees);
      const centerDistanceKm = this.distanceBetweenKm(route.center, selectedRoute.center);
      return directionDelta / 180 + Math.min(centerDistanceKm / 1.2, 1);
    });

    return Math.min(...similarities);
  }

  private pickDiverseTopRoutes(routes: ScoredRoute[]): ScoredRoute[] {
    const rankedRoutes = [...routes].sort((a, b) => b.score - a.score);
    const selectedRoutes: ScoredRoute[] = [];

    for (const route of rankedRoutes) {
      if (selectedRoutes.length === 0 || this.calculateDiversity(route, selectedRoutes) >= 0.38) {
        selectedRoutes.push(route);
      }

      if (selectedRoutes.length === 3) {
        return selectedRoutes;
      }
    }

    for (const route of rankedRoutes) {
      if (!selectedRoutes.includes(route)) {
        selectedRoutes.push(route);
      }

      if (selectedRoutes.length === 3) {
        return selectedRoutes;
      }
    }

    return selectedRoutes;
  }

  private estimateElevationGain(path: Coordinates[], distanceKm: number, directionDegrees: number): number {
    const directionFactor = 0.75 + Math.abs(Math.sin(this.toRadians(directionDegrees * 1.7))) * 0.7;
    const shapeFactor = Math.min(1.45, Math.max(0.85, this.calculateBounds(path).heightKm + 0.75));
    return Math.round(distanceKm * 5.4 * directionFactor * shapeFactor);
  }

  private estimateNatureScore(path: Coordinates[], directionDegrees: number): number {
    const bounds = this.calculateBounds(path);
    const shapeScore = Math.min(1, (bounds.widthKm + bounds.heightKm) / 2.8);
    const directionScore = (Math.sin(this.toRadians(directionDegrees - 35)) + 1) / 2;

    // TODO: Koppla mot gratis Overpass API / OSM POI-data för parker, skog och vatten.
    // Tills vidare används en deterministisk heuristik så "Mest natur" påverkar ranking utan betald tjänst.
    return Math.min(1, shapeScore * 0.55 + directionScore * 0.45);
  }

  private generateMockFallbackRoutes(request: RouteRequest): RouteOption[] {
    const scoredRoutes = this.generateRouteCandidates(request).map((candidate, index) => {
      const path = this.createMockTestLinePath(candidate.waypoints);
      const distanceKm = candidate.targetDistanceKm;
      const estimatedTimeMinutes = Math.round(distanceKm * this.paceForVariant(index));
      const elevationMeters = this.estimateElevationGain(path, distanceKm, candidate.directionDegrees);
      const elevation = this.elevationService.createMockSummary(distanceKm, request.preference, index);

      return {
        option: {
          id: candidate.id,
          name: candidate.name,
          distanceKm,
          estimatedTimeMinutes,
          elevationMeters,
          preference: request.preference,
          recommended: false,
          path,
          elevation: {
            ...elevation,
            gainMeters: elevationMeters,
          },
        },
        score: this.calculateScore({
          preference: request.preference,
          requestedDistanceKm: request.distanceKm,
          actualDistanceKm: distanceKm,
          durationMinutes: estimatedTimeMinutes,
          elevationMeters,
          natureScore: this.estimateNatureScore(path, candidate.directionDegrees),
          routePath: path,
        }),
        directionDegrees: candidate.directionDegrees,
        center: this.calculateRouteCenter(path),
      };
    });

    return this.pickDiverseTopRoutes(scoredRoutes).map((route, index) => ({
      ...route.option,
      id: `route-${index + 1}`,
      recommended: index === 0,
    }));
  }

  private createRouteName(preference: RoutePreference, directionDegrees: number, index: number): string {
    const direction = this.directionLabel(directionDegrees);
    const variants = ['yttre sväng', 'balanserad loop', 'bred runda', 'kompakt loop'];
    return `${ROUTE_PREFERENCE_LABELS[preference]} ${direction}, ${variants[index % variants.length]}`;
  }

  private adjustDistance(distanceKm: number, variant: number): number {
    const adjustment = [0, 0.35, -0.25, 0.6, -0.45, 0.15, -0.1, 0.5, -0.35, 0.25][variant] ?? 0;
    return Math.max(1, Math.round((distanceKm + adjustment) * 10) / 10);
  }

  private paceForVariant(variant: number): number {
    return [6.1, 6.4, 6.8, 6.25, 6.55, 6.35, 6.75, 6.2, 6.6, 6.45][variant] ?? 6.3;
  }

  private getRouteDistanceKm(feature: OpenRouteServiceFeature, fallbackDistanceKm: number): number {
    const distanceMeters = feature.properties?.summary?.distance;

    if (!distanceMeters) {
      return fallbackDistanceKm;
    }

    return Math.round((distanceMeters / 1000) * 10) / 10;
  }

  private getRouteDurationMinutes(
    feature: OpenRouteServiceFeature,
    distanceKm: number,
    variant: number,
  ): number {
    const durationSeconds = feature.properties?.summary?.duration;

    if (!durationSeconds) {
      return Math.round(distanceKm * this.paceForVariant(variant));
    }

    return Math.max(1, Math.round(durationSeconds / 60));
  }

  private toOpenRouteServiceCoordinate(coordinates: Coordinates): [number, number] {
    return [coordinates.longitude, coordinates.latitude];
  }

  private toLeafletCoordinates(coordinates: [number, number][]): Coordinates[] {
    return coordinates.map(([longitude, latitude]) => ({
      latitude,
      longitude,
    }));
  }

  private destinationPoint(start: Coordinates, distanceKm: number, bearingDegrees: number): Coordinates {
    const earthRadiusKm = 6371;
    const angularDistance = distanceKm / earthRadiusKm;
    const bearing = this.toRadians(bearingDegrees);
    const startLatitude = this.toRadians(start.latitude);
    const startLongitude = this.toRadians(start.longitude);

    const latitude = Math.asin(
      Math.sin(startLatitude) * Math.cos(angularDistance) +
        Math.cos(startLatitude) * Math.sin(angularDistance) * Math.cos(bearing),
    );
    const longitude =
      startLongitude +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(startLatitude),
        Math.cos(angularDistance) - Math.sin(startLatitude) * Math.sin(latitude),
      );

    return {
      latitude: this.toDegrees(latitude),
      longitude: this.toDegrees(longitude),
    };
  }

  private distanceBetweenKm(first: Coordinates, second: Coordinates): number {
    const earthRadiusKm = 6371;
    const latitudeDelta = this.toRadians(second.latitude - first.latitude);
    const longitudeDelta = this.toRadians(second.longitude - first.longitude);
    const firstLatitude = this.toRadians(first.latitude);
    const secondLatitude = this.toRadians(second.latitude);
    const haversine =
      Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;

    return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  }

  private calculateRouteCenter(path: Coordinates[]): Coordinates {
    const totals = path.reduce(
      (sum, point) => ({
        latitude: sum.latitude + point.latitude,
        longitude: sum.longitude + point.longitude,
      }),
      { latitude: 0, longitude: 0 },
    );

    return {
      latitude: totals.latitude / path.length,
      longitude: totals.longitude / path.length,
    };
  }

  private calculateBounds(path: Coordinates[]): { widthKm: number; heightKm: number } {
    const latitudes = path.map((point) => point.latitude);
    const longitudes = path.map((point) => point.longitude);
    const minLatitude = Math.min(...latitudes);
    const maxLatitude = Math.max(...latitudes);
    const minLongitude = Math.min(...longitudes);
    const maxLongitude = Math.max(...longitudes);
    const middleLatitude = (minLatitude + maxLatitude) / 2;

    return {
      heightKm: this.distanceBetweenKm(
        { latitude: minLatitude, longitude: minLongitude },
        { latitude: maxLatitude, longitude: minLongitude },
      ),
      widthKm: this.distanceBetweenKm(
        { latitude: middleLatitude, longitude: minLongitude },
        { latitude: middleLatitude, longitude: maxLongitude },
      ),
    };
  }

  private directionLabel(directionDegrees: number): string {
    const labels = ['norrut', 'nordost', 'österut', 'sydost', 'söderut', 'sydväst', 'västerut', 'nordväst'];
    return labels[Math.round(directionDegrees / 45) % labels.length];
  }

  private preferenceBearingOffset(preference: RoutePreference): number {
    const offsets: Record<RoutePreference, number> = {
      'least-elevation': 12,
      loop: 0,
      fastest: 24,
      nature: 42,
    };

    return offsets[preference];
  }

  private angleDifference(firstDegrees: number, secondDegrees: number): number {
    const difference = Math.abs(firstDegrees - secondDegrees) % 360;
    return difference > 180 ? 360 - difference : difference;
  }

  private toRadians(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }

  private toDegrees(radians: number): number {
    return (radians * 180) / Math.PI;
  }

  private getRoutingErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      return `Kunde inte hämta rutt från OpenRouteService (${error.status}). Kontrollera API-nyckeln och försök igen.`;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return 'Kunde inte hämta rutt från OpenRouteService.';
  }

  // Mock fallback används bara när OpenRouteService API-nyckel saknas.
  // Den ritar testlinjer mellan kandidaters waypoints och följer inte vägar eller gångvägar.
  private createMockTestLinePath(waypoints: Coordinates[]): Coordinates[] {
    return waypoints;
  }
}
