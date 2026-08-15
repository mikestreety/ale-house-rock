// netlify/functions/import-next-review.js
//
// Reads the Untappd RSS feed (UNTAPPD_RSS_URL), finds the oldest checkin
// in the feed that hasn't been added to the site yet (matched by
// canonical URL against app/content/beer/*.md), and hands it off to the
// existing parse-review-url -> untappd -> add-beer pipeline to actually
// add it.
//
// Usage:
//   /.netlify/functions/import-next-review?token=XXXX

import * as cheerio from 'cheerio';

const DEFAULT_FEED_URL = 'https://untappd.com/rss/mikestreety';
const SITE_URL = 'https://alehouse.rocks';

export async function handler(event) {
	const data = event.queryStringParameters || {};

	if (!data.token || data.token !== process.env.ACCESS_TOKEN) {
		return jsonResponse(400, { status: 'error', message: 'Missing or invalid token' });
	}

	const feedUrl = process.env.UNTAPPD_RSS_URL || DEFAULT_FEED_URL;

	let feedResponse;
	try {
		feedResponse = await fetch(feedUrl, {
			headers: {
				'User-Agent':
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
				'Accept': 'application/rss+xml,application/xml;q=0.9,*/*;q=0.8',
			},
		});
	} catch (err) {
		return jsonResponse(502, { status: 'error', message: `Failed to fetch RSS feed: ${err.message}`, feedUrl });
	}

	if (!feedResponse.ok) {
		return jsonResponse(502, {
			status: 'error',
			message: `Untappd RSS feed returned status ${feedResponse.status}`,
			feedUrl,
		});
	}

	const xml = await feedResponse.text();
	const $ = cheerio.load(xml, { xmlMode: true });

	const items = [];
	$('item').each((i, el) => {
		const link = normaliseCheckinLink($(el).find('link').first().text().trim());
		const pubDateText = $(el).find('pubDate').first().text().trim();
		const pubDate = pubDateText ? new Date(pubDateText) : null;

		if (link && pubDate && !isNaN(pubDate)) {
			items.push({ link, pubDate });
		}
	});

	if (!items.length) {
		return jsonResponse(200, { status: 'ok', message: 'No checkins found in the RSS feed', feedUrl });
	}

	// Work out which of those checkins are already on the site
	let existingCanonicals;
	try {
		const aliasesResponse = await fetch(`${SITE_URL}/api/aliases.json?_=${Date.now()}`);
		const aliasesData = await aliasesResponse.json();
		existingCanonicals = new Set(
			Object.keys(aliasesData.beers || {}).map(normaliseCheckinLink).filter(Boolean)
		);
	} catch (err) {
		return jsonResponse(502, { status: 'error', message: `Failed to fetch existing reviews: ${err.message}` });
	}

	const newItems = items.filter(item => !existingCanonicals.has(item.link));

	if (!newItems.length) {
		return jsonResponse(200, {
			status: 'ok',
			message: 'No new reviews to import - everything in the feed is already on the site',
		});
	}

	// Oldest not-yet-imported review first
	newItems.sort((a, b) => a.pubDate - b.pubDate);
	const next = newItems[0];

	const redirectParams = new URLSearchParams({
		url: next.link,
		token: data.token,
	});

	return {
		statusCode: 302,
		headers: {
			Location: '/.netlify/functions/parse-review-url?' + redirectParams.toString(),
		},
	};
}

/**
 * Reduce an Untappd checkin URL down to its canonical form
 * (https://untappd.com/user/USERNAME/checkin/ID), matching the format
 * stored in each beer's `canonical` field. Returns null for anything
 * that isn't a checkin link.
 */
function normaliseCheckinLink(url) {
	if (!url) {
		return null;
	}

	let pathname;
	try {
		pathname = new URL(url).pathname.replace(/\/$/, '');
	} catch (err) {
		return null;
	}

	if (!/^\/user\/[^/]+\/checkin\/\d+$/.test(pathname)) {
		return null;
	}

	return `https://untappd.com${pathname}`;
}

function jsonResponse(statusCode, body) {
	return {
		statusCode,
		headers: { 'content-type': 'application/json;charset=UTF-8' },
		body: JSON.stringify(body, null, 2),
	};
}
