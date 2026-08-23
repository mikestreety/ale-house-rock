// netlify/functions/queue-buffer-post.js
//
// Recovery tool: finds a beer's post(s) directly in Buffer (matching by
// caption text, since we don't have a post ID to look up) and adds them
// to the pending-instagram-links queue, for a beer whose original
// queuing call failed for some reason (e.g. the Netlify Blobs bug that
// used to break every write to the queue - see
// functions/shared/pending-instagram-store.js). Once queued, the normal
// resolve-instagram-links run picks it up like any other entry, whether
// the post is still scheduled or has already gone out.
//
// Usage:
//   /.netlify/functions/queue-buffer-post?token=XXXX&permalink=beer/passing-cloud-floc/

const { Octokit } = require('@octokit/rest');
const fs = require('fs');
const path = require('path');

const { listPosts } = require('../shared/buffer-graphql');
const { addPending, getPending } = require('../shared/pending-instagram-store');
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

	if (!process.env.BUFFER_ACCESS_TOKEN || !process.env.BUFFER_CHANNEL_IDS) {
		return jsonResponse(400, { status: 'error', message: 'Buffer is not configured (BUFFER_ACCESS_TOKEN/BUFFER_CHANNEL_IDS)' });
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

	const existingQueue = await getPending();
	const alreadyQueued = existingQueue.find(entry => entry.permalink === beer.slug.replace(/^\/+/, ''));

	if (alreadyQueued) {
		return jsonResponse(200, { status: 'ok', message: 'Already queued', permalink: beer.slug, entry: alreadyQueued });
	}

	const channelIds = process.env.BUFFER_CHANNEL_IDS.split(',').map(id => id.trim()).filter(Boolean);

	let posts;
	try {
		posts = await listPosts(channelIds, process.env.BUFFER_ACCESS_TOKEN);
	} catch (e) {
		return jsonResponse(502, { status: 'error', message: `Failed to list Buffer posts: ${e.message}` });
	}

	const matches = posts.filter(post => typeof post.text === 'string' && post.text.includes(beer.title));

	if (!matches.length) {
		return jsonResponse(404, {
			status: 'error',
			message: `No Buffer post found containing "${beer.title}" across ${channelIds.length} channel(s)`,
			checked: posts.length,
		});
	}

	const entry = {
		permalink: beer.slug.replace(/^\/+/, ''),
		filePath,
		buffer_post_ids: matches.map(post => post.id),
		addedAt: new Date().toISOString(),
	};

	try {
		if (isDev) {
			if (!fs.existsSync(path.join(process.cwd(), filePath))) {
				throw new Error('file does not exist locally');
			}
		} else {
			const api = new Octokit({ auth: process.env.GITHUB_TOKEN });
			await api.repos.getContent({ owner: repoOwner, repo: repoName, path: filePath, ref: repoBranch });
		}
	} catch (e) {
		return jsonResponse(404, { status: 'error', message: `Beer file ${filePath} not found in repo: ${e.message}` });
	}

	await addPending(entry);

	return jsonResponse(200, {
		status: 'ok',
		permalink: beer.slug,
		title: beer.title,
		matchedPosts: matches.map(post => ({ id: post.id, status: post.status, dueAt: post.dueAt, sentAt: post.sentAt })),
		queued: entry,
	});
};
