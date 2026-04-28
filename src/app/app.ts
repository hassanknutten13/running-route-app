import { Component, OnInit, inject } from '@angular/core';

import { LocationService, STOCKHOLM_COORDINATES } from './core/services/location.service';
import { MapComponent } from './features/map/map.component';
import { RoutePlannerComponent } from './features/route-planner/route-planner.component';
import { RouteSummaryComponent } from './features/route-summary/route-summary.component';
import { Coordinates } from './shared/models/coordinates.model';
import { RouteOption } from './shared/models/route-option.model';

@Component({
  selector: 'app-root',
  imports: [MapComponent, RoutePlannerComponent, RouteSummaryComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  currentPosition: Coordinates = STOCKHOLM_COORDINATES;
  routeOptions: RouteOption[] = [];
  selectedRoute: RouteOption | null = null;
  isLocating = true;

  private readonly locationService = inject(LocationService);

  async ngOnInit(): Promise<void> {
    this.currentPosition = await this.locationService.getCurrentPosition();
    this.isLocating = false;
  }

  handleRoutesGenerated(routes: RouteOption[]): void {
    this.routeOptions = routes;
    this.selectedRoute = routes.find((route) => route.recommended) ?? routes[0] ?? null;
  }

  selectRoute(route: RouteOption): void {
    this.selectedRoute = route;
  }
}
