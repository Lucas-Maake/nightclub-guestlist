import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import fs from 'node:fs';
import path from 'node:path';

const seedCatalog = [
	{
		id: 'thursday-den',
		title: 'THURSDEN: Ray Lee / Tsubee / Jokah',
		venue: 'Den Social',
		location: 'Lower East Side, NYC',
		addressLine: '65 W 36th St, New York, NY 10018',
		startAt: '2026-03-05T22:00:00-05:00',
		endAt: '2026-03-06T03:00:00-05:00',
		posterHeadline: 'THURSDEN',
		posterClass:
			'bg-[radial-gradient(circle_at_15%_20%,rgba(186,255,14,0.22),transparent_36%),radial-gradient(circle_at_80%_0%,rgba(255,196,0,0.2),transparent_48%),linear-gradient(180deg,#162013_0%,#0b0d11_62%,#050609_100%)]',
		description:
			'Late-night house session with stacked support. Arrive early for easier entry and best floor access.',
		defaultTableType: 'Main Floor Table',
		dressCode: 'Smart nightlife attire',
		ticketTiers: [
			{ id: 'earlybird', label: 'Earlybird', priceCents: 1100, maxPerOrder: 4 },
			{ id: 'door', label: 'Door', priceCents: 2200, maxPerOrder: 4 }
		]
	},
	{
		id: 'red-room',
		title: 'The Red Room: Reggae vs The World',
		venue: 'Decca Live',
		location: 'Brooklyn, NYC',
		addressLine: '130 Myrtle Ave, Brooklyn, NY 11201',
		startAt: '2026-03-06T22:00:00-05:00',
		endAt: '2026-03-07T02:00:00-05:00',
		posterHeadline: 'RED ROOM',
		posterClass:
			'bg-[radial-gradient(circle_at_14%_0%,rgba(255,154,72,0.2),transparent_33%),radial-gradient(circle_at_92%_18%,rgba(255,51,51,0.3),transparent_42%),linear-gradient(180deg,#51140f_0%,#21080d_58%,#09090b_100%)]',
		description:
			'High-energy clash format with rotating sets all night. Expect heavy bass and packed dancefloor energy.',
		defaultTableType: 'VIP Booth',
		dressCode: 'Upscale streetwear',
		ticketTiers: [
			{ id: 'advance', label: 'Advance', priceCents: 1400, maxPerOrder: 4 },
			{ id: 'door', label: 'Door', priceCents: 2800, maxPerOrder: 4 }
		]
	},
	{
		id: 'void-frequency',
		title: 'Void Frequency: Nova / Nira / Sync',
		venue: 'Monarch District',
		location: 'Midtown, NYC',
		addressLine: '315 W 35th St, New York, NY 10001',
		startAt: '2026-03-07T23:00:00-05:00',
		endAt: '2026-03-08T04:00:00-05:00',
		posterHeadline: 'VOID',
		posterClass:
			'bg-[radial-gradient(circle_at_20%_10%,rgba(0,209,255,0.26),transparent_38%),radial-gradient(circle_at_84%_10%,rgba(235,93,255,0.3),transparent_44%),linear-gradient(180deg,#102334_0%,#111118_61%,#08090d_100%)]',
		description:
			'Underground club textures, deep transitions, and extended sets for after-hours crowd dynamics.',
		defaultTableType: 'Back Lounge Table',
		dressCode: 'Dark chic',
		ticketTiers: [
			{ id: 'pre-sale', label: 'Pre-sale', priceCents: 1800, maxPerOrder: 4 },
			{ id: 'door', label: 'Door', priceCents: 3000, maxPerOrder: 4 }
		]
	},
	{
		id: 'saturday-atelier',
		title: 'Saturday Atelier: House + Disco Edit',
		venue: 'Keinemusik Hall',
		location: 'West Village, NYC',
		addressLine: '43 9th Ave, New York, NY 10011',
		startAt: '2026-03-08T21:00:00-05:00',
		endAt: '2026-03-09T02:30:00-05:00',
		posterHeadline: 'ATELIER',
		posterClass:
			'bg-[radial-gradient(circle_at_80%_0%,rgba(248,179,81,0.26),transparent_34%),radial-gradient(circle_at_12%_18%,rgba(150,255,218,0.2),transparent_42%),linear-gradient(180deg,#36220f_0%,#15151c_60%,#08080a_100%)]',
		description:
			'A refined open-format session crossing house and disco edits with warm-room lighting and long blends.',
		defaultTableType: 'Corner Banquette',
		dressCode: 'Evening smart casual',
		ticketTiers: [
			{ id: 'advance', label: 'Advance', priceCents: 1600, maxPerOrder: 4 },
			{ id: 'door', label: 'Door', priceCents: 2600, maxPerOrder: 4 }
		]
	}
];

