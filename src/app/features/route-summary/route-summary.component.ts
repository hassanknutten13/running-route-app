import { Component, EventEmitter, Input, Output } from '@angular/core';

import { RouteOption } from '../../shared/models/route-option.model';
import { ROUTE_PREFERENCE_LABELS } from '../../shared/models/route-preference.model';

@Component({
  selector: 'app-route-summary',
  templateUrl: './route-summary.component.html',
  styleUrl: './route-summary.component.css',
})
export class RouteSummaryComponent {
  @Input() routes: RouteOption[] = [];
  @Input() selectedRouteId: string | null = null;
  @Output() readonly routeSelected = new EventEmitter<RouteOption>();

  readonly preferenceLabels = ROUTE_PREFERENCE_LABELS;

  selectRoute(route: RouteOption): void {
    this.routeSelected.emit(route);
  }

  formatTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    if (hours === 0) {
      return `${mins} min`;
    }

    return `${hours} h ${mins.toString().padStart(2, '0')} min`;
  }
}
