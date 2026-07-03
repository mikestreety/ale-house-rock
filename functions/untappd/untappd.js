// netlify/functions/untappd.js
//
// Single-file replacement for the old Cloudflare Worker + proxy setup.
// Fetches pages directly from untappd.com (Netlify's IPs aren't blocked,
// unlike Cloudflare's) and parses them with cheerio instead of
// HTMLRewriter (which is a Cloudflare-only API).
//
// Usage:
//   /.netlify/functions/untappd?url=/user/mikestreety/checkin/1579908958
//   /.netlify/functions/untappd?url=/b/some-brewery/some-beer/12345
//   /.netlify/functions/untappd?url=/brewery-name/12345
//
// See the netlify.toml snippet at the bottom of this file's comments
// if you want pretty URLs like /user/mikestreety/checkin/1579908958
// instead of the ?url= query param.

import * as cheerio from 'cheerio';

const BASE_URL = 'https://untappd.com';

export async function handler(event) {
	const rawUrl = event.queryStringParameters && event.queryStringParameters.url;

	if (!rawUrl) {
		return jsonResponse(400, { error: 'Missing required "url" query parameter' });
	}

	let pathname;
	try {
		pathname = rawUrl.startsWith('http')
			? new URL(rawUrl).pathname
			: rawUrl.startsWith('/')
			? rawUrl
			: `/${rawUrl}`;
	} catch (err) {
		return jsonResponse(400, { error: 'Invalid url parameter' });
	}

	const output = {
		canonical: BASE_URL + pathname,
	};

	let pathParts = pathname.split('/').filter(v => v !== '');

	let response;
	try {
		response = await fetchUntappd(pathname);
	} catch (err) {
		return jsonResponse(502, { error: `Failed to fetch Untappd: ${err.message}` });
	}

	output.status = response.status;

	// If Untappd itself blocked/errored, bail early with what we know
	// rather than trying to parse an error/challenge page.
	if (response.status >= 400) {
		return jsonResponse(200, output);
	}

	const html = await response.text();
	const $ = cheerio.load(html);

	let result;
	if (pathParts.length > 2 && pathParts[2] === 'checkin') {
		result = await getCheckin($, output);
	} else if (pathParts.length > 2 && pathParts[0] === 'b') {
		result = getBeerDetails($, output);
		result = await resolveBreweries(result);
	} else {
		result = getBreweryDetails($, output);
	}

	return jsonResponse(200, result);
}

/**
 * Fetch a page from untappd.com with browser-like headers.
 */
async function fetchUntappd(pathname) {
	return fetch(BASE_URL + pathname, {
		headers: {
			'User-Agent':
				'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
			'Accept':
				'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
			'Accept-Language': 'en-GB,en;q=0.9',
			'Accept-Encoding': 'gzip, deflate, br',
			'Cache-Control': 'max-age=0',
			'Upgrade-Insecure-Requests': '1',
			'Sec-Fetch-Dest': 'document',
			'Sec-Fetch-Mode': 'navigate',
			'Sec-Fetch-Site': 'none',
			'Sec-Fetch-User': '?1',
			'sec-ch-ua': '"Google Chrome";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
			'sec-ch-ua-mobile': '?0',
			'sec-ch-ua-platform': '"Windows"',
		},
	});
}

function jsonResponse(statusCode, body) {
	return {
		statusCode,
		headers: { 'content-type': 'application/json;charset=UTF-8' },
		body: JSON.stringify(body, null, 2),
	};
}