function parseServiceAccountFromEnv() {
	const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
	if (!raw) {
		return null;
	}

	try {
		return JSON.parse(raw);
	} catch {
		throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.');
	}
}

function readProjectIdFromEnvFile() {
	const candidateFiles = ['.env.local', '.env'];
	for (const filename of candidateFiles) {
		const filepath = path.resolve(process.cwd(), filename);
		if (!fs.existsSync(filepath)) {
			continue;
		}

		const contents = fs.readFileSync(filepath, 'utf8');
		for (const line of contents.split(/\r?\n/g)) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith('#')) {
				continue;
			}

			const [key, ...rest] = trimmed.split('=');
			if (key !== 'PUBLIC_FIREBASE_PROJECT_ID') {
				continue;
			}

			const value = rest.join('=').trim().replace(/^['"]|['"]$/g, '');
			if (value) {
				return value;
			}
		}
	}

	return undefined;
}

function initializeAdminApp() {
	if (getApps().length > 0) {
		return getApps()[0];
	}

	const explicitProjectId =
		process.env.FIREBASE_PROJECT_ID ||
		process.env.GOOGLE_CLOUD_PROJECT ||
		process.env.GCLOUD_PROJECT ||
		process.env.PUBLIC_FIREBASE_PROJECT_ID ||
		readProjectIdFromEnvFile() ||
		undefined;
	const serviceAccount = parseServiceAccountFromEnv();
	const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;

	if (emulatorHost) {
		return initializeApp({
			projectId: explicitProjectId ?? 'demo-nightclub-guestlist'
		});
	}

	if (serviceAccount) {
		return initializeApp({
			credential: cert(serviceAccount),
			projectId: explicitProjectId ?? serviceAccount.project_id
		});
	}

	return initializeApp({
		credential: applicationDefault(),
		...(explicitProjectId ? { projectId: explicitProjectId } : {})
	});
}

async function seedEvents({ dryRun }) {
	let eventCount = 0;
	let tierCount = 0;

	if (dryRun) {
		for (const event of seedCatalog) {
			console.log(`[dry-run] upsert events/${event.id}`);
			eventCount += 1;
			tierCount += event.ticketTiers.length;
		}
		console.log(`Done. Seed preview includes ${eventCount} events and ${tierCount} ticket tiers.`);
		return;
	}

	const app = initializeAdminApp();
	const db = getFirestore(app);

	for (const event of seedCatalog) {
		const eventRef = db.collection('events').doc(event.id);
		const eventPayload = {
			title: event.title,
			venue: event.venue,
			location: event.location,
			addressLine: event.addressLine,
			startAt: new Date(event.startAt),
			endAt: new Date(event.endAt),
			posterHeadline: event.posterHeadline,
			posterClass: event.posterClass,
			description: event.description,
			defaultTableType: event.defaultTableType,
			dressCode: event.dressCode,
			published: true,
			updatedAt: FieldValue.serverTimestamp()
		};

		const batch = db.batch();
		batch.set(eventRef, eventPayload, { merge: true });

		event.ticketTiers.forEach((tier, index) => {
			const tierRef = eventRef.collection('ticketTiers').doc(tier.id);
			batch.set(
				tierRef,
				{
					label: tier.label,
					priceCents: tier.priceCents,
					maxPerOrder: tier.maxPerOrder,
					sortOrder: index,
					updatedAt: FieldValue.serverTimestamp()
				},
				{ merge: true }
			);
		});

		await batch.commit();
		eventCount += 1;
		tierCount += event.ticketTiers.length;
		console.log(`Seeded events/${event.id} (${event.ticketTiers.length} tiers)`);
	}

	console.log(`Done. Seeded ${eventCount} events and ${tierCount} ticket tiers.`);
}

const dryRun = process.argv.includes('--dry-run');

seedEvents({ dryRun }).catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error('Failed to seed events:', message);
	console.error('Tip: set one of GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_JSON.');
	console.error('Tip: ensure a project id is set via FIREBASE_PROJECT_ID or PUBLIC_FIREBASE_PROJECT_ID.');
	console.error('Tip: for local emulator, set FIRESTORE_EMULATOR_HOST=127.0.0.1:8080.');
	process.exitCode = 1;
});
