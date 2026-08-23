// Small persistent queue, committed to the repo as JSON, of beers whose
// Buffer post hasn't been confirmed as published yet. add-beer.js pushes
// an entry once it queues a Buffer post; resolve-instagram-links.js
// drains it once Buffer confirms the post went live.
//
// This used to be Netlify Blobs, but the automatic siteID/token context
// Netlify is supposed to inject at invocation time wasn't reaching these
// functions (MissingBlobsEnvironmentError in the function logs), so it's
// a git-committed file instead - reusing the GitHub API access every
// other function here already has via GITHUB_TOKEN, with no separate
// Netlify feature to configure.
//
// Reads/writes use the file's git blob SHA as a compare-and-swap token
// (GitHub's Contents API returns 409 if the SHA you send is stale),
// retrying on conflict, since add-beer.js and resolve-instagram-links.js
// can run concurrently and a plain read-modify-write would let one
// writer's update silently clobber another's.
const { Octokit } = require('@octokit/rest');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

require('dotenv').config();

const repoOwner = 'mikestreety';
const repoName = 'ale-house-rock';
const repoBranch = 'main';
const FILE_PATH = 'data/pending-instagram-links.json';
const MAX_RETRIES = 5;

const isDev = process.env.NETLIFY_DEV === 'true' || process.env.NODE_ENV === 'development';
const projectRoot = isDev ? process.cwd() : '/tmp';

function api() {
	return new Octokit({ auth: process.env.GITHUB_TOKEN });
}

function serialize(queue) {
	return JSON.stringify(queue, null, '\t') + '\n';
}

async function readQueue() {
	if (isDev) {
		const localPath = path.join(projectRoot, FILE_PATH);
		if (!fs.existsSync(localPath)) {
			return { queue: [], sha: null };
		}
		return { queue: JSON.parse(fs.readFileSync(localPath, 'utf8')), sha: null };
	}

	try {
		const { data } = await api().repos.getContent({ owner: repoOwner, repo: repoName, path: FILE_PATH, ref: repoBranch });
		return { queue: JSON.parse(Buffer.from(data.content, 'base64').toString('utf8')), sha: data.sha };
	} catch (e) {
		if (e.status === 404) {
			return { queue: [], sha: null };
		}
		throw e;
	}
}

async function writeQueue(queue, sha) {
	if (isDev) {
		const localPath = path.join(projectRoot, FILE_PATH);
		fs.mkdirSync(path.dirname(localPath), { recursive: true });
		fs.writeFileSync(localPath, serialize(queue));
		execSync(`git add ${FILE_PATH}`, { cwd: projectRoot });
		execSync('git commit -m "API: Update pending Instagram links queue"', { cwd: projectRoot });
		return;
	}

	const params = {
		owner: repoOwner,
		repo: repoName,
		path: FILE_PATH,
		branch: repoBranch,
		message: 'API: Update pending Instagram links queue',
		content: Buffer.from(serialize(queue)).toString('base64'),
	};

	if (sha) {
		params.sha = sha;
	}

	await api().repos.createOrUpdateFileContents(params);
}

async function getPending() {
	const { queue } = await readQueue();
	return queue;
}

/**
 * Read-modify-write the queue via `mutate(currentQueue) -> newQueue`,
 * retrying on write conflicts. Throws if it can't win after MAX_RETRIES
 * attempts (heavy concurrent contention), or immediately on any error
 * that isn't a stale-SHA conflict.
 */
async function updatePending(mutate) {
	for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
		const { queue, sha } = await readQueue();
		const nextQueue = mutate(queue);

		try {
			await writeQueue(nextQueue, sha);
			return nextQueue;
		} catch (e) {
			if (!isDev && e.status === 409) {
				continue;
			}
			throw e;
		}
	}

	throw new Error('Failed to update pending-instagram-links queue - too much write contention');
}

async function addPending(entry) {
	return updatePending(queue => [...queue, entry]);
}

module.exports = { getPending, addPending, updatePending };