async function getCheckin($, output) {
	// Image
	$('.photo .image-big').each((i, el) => {
		createOrAddToExisting(output, 'image', $(el).attr('data-image'));
	});

	// Beer link
	$('.checkin-info .beer p a').each((i, el) => {
		const href = $(el).attr('href');
		if (href) {
			createOrAddToExisting(output, 'untappd_link', BASE_URL + href);
		}
	});

	// Comment/review
	$('.checkin-info .comment').each((i, el) => {
		createOrAddToExisting(output, 'body', $(el).text());
	});

	// Serving type (Can, Bottle, etc.)
	$('.checkin-info .rating-serving .serving').each((i, el) => {
		createOrAddToExisting(output, 'serving', $(el).text());
	});

	// Rating out of 10 (Untappd stores out of 5, double it)
	$('.checkin-info .rating-serving .caps').each((i, el) => {
		const rating = $(el).attr('data-rating');
		if (rating) {
			createOrAddToExisting(output, 'rating', rating * 2);
		}
	});

	// Where it was purchased
	$('.checkin-extra .purchased-location > div > p:not(.sub-purchased) a').each((i, el) => {
		createOrAddToExisting(output, 'purchased', $(el).text());
	});

	// Date
	$('.checkin-bottom .time').each((i, el) => {
		const text = $(el).text();
		if (text && Date.parse(text)) {
			createOrAddToExisting(output, 'date', new Date(Date.parse(text)).toISOString());
		}
	});

	// Fetch the linked beer page and merge its details in
	if (output.untappd_link) {
		try {
			const beerRes = await fetchUntappd(new URL(output.untappd_link).pathname);
			if (beerRes.status < 400) {
				const beerHtml = await beerRes.text();
				const $beer = cheerio.load(beerHtml);
				output = getBeerDetails($beer, output);
				output = await resolveBreweries(output);
			}
		} catch (err) {
			// Non-fatal — checkin data still stands without beer details
			output.beerFetchError = err.message;
		}
	}

	// Extract hashtags from the body
	if (output.body) {
		let hashtags = output.body.match(/#[a-z0-9_]+/g);
		if (hashtags) {
			output.tags = hashtags.map(h => h.replace('#', ''));
			for (let h of hashtags) {
				output.body = output.body.replace(h, ' ');
			}
			output.body = output.body.trim();
		}
	}

	return output;
}

function getBeerDetails($, output = {}) {
	$('.name h1').each((i, el) => {
		createOrAddToExisting(output, 'title', $(el).text());
	});

	$('.brewery a').each((i, el) => {
		const href = $(el).attr('href');
		if (href) {
			createOrAddToExisting(output, 'brewery_links', [BASE_URL + href]);
		}
	});

	$('.subsidiary a[href^="/brewery"]').each((i, el) => {
		const href = $(el).attr('href');
		if (href) {
			createOrAddToExisting(output, 'brewery_links', [BASE_URL + href]);
		}
	});

	$('p.style').each((i, el) => {
		const text = $(el).text();
		if (text) {
			createOrAddToExisting(output, 'style', text);
		}
	});

	$('p.abv').each((i, el) => {
		const text = $(el).text();
		if (text) {
			createOrAddToExisting(output, 'abv', text.replace('ABV', '').trim());
		}
	});

	return output;
}

/**
 * Given an output object with brewery_links, fetch each brewery page
 * and attach the parsed details, matching the original Worker behaviour.
 */
async function resolveBreweries(output) {
	if (!output.brewery_links) {
		return output;
	}

	output.breweries = await Promise.all(output.brewery_links.map(async (b) => {
		try {
			const res = await fetchUntappd(new URL(b).pathname);
			if (res.status < 400) {
				const html = await res.text();
				const $brewery = cheerio.load(html);
				const details = getBreweryDetails($brewery, {});
				details.untappd = b;
				return details;
			}
			return null;
		} catch (err) {
			return { untappd: b, error: err.message };
		}
	})).then(results => results.filter(Boolean));

	delete output.brewery_links;
	return output;
}

function getBreweryDetails($, output = {}) {
	$('.top .image-big').each((i, el) => {
		createOrAddToExisting(output, 'image', $(el).attr('data-image'));
	});

	$('.name h1').each((i, el) => {
		createOrAddToExisting(output, 'title', $(el).text());
	});

	$('.name .brewery').each((i, el) => {
		createOrAddToExisting(output, 'location', $(el).text());
	});

	$('.name .style').each((i, el) => {
		createOrAddToExisting(output, 'style', $(el).text());
	});

	$('.beer-descrption-read-less').each((i, el) => {
		createOrAddToExisting(output, 'description', $(el).text().replace('Show Less', ''));
	});

	$('.actions.social .url').each((i, el) => {
		createOrAddToExisting(output, 'website', $(el).attr('href'));
	});

	$('.actions.social .ig').each((i, el) => {
		createOrAddToExisting(output, 'instagram', $(el).attr('href'));
	});

	$('.actions.social .tw').each((i, el) => {
		createOrAddToExisting(output, 'twitter', $(el).attr('href'));
	});

	$('.actions.social .fb').each((i, el) => {
		createOrAddToExisting(output, 'facebook', $(el).attr('href'));
	});

	return output;
}

/**
 * Create a new index or append to an existing one if it already exists.
 * (Unchanged from the original Worker.)
 */
function createOrAddToExisting(output, attr, text) {
	if (!text) {
		return;
	}

	if (Array.isArray(text)) {
		let result = output[attr] === undefined ? [] : output[attr];
		for (let t of text) {
			if (t) {
				t = t.replace(/[\n\t\r]/g, ' ').trim();
				result.push(t);
			}
		}
		output[attr] = result;
	} else {
		text = String(text).replace(/[\n\t\r]/g, ' ').trim();
		output[attr] = (output[attr] === undefined ? '' : output[attr]) + text;
	}
}
