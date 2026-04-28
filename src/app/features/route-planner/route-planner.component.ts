import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { RouteService } from '../../core/services/route.service';
import { StorageService } from '../../core/services/storage.service';
import { Coordinates } from '../../shared/models/coordinates.model';
import { RouteOption } from '../../shared/models/route-option.model';
import { RoutePreference } from '../../shared/models/route-preference.model';
import { RouteRequest } from '../../shared/models/route-request.model';
import { PreferenceSelectorComponent } from '../preference-selector/preference-selector.component';

@Component({
  selector: 'app-route-planner',
  imports: [FormsModule, PreferenceSelectorComponent],
  templateUrl: './route-planner.component.html',
  styleUrl: './route-planner.component.css',
})
export class RoutePlannerComponent {
  @Input({ required: true }) start!: Coordinates;
  @Output() readonly routesGenerated = new EventEmitter<RouteOption[]>();

  distanceKm = 5;
  preference: RoutePreference = 'loop';
  errorMessage = '';
  isGenerating = false;

  private readonly routeService = inject(RouteService);
  private readonly storageService = inject(StorageService);

  async generateRoute(): Promise<void> {
    const request: RouteRequest = {
      start: this.start,
      distanceKm: this.normalizedDistance,
      preference: this.preference,
    };

    this.storageService.saveLastRouteRequest(request);
    this.errorMessage = '';
    this.isGenerating = true;

    try {
      const routes = await this.routeService.generateRoutes(request);
      this.routesGenerated.emit(routes);
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Kunde inte generera rutt.';
    } finally {
      this.isGenerating = false;
    }
  }

  updatePreference(preference: RoutePreference): void {
    this.preference = preference;
  }

  get normalizedDistance(): number {
    return Math.max(1, Math.min(60, Number(this.distanceKm) || 1));
  }
}
