interface Env {
	ORS_API_KEY: string;
}

interface Coordinates {
	latitude: number;
	longitude: number;
}

interface RouteRequest {
	start: Coordinates;
	distanceKm: number;
	preference: string;
}

interface RouteCandidate {
	name: string;
	coordinates: [number, number][];
}

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: corsHeaders });
		}

		if (url.pathname !== '/generate-routes') {
			return json({ message: 'Not found' }, 404);
		}

		if (request.method !== 'POST') {
			return json({ message: 'Only POST allowed' }, 405);
		}

		if (!env.ORS_API_KEY) {
			return json({ message: 'Missing ORS_API_KEY secret' }, 401);
		}

		const routeRequest = await request.json<RouteRequest>();

		if (!routeRequest.start?.latitude || !routeRequest.start?.longitude) {
			return json({ message: 'Missing start coordinates' }, 400);
		}

		const candidates = generateCandidates(routeRequest.start, Number(routeRequest.distanceKm ?? 5));
		const routes: any[] = [];
		let lastErrorStatus = 0;

		for (let i = 0; i < candidates.length; i++) {
			const candidate = candidates[i];

			const orsResponse = await fetch('https://api.openrouteservice.org/v2/directions/foot-walking/geojson', {
				method: 'POST',
				headers: {
					Authorization: env.ORS_API_KEY,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					coordinates: candidate.coordinates,
					instructions: false,
				}),
			});

			console.log(`ORS candidate ${i + 1} status: ${orsResponse.status}`);

			if (!orsResponse.ok) {
				lastErrorStatus = orsResponse.status;
				console.warn(`ORS candidate ${i + 1} failed with status ${orsResponse.status}`);
				continue;
			}

			const data = await orsResponse.json<any>();
			const feature = data.features?.[0];
			const geometryCoordinates = feature?.geometry?.coordinates;
			const summary = feature?.properties?.summary;

			const geometryPointCount = Array.isArray(geometryCoordinates) ? geometryCoordinates.length : 0;
			console.log(`ORS candidate ${i + 1} geometry points: ${geometryPointCount}`);

			if (!summary || !Array.isArray(geometryCoordinates) || geometryPointCount <= 10) {
				console.warn(`ORS candidate ${i + 1} ignored because real geometry is missing.`);
				continue;
			}

			const path = geometryCoordinates.map(([longitude, latitude]: [number, number]) => ({
				latitude,
				longitude,
			}));

			routes.push({
				id: `route-${routes.length + 1}`,
				name: candidate.name,
				distanceKm: Math.round((summary.distance / 1000) * 10) / 10,
				estimatedTimeMinutes: Math.round(summary.duration / 60),
				elevationMeters: 0,
				preference: routeRequest.preference,
				recommended: routes.length === 0,
				path,
			});
		}

		if (routes.length === 0) {
			return json({ message: getOpenRouteServiceErrorMessage(lastErrorStatus) }, mapStatus(lastErrorStatus));
		}

		return json({ routes });
	},
};

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			'Content-Type': 'application/json',
			...corsHeaders,
		},
	});
}

function generateCandidates(start: Coordinates, distanceKm: number): RouteCandidate[] {
	const candidateCount = 3;
	const loopRadiusKm = Math.max(0.5, distanceKm / 3.6);

	return Array.from({ length: candidateCount }, (_, index) => {
		const bearing = index * 120;
		const p1 = destinationPoint(start, loopRadiusKm, bearing);
		const p2 = destinationPoint(start, loopRadiusKm, bearing + 120);

		return {
			name: `Rutt ${index + 1}`,
			coordinates: [
				[start.longitude, start.latitude],
				[p1.longitude, p1.latitude],
				[p2.longitude, p2.latitude],
				[start.longitude, start.latitude],
			],
		};
	});
}

function destinationPoint(start: Coordinates, distanceKm: number, bearingDegrees: number): Coordinates {
	const earthRadiusKm = 6371;
	const angularDistance = distanceKm / earthRadiusKm;
	const bearing = toRadians(bearingDegrees);
	const startLatitude = toRadians(start.latitude);
	const startLongitude = toRadians(start.longitude);

	const latitude = Math.asin(
		Math.sin(startLatitude) * Math.cos(angularDistance) +
		Math.cos(startLatitude) * Math.sin(angularDistance) * Math.cos(bearing),
	);

	const longitude =
		startLongitude +
		Math.atan2(
			Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(startLatitude),
			Math.cos(angularDistance) - Math.sin(startLatitude) * Math.sin(latitude),
		);

	return {
		latitude: toDegrees(latitude),
		longitude: toDegrees(longitude),
	};
}

function toRadians(degrees: number): number {
	return (degrees * Math.PI) / 180;
}

function toDegrees(radians: number): number {
	return (radians * 180) / Math.PI;
}

function getOpenRouteServiceErrorMessage(status: number): string {
	if (status === 401) return 'Worker saknar giltig ORS API-nyckel.';
	if (status === 403) return 'OpenRouteService nekade anropet. Kontrollera Worker-secret ORS_API_KEY.';
	if (status === 429) return 'API-gräns nådd. Vänta en minut och försök igen.';

	return 'Kunde inte hämta rutt från OpenRouteService.';
}

function mapStatus(status: number): number {
	return [401, 403, 429].includes(status) ? status : 502;
}
