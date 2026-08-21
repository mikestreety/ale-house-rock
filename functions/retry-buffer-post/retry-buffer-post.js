// netlify/functions/retry-buffer-post.js
//
// Re-attempts a Buffer post for a beer that's already on the site,
// without going through add-beer.js (which would reject it outright as
// "Beer already exists"). Useful when the original Buffer post failed,
// or Buffer wasn't configured yet at the time the beer was added.
//
// Usage:
//   /.netlify/functions/retry-buffer-post?token=XXXX&permalink=beer/passing-cloud-floc/

const matter = require('gray-matter');
const { Octokit } = require('@octokit/rest');
const fs = require('fs');
const path = require('path');

const { postReviewToBuffer } = require('../shared/post-to-buffer');
const { jsonResponse } = require('../shared/json-response');

require('dotenv').config();

const repoOwner = 'mikestreety';
const repoName = 'ale-house-rock';
const repoBranch = 'main';
const SITE_URL = 'https://alehouse.rocks';

const isDev = process.env.NETLIFY_DEV === 'true' || process.env.NODE_ENV === 'development';

function normalisePermalink(value) {
	if (!value) {
		return '';
	}
	return value.replace(/^\/+/, '').replace(/\/+$/, '') + '/';
}

exports.handler = async (event) => {
	const data = event.queryStringParameters || {};

	if (!data.token || data.token !== process.env.ACCESS_TOKEN) {
		return jsonResponse(400, { status: 'error', message: 'Missing or invalid token' });
	}

	if (!data.permalink) {
		return jsonResponse(400, { status: 'error', message: 'Missing permalink parameter, e.g. beer/passing-cloud-floc/' });
	}

	const wantedPermalink = normalisePermalink(data.permalink);

	let beers;
	try {
		const res = await fetch(`${SITE_URL}/api/beers.json?_=${Date.now()}`);
		beers = await res.json();
	} catch (e) {
		return jsonResponse(502, { status: 'error', message: `Failed to fetch beers list: ${e.message}` });
	}

	const beer = beers.find(b => normalisePermalink(b.slug) === wantedPermalink);

	if (!beer) {
		return jsonResponse(404, { status: 'error', message: `No beer found with permalink "${data.permalink}"` });
	}

	const filePath = beer.filename.replace(/^\.\//, '');

	// beers.json doesn't include the review text - read it from the
	// actual beer file (same read path resolve-instagram-links.js uses).
	let reviewText;
	try {
		let fileContent;

		if (isDev) {
			fileContent = fs.readFileSync(path.join(process.cwd(), filePath), 'utf8');
		} else {
			const api = new Octokit({ auth: process.env.GITHUB_TOKEN });
			const res = await api.repos.getContent({ owner: repoOwner, repo: repoName, path: filePath, ref: repoBranch });
			fileContent = Buffer.from(res.data.content, 'base64').toString('utf8');
		}

		reviewText = matter(fileContent, { language: 'json' }).data.review;
	} catch (e) {
		return jsonResponse(500, { status: 'error', message: `Failed to read beer file ${filePath}: ${e.message}` });
	}

	if (!reviewText) {
		return jsonResponse(500, { status: 'error', message: `Beer file ${filePath} has no review text` });
	}

	const bufferResult = await postReviewToBuffer({
		title: beer.title,
		breweryNames: (beer.breweries || []).map(b => b.title).filter(Boolean),
		rating: beer.rating,
		reviewText,
		imageUrl: `${SITE_URL}${beer.image}`,
		permalink: beer.slug.replace(/^\/+/, ''),
		filePath,
	});

	const status = !bufferResult.configured ? 'not-configured' : (bufferResult.success ? 'ok' : 'error');
	const statusCode = bufferResult.configured && bufferResult.success === false ? 500 : 200;

	return jsonResponse(statusCode, {
		status,
		permalink: beer.slug,
		title: beer.title,
		buffer: bufferResult,
	});
};
