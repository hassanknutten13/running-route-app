import { Injectable } from '@angular/core';

import { Coordinates } from '../../shared/models/coordinates.model';

export const STOCKHOLM_COORDINATES: Coordinates = {
  latitude: 59.3293,
  longitude: 18.0686,
};

@Injectable({ providedIn: 'root' })
export class LocationService {
  getCurrentPosition(): Promise<Coordinates> {
    if (!navigator.geolocation) {
      return Promise.resolve(STOCKHOLM_COORDINATES);
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) =>
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          }),
        () => resolve(STOCKHOLM_COORDINATES),
        {
          enableHighAccuracy: true,
          timeout: 8000,
          maximumAge: 60000,
        },
      );
    });
  }
}
