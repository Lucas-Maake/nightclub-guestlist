export type EventTicketTier = {
	id: string;
	label: string;
	priceCents: number;
	maxPerOrder: number;
};

export type EventCatalogItem = {
	id: string;
	title: string;
	venue: string;
	location: string;
	addressLine: string;
	startAt: string;
	endAt: string;
	posterHeadline: string;
	posterClass: string;
	posterImageUrl?: string;
	description: string;
	ticketTiers: EventTicketTier[];
	defaultTableType: string;
	dressCode: string;
};

const eventCatalog: EventCatalogItem[] = [
	{
		id: 'thursday-den',
		title: 'THURSDEN: Ray Lee / Tsubee / Jokah',
		venue: 'Den Social',
		location: 'Lower East Side, NYC',
		addressLine: '65 W 36th St, New York, NY 10018',
		startAt: '2026-03-05T22:00:00-05:00',
		endAt: '2026-03-06T03:00:00-05:00',
		posterHeadline: 'THURSDEN',
		posterImageUrl: '/images/events/den.png',
		posterClass:
			'bg-[radial-gradient(circle_at_15%_20%,rgba(186,255,14,0.22),transparent_36%),radial-gradient(circle_at_80%_0%,rgba(255,196,0,0.2),transparent_48%),linear-gradient(180deg,#162013_0%,#0b0d11_62%,#050609_100%)]',
		description:
			'Late-night house session with stacked support. Arrive early for easier entry and best floor access.',
		ticketTiers: [
			{ id: 'earlybird', label: 'Earlybird', priceCents: 1100, maxPerOrder: 4 },
			{ id: 'door', label: 'Door', priceCents: 2200, maxPerOrder: 4 }
		],
		defaultTableType: 'Main Floor Table',
		dressCode: 'Smart nightlife attire'
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
		posterImageUrl: '/images/events/decca.png',
		posterClass:
			'bg-[radial-gradient(circle_at_14%_0%,rgba(255,154,72,0.2),transparent_33%),radial-gradient(circle_at_92%_18%,rgba(255,51,51,0.3),transparent_42%),linear-gradient(180deg,#51140f_0%,#21080d_58%,#09090b_100%)]',
		description:
			'High-energy clash format with rotating sets all night. Expect heavy bass and packed dancefloor energy.',
		ticketTiers: [
			{ id: 'advance', label: 'Advance', priceCents: 1400, maxPerOrder: 4 },
			{ id: 'door', label: 'Door', priceCents: 2800, maxPerOrder: 4 }
		],
		defaultTableType: 'VIP Booth',
		dressCode: 'Upscale streetwear'
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
		posterImageUrl: '/images/events/monarch.png',
		posterClass:
			'bg-[radial-gradient(circle_at_20%_10%,rgba(0,209,255,0.26),transparent_38%),radial-gradient(circle_at_84%_10%,rgba(235,93,255,0.3),transparent_44%),linear-gradient(180deg,#102334_0%,#111118_61%,#08090d_100%)]',
		description:
			'Underground club textures, deep transitions, and extended sets for after-hours crowd dynamics.',
		ticketTiers: [
			{ id: 'pre-sale', label: 'Pre-sale', priceCents: 1800, maxPerOrder: 4 },
			{ id: 'door', label: 'Door', priceCents: 3000, maxPerOrder: 4 }
		],
		defaultTableType: 'Back Lounge Table',
		dressCode: 'Dark chic'
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
		posterImageUrl: '/images/events/mission.png',
		posterClass:
			'bg-[radial-gradient(circle_at_80%_0%,rgba(248,179,81,0.26),transparent_34%),radial-gradient(circle_at_12%_18%,rgba(150,255,218,0.2),transparent_42%),linear-gradient(180deg,#36220f_0%,#15151c_60%,#08080a_100%)]',
		description:
			'A refined open-format session crossing house and disco edits with warm-room lighting and long blends.',
		ticketTiers: [
			{ id: 'advance', label: 'Advance', priceCents: 1600, maxPerOrder: 4 },
			{ id: 'door', label: 'Door', priceCents: 2600, maxPerOrder: 4 }
		],
		defaultTableType: 'Corner Banquette',
		dressCode: 'Evening smart casual'
	}
];

export function listEventsSortedAsc(): EventCatalogItem[] {
	return [...eventCatalog].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
}

export function findEventById(id: string): EventCatalogItem | null {
	return eventCatalog.find((event) => event.id === id) ?? null;
}
