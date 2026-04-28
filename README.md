# RunningRouteApp

Running Route App är en första MVP-bas för att planera löprundor i webbläsaren.
Appen visar en Leaflet-karta, hämtar användarens position via browser geolocation
och faller tillbaka till Stockholm om positionen nekas eller misslyckas. Rutter kan
hämtas från OpenRouteService Directions API med profilen `foot-walking`.

I nuläget genereras tre mockade ruttförslag baserat på distans och preferens:

- Minst lutning
- Rundtur
- Snabbaste rutt
- Mest natur

Appen genererar upp till tre waypoint-kandidater runt startpunkten, hämtar
gångrutter från OpenRouteService och rankar kandidaterna mot vald preferens.
Den bästa rutten visas tydligt som rekommenderad, medan övriga alternativ visas
mer diskret.

Kartan är huvudytan i appen. Distans väljs med slider, preferens med segmenterade
knappar och ruttstatistik visar faktisk distans, uppskattad tid, höjdmeter och
preferens. Om ingen OpenRouteService API key är konfigurerad används en tydlig
mock fallback med testlinjer mellan koordinater.

## Installation

Installera dependencies:

```bash
npm install
```

Leaflet används för kartan och är installerat som dependency tillsammans med
TypeScript-typer.

## OpenRouteService API key

Skapa en HeiGIT Basic Key för OpenRouteService och lägg nyckeln i
environment-filen för lokal utveckling:

```ts
// src/environments/environment.development.ts
export const environment = {
  production: false,
  openRouteServiceApiKey: 'DIN_OPENROUTESERVICE_API_KEY',
};
```

För produktionsbyggen används:

```ts
// src/environments/environment.ts
export const environment = {
  production: true,
  openRouteServiceApiKey: 'DIN_OPENROUTESERVICE_API_KEY',
};
```

OpenRouteService-koordinater skickas som `[longitude, latitude]`. När geometry
läses tillbaka konverterar appen koordinaterna till Leaflets `[latitude, longitude]`
innan rutten ritas som polyline.

Appen gör flera Directions API-anrop per generering för att kunna jämföra
kandidatrutter. Om enskilda kandidater misslyckas används de andra som fungerar.

För lokal utveckling går OpenRouteService-anrop via Angular proxy för att undvika
CORS-problem i webbläsaren. `ng serve` använder `proxy.conf.json`, och appen
anropar `/ors/v2/directions/foot-walking/geojson`, som proxas vidare till:

```text
https://api.heigit.org/v2/directions/foot-walking/geojson
```

API-nyckeln skickas som `Authorization` header från `environment.openRouteServiceApiKey`,
inte som `api_key` query parameter.

Obs: environment-värden i en frontend-app byggs in i JavaScript-bundlen. Använd
restriktioner på API-nyckeln och flytta anrop via backend innan appen går skarpt.

## Kör lokalt

Starta utvecklingsservern:

```bash
ng serve
```

Öppna sedan:

```text
http://localhost:4200/
```

Du kan även använda npm-scriptet:

```bash
npm start
```

## Bygg

Kontrollera att TypeScript och Angular bygger:

```bash
npm run build
```

## Roadmap

- Firebase Auth
- Firestore
- GraphHopper som alternativ ruttmotor
- Elevation API eller annan gratis höjddata-källa för riktig lutningsranking
- Overpass API / OSM POI-data för riktig natur- och parkheuristik
- Ionic/Capacitor för iOS/Android
