import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import * as L from 'leaflet';

import { Coordinates } from '../../shared/models/coordinates.model';
import { RouteOption } from '../../shared/models/route-option.model';

@Component({
  selector: 'app-map',
  templateUrl: './map.component.html',
  styleUrl: './map.component.css',
})
export class MapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) center!: Coordinates;
  @Input() route: RouteOption | null = null;
  @Output() readonly startSelected = new EventEmitter<Coordinates>();

  @ViewChild('mapContainer', { static: true }) private readonly mapContainer!: ElementRef<HTMLDivElement>;

  private map: L.Map | null = null;
  private routeLayer: L.Polyline | null = null;
  private startLayer: L.CircleMarker | null = null;

  ngAfterViewInit(): void {
    this.map = L.map(this.mapContainer.nativeElement, {
      center: this.toLatLng(this.center),
      zoom: 14,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(this.map);

    this.map.on('click', (event: L.LeafletMouseEvent) => {
      this.startSelected.emit({
        latitude: event.latlng.lat,
        longitude: event.latlng.lng,
      });
    });

    this.renderMapState();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['center'] || changes['route']) {
      this.renderMapState();
    }
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  private renderMapState(): void {
    if (!this.map) {
      return;
    }

    const center = this.toLatLng(this.center);
    this.map.setView(center, this.map.getZoom());
    this.renderStartMarker(center);
    this.renderRoute();
  }

  private renderStartMarker(center: L.LatLngExpression): void {
    if (!this.map) {
      return;
    }

    this.startLayer?.remove();
    this.startLayer = L.circleMarker(center, {
      color: '#183c2f',
      fillColor: '#b9e58f',
      fillOpacity: 1,
      radius: 8,
      weight: 3,
    }).addTo(this.map);
  }

  private renderRoute(): void {
    if (!this.map) {
      return;
    }

    this.routeLayer?.remove();

    if (!this.route) {
      return;
    }

    const latLngs = this.route.path.map((point) => this.toLatLng(point));

    this.routeLayer = L.polyline(latLngs, {
      color: '#e56f37',
      lineCap: 'round',
      lineJoin: 'round',
      opacity: 0.95,
      weight: 5,
    }).addTo(this.map);

    this.map.fitBounds(this.routeLayer.getBounds(), {
      padding: [28, 28],
      maxZoom: 15,
    });
  }

  private toLatLng(coordinates: Coordinates): L.LatLngExpression {
    return [coordinates.latitude, coordinates.longitude];
  }
}
