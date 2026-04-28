import { Injectable } from '@angular/core';

import { RouteRequest } from '../../shared/models/route-request.model';

const LAST_ROUTE_REQUEST_KEY = 'running-route-app:last-route-request';

@Injectable({ providedIn: 'root' })
export class StorageService {
  saveLastRouteRequest(request: RouteRequest): void {
    localStorage.setItem(LAST_ROUTE_REQUEST_KEY, JSON.stringify(request));
  }

  getLastRouteRequest(): RouteRequest | null {
    const value = localStorage.getItem(LAST_ROUTE_REQUEST_KEY);

    if (!value) {
      return null;
    }

    try {
      return JSON.parse(value) as RouteRequest;
    } catch {
      localStorage.removeItem(LAST_ROUTE_REQUEST_KEY);
      return null;
    }
  }
}
