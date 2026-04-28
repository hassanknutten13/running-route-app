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

Appen genererar flera waypoint-kandidater runt startpunkten, hämtar gångrutter
från OpenRouteService och rankar kandidaterna mot vald preferens. De tre bästa
alternativen visas, med ett diversity-filter som försöker välja tydligt olika
riktningar i stället för nästan samma sträcka.

Varje förslag visar namn, faktisk distans från ruttmotorn, uppskattad tid,
höjdmeter och preferens. Det rekommenderade förslaget markeras och rutten ritas
på kartan. Om ingen OpenRouteService API key är konfigurerad används en tydlig
mock fallback med testlinjer mellan koordinater.

## Installation

Installera dependencies:

```bash
npm install
```

Leaflet används för kartan och är installerat som dependency tillsammans med
TypeScript-typer.

## OpenRouteService API key

Skapa en API-nyckel hos [OpenRouteService](https://openrouteservice.org/).
Lägg sedan in nyckeln i environment-filen för lokal utveckling:

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
