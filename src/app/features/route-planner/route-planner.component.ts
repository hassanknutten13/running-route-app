import { Component, EventEmitter, Input, OnDestroy, Output, inject } from '@angular/core';
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
export class RoutePlannerComponent implements OnDestroy {
  @Input({ required: true }) start!: Coordinates;
  @Output() readonly routesGenerated = new EventEmitter<RouteOption[]>();
  @Output() readonly useCurrentPosition = new EventEmitter<void>();

  private readonly cooldownSeconds = 20;
  private cooldownTimerId: number | null = null;

  distanceKm = 5;
  preference: RoutePreference = 'loop';
  errorMessage = '';
  isGenerating = false;
  cooldownSecondsRemaining = 0;

  private readonly routeService = inject(RouteService);
  private readonly storageService = inject(StorageService);

  async generateRoute(): Promise<void> {
    if (this.isGenerating || this.cooldownSecondsRemaining > 0) {
      return;
    }

    const request: RouteRequest = {
      start: this.start,
      distanceKm: this.normalizedDistance,
      preference: this.preference,
    };

    this.storageService.saveLastRouteRequest(request);
    this.errorMessage = '';
    this.isGenerating = true;
    this.startCooldown();

    try {
      const routes = await this.routeService.generateRoutes(request);
      this.routesGenerated.emit(routes);
    } catch (error) {
      console.error('Route generation failed.', error);
      this.errorMessage = error instanceof Error ? error.message : 'Kunde inte generera rutt.';
    } finally {
      console.log('Route generation loading state cleared.');
      this.isGenerating = false;
    }
  }

  ngOnDestroy(): void {
    this.clearCooldownTimer();
  }

  updatePreference(preference: RoutePreference): void {
    this.preference = preference;
  }

  requestCurrentPosition(): void {
    this.useCurrentPosition.emit();
  }

  get normalizedDistance(): number {
    return Math.max(1, Math.min(60, Number(this.distanceKm) || 1));
  }

  get isGenerateDisabled(): boolean {
    return this.isGenerating || this.cooldownSecondsRemaining > 0;
  }

  get generateButtonText(): string {
    if (this.isGenerating) {
      return 'Genererar och jämför rutter...';
    }

    if (this.cooldownSecondsRemaining > 0) {
      return `Vänta ${this.cooldownSecondsRemaining} s`;
    }

    return 'Generera rutt';
  }

  private startCooldown(): void {
    this.clearCooldownTimer();
    this.cooldownSecondsRemaining = this.cooldownSeconds;

    this.cooldownTimerId = window.setInterval(() => {
      this.cooldownSecondsRemaining = Math.max(0, this.cooldownSecondsRemaining - 1);

      if (this.cooldownSecondsRemaining === 0) {
        this.clearCooldownTimer();
      }
    }, 1000);
  }

  private clearCooldownTimer(): void {
    if (this.cooldownTimerId === null) {
      return;
    }

    window.clearInterval(this.cooldownTimerId);
    this.cooldownTimerId = null;
  }
}
