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

## Cloudflare Worker

Appen skyddar OpenRouteService-nyckeln via en Cloudflare Worker:

```text
Angular frontend -> Cloudflare Worker -> OpenRouteService
```

ORS API-nyckeln ska aldrig ligga i Angular environment. Lägg den som Worker-secret:

```bash
npm install -g wrangler
wrangler login
cd worker
wrangler secret put ORS_API_KEY
wrangler deploy
```

Worker-endpointen är `POST /generate-routes`. Den gör max tre OpenRouteService-
anrop per generering och skickar nyckeln som `Authorization` header från
`ORS_API_KEY`.

För lokal utveckling pekar Angular på `http://localhost:8787`. Starta Worker lokalt:

```bash
cd worker
wrangler dev
```

För Firebase Hosting/produktion, uppdatera `routeWorkerUrl` i Angular environment
till din deployade Worker-url. Firebase Hosting används fortsatt bara för Angular-
appen; inga Firebase Functions behövs.

OpenRouteService-koordinater skickas från Worker som `[longitude, latitude]`. När
geometry läses tillbaka konverteras den till Leaflets `[latitude, longitude]`
innan rutten ritas som polyline.

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
