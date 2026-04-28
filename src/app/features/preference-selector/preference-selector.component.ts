import { Component, EventEmitter, Input, Output } from '@angular/core';

import {
  ROUTE_PREFERENCE_LABELS,
  RoutePreference,
} from '../../shared/models/route-preference.model';

@Component({
  selector: 'app-preference-selector',
  templateUrl: './preference-selector.component.html',
  styleUrl: './preference-selector.component.css',
})
export class PreferenceSelectorComponent {
  @Input({ required: true }) selected!: RoutePreference;
  @Output() readonly selectedChange = new EventEmitter<RoutePreference>();

  readonly preferences: RoutePreference[] = ['least-elevation', 'loop', 'fastest', 'nature'];
  readonly labels = ROUTE_PREFERENCE_LABELS;

  selectPreference(preference: RoutePreference): void {
    this.selectedChange.emit(preference);
  }
}
