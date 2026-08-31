// functions/shared/import-next-review.js
//
// Reads the Untappd RSS feed at UNTAPPD_RSS_URL (must be set as an
// environment variable), finds the oldest checkin in the feed that
// hasn't been added to the site yet (matched by canonical URL against
// app/content/beer/*.md), and hands it off to the existing
// parse-review-url -> untappd -> add-beer pipeline to actually add it.
//
// Shared between import-next-review (scheduled) and import-next-review-now
// (manual). Takes no parameters - the feed URL is fixed via
// UNTAPPD_RSS_URL, so there's no user-supplied input to authenticate here.
// The ACCESS_TOKEN used to authorise the downstream add-beer commit is
// read server-side from the environment rather than passed in by the
// caller.

import * as cheerio from 'cheerio';
import { jsonResponse } from './json-response.js';

const SITE_URL = 'https://alehouse.rocks';

export async function importNextReview() {
	const feedUrl = process.env.UNTAPPD_RSS_URL;

	if (!feedUrl) {
		return jsonResponse(500, { status: 'error', message: 'UNTAPPD_RSS_URL environment variable is not set' });
	}

	let feedResponse;
	try {
		// Cache-bust with a timestamp query param and explicit no-cache
		// headers - Untappd (or a CDN in front of it) has been seen serving
		// a stale cached copy of the feed otherwise.
		const cacheBustedUrl = new URL(feedUrl);
		cacheBustedUrl.searchParams.set('_', Date.now());

		feedResponse = await fetch(cacheBustedUrl.toString(), {
			headers: {
				'User-Agent':
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
				'Accept': 'application/rss+xml,application/xml;q=0.9,*/*;q=0.8',
				'Cache-Control': 'no-cache',
				'Pragma': 'no-cache',
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
		const title = $(el).find('title').first().text().trim();
		const pubDateText = $(el).find('pubDate').first().text().trim();
		const pubDate = pubDateText ? new Date(pubDateText) : null;

		if (link && pubDate && !isNaN(pubDate)) {
			items.push({ link, title, pubDate });
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
		const latest = items.reduce((a, b) => (b.pubDate > a.pubDate ? b : a));

		return jsonResponse(200, {
			status: 'ok',
			message: 'No new reviews to import - everything in the feed is already on the site',
			latestFeedItem: {
				title: latest.title,
				link: latest.link,
				pubDate: latest.pubDate.toISOString(),
			},
		});
	}

	// Oldest not-yet-imported review first
	newItems.sort((a, b) => a.pubDate - b.pubDate);
	const next = newItems[0];

	// Hand off to parse-review-url -> untappd -> add-beer server-side (fetch
	// follows the redirect chain internally) rather than returning our own
	// redirect to the caller - a redirect's Location header would expose
	// ACCESS_TOKEN in cleartext to whoever hit this endpoint, and this
	// endpoint deliberately requires no auth of its own.
	const importParams = new URLSearchParams({
		url: next.link,
		token: process.env.ACCESS_TOKEN,
	});

	const addResponse = await fetch(`${SITE_URL}/.netlify/functions/parse-review-url?${importParams.toString()}`);
	const body = await addResponse.text();

	return {
		statusCode: addResponse.status,
		headers: { 'content-type': addResponse.headers.get('content-type') || 'text/html;charset=UTF-8' },
		body,
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
