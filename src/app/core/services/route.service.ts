import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';

import { environment } from '../../../environments/environment';
import { Coordinates } from '../../shared/models/coordinates.model';
import { RouteOption } from '../../shared/models/route-option.model';
import { RoutePreference, ROUTE_PREFERENCE_LABELS } from '../../shared/models/route-preference.model';
import { RouteRequest } from '../../shared/models/route-request.model';
import { ElevationService } from './elevation.service';

interface GenerateRoutesResponse {
  routes: RouteOption[];
}

@Injectable({ providedIn: 'root' })
export class RouteService {
  private readonly workerTimeoutMs = 15000;
  private readonly http = inject(HttpClient);
  private readonly elevationService = inject(ElevationService);

  async generateRoutes(request: RouteRequest): Promise<RouteOption[]> {
    console.log('Route generation started.', {
      start: request.start,
      distanceKm: request.distanceKm,
      preference: request.preference,
      workerUrl: environment.routeWorkerUrl,
    });

    if (!environment.routeWorkerUrl) {
      console.log('Cloudflare Worker URL missing. Using mock fallback routes.');
      return this.generateMockFallbackRoutes(request);
    }

    try {
      const response = await firstValueFrom(
        this.http
          .post<GenerateRoutesResponse>(`${environment.routeWorkerUrl}/generate-routes`, request)
          .pipe(timeout(this.workerTimeoutMs)),
      );

      console.log(
        'Routes from worker:',
        response.routes.map((route) => ({
          name: route.name,
          pathPoints: route.path?.length,
          first: route.path?.[0],
          last: route.path?.[route.path.length - 1],
        })),
      );

      return response.routes;
    } catch (error) {
      console.error('Cloudflare Worker route generation failed.', error);
      throw new Error(this.getWorkerErrorMessage(error));
    }
  }

  private getWorkerErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (typeof error.error?.message === 'string') {
        return error.error.message;
      }

      if (error.status === 401) return 'Worker saknar giltig ORS API-nyckel.';
      if (error.status === 403) return 'OpenRouteService nekade anropet. Kontrollera Worker-secret ORS_API_KEY.';
      if (error.status === 429) return 'API-gräns nådd. Vänta en minut och försök igen.';
    }

    if (error instanceof Error) return error.message;

    return 'Kunde inte generera rutt via Cloudflare Worker.';
  }

  private generateMockFallbackRoutes(request: RouteRequest): RouteOption[] {
    return this.generateRouteCandidates(request)
      .map((candidate, index) => {
        const distanceKm = this.adjustDistance(request.distanceKm, index);
        const elevation = this.elevationService.createMockSummary(distanceKm, request.preference, index);

        return {
          id: `route-${index + 1}`,
          name: candidate.name,
          distanceKm,
          estimatedTimeMinutes: Math.round(distanceKm * this.paceForVariant(index)),
          elevationMeters: elevation.gainMeters,
          preference: request.preference,
          recommended: index === 0,
          path: candidate.path,
          elevation,
        };
      })
      .slice(0, 3);
  }

  private generateRouteCandidates(request: RouteRequest): { name: string; path: Coordinates[] }[] {
    const candidateCount = 3;
    const baseBearing = this.preferenceBearingOffset(request.preference);

    return Array.from({ length: candidateCount }, (_, index) => {
      const directionDegrees = (baseBearing + index * (360 / candidateCount)) % 360;
      const distanceKm = this.adjustDistance(request.distanceKm, index);
      const outwardKm = Math.max(0.6, distanceKm * (0.27 + (index % 2) * 0.035));
      const spreadDegrees = request.preference === 'loop' ? 78 : 58 + (index % 3) * 10;
      const firstWaypoint = this.destinationPoint(request.start, outwardKm, directionDegrees - spreadDegrees / 2);
      const secondWaypoint = this.destinationPoint(request.start, outwardKm, directionDegrees + spreadDegrees / 2);

      return {
        name: this.createRouteName(request.preference, directionDegrees, index),
        path: [request.start, firstWaypoint, secondWaypoint, request.start],
      };
    });
  }

  private createRouteName(preference: RoutePreference, directionDegrees: number, index: number): string {
    const direction = this.directionLabel(directionDegrees);
    const variants = ['yttre sväng', 'balanserad loop', 'bred runda'];
    return `${ROUTE_PREFERENCE_LABELS[preference]} ${direction}, ${variants[index % variants.length]}`;
  }

  private adjustDistance(distanceKm: number, variant: number): number {
    const adjustment = [0, 0.35, -0.25][variant] ?? 0;
    return Math.max(1, Math.round((distanceKm + adjustment) * 10) / 10);
  }

  private paceForVariant(variant: number): number {
    return [6.1, 6.4, 6.8][variant] ?? 6.3;
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

  private directionLabel(directionDegrees: number): string {
    const labels = ['norrut', 'nordost', 'österut', 'sydost', 'söderut', 'sydväst', 'västerut', 'nordväst'];
    return labels[Math.round(directionDegrees / 45) % labels.length];
  }

  private preferenceBearingOffset(preference: RoutePreference): number {
    return {
      'least-elevation': 12,
      loop: 0,
      fastest: 24,
      nature: 42,
    }[preference];
  }

  private toRadians(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }

  private toDegrees(radians: number): number {
    return (radians * 180) / Math.PI;
  }
}
