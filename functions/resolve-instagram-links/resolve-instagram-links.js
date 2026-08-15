// netlify/functions/resolve-instagram-links.js
//
// Drains the pending-instagram-links queue (populated by add-beer.js
// whenever it schedules a Buffer post) - for each entry, asks Buffer
// whether that post has actually gone out yet, and if so, links it back
// onto the corresponding beer's `instagram` field via a single commit.
//
// Runs weekly on its own (see the [functions."resolve-instagram-links"]
// schedule entry in netlify.toml), and can also be triggered manually:
//   /.netlify/functions/resolve-instagram-links
// Takes no parameters and needs no token - all it does is check a fixed,
// internally-populated queue against Buffer and write back a link, so
// there's no user-supplied input to authenticate and nothing destructive
// to gate.
//
// NOTE: assumes Buffer's GET /1/updates/:id.json response includes a
// `service_link` field once an update has been sent, pointing at the
// live post. This is based on documented/observed Buffer API behaviour
// but hasn't been verified against a real account from this environment
// - if links aren't resolving, check the function logs (a "sent" update
// with no recognised link field gets logged in full for inspection).

const fetch = require('node-fetch');
const matter = require('gray-matter');
const { Octokit } = require('@octokit/rest');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const { createCommitFile, createGithubCommit } = require('../add-beer/file-handler');
const { getPending, setPending } = require('../shared/pending-instagram-store');

require('dotenv').config();

const repoOwner = 'mikestreety';
const repoName = 'ale-house-rock';
const repoBranch = 'main';

const STALE_AFTER_DAYS = 45;

const isDev = process.env.NETLIFY_DEV === 'true' || process.env.NODE_ENV === 'development';

exports.handler = async () => {
	if (!process.env.BUFFER_ACCESS_TOKEN) {
		return jsonResponse(200, { status: 'ok', message: 'BUFFER_ACCESS_TOKEN not configured, nothing to resolve' });
	}

	const queue = await getPending();

	if (!queue.length) {
		return jsonResponse(200, { status: 'ok', message: 'No pending Instagram links to resolve' });
	}

	let api;
	if (!isDev) {
		api = new Octokit({ auth: process.env.GITHUB_TOKEN });
	}

	const projectRoot = isDev ? process.cwd() : '/tmp';
	const now = Date.now();
	const remaining = [];
	const commitFiles = [];
	const results = [];

	for (const entry of queue) {
		const ageDays = (now - new Date(entry.addedAt).getTime()) / (1000 * 60 * 60 * 24);

		if (ageDays > STALE_AFTER_DAYS) {
			results.push({ permalink: entry.permalink, status: 'dropped-stale' });
			continue;
		}

		let resolvedUrl = null;

		for (const updateId of entry.buffer_update_ids || []) {
			try {
				const res = await fetch(
					`https://api.bufferapp.com/1/updates/${updateId}.json?access_token=${encodeURIComponent(process.env.BUFFER_ACCESS_TOKEN)}`
				);

				if (!res.ok) {
					continue;
				}

				const update = await res.json();

				if (update.service_link) {
					resolvedUrl = update.service_link;
					break;
				}

				if (update.status === 'sent') {
					console.log(`Buffer update ${updateId} is sent but has no service_link:`, JSON.stringify(update));
				}
			} catch (e) {
				console.error(`Failed checking Buffer update ${updateId}:`, e.message);
			}
		}

		if (!resolvedUrl) {
			remaining.push(entry);
			results.push({ permalink: entry.permalink, status: 'pending' });
			continue;
		}

		try {
			const fileContent = isDev
				? fs.readFileSync(path.join(projectRoot, entry.filePath), 'utf8')
				: Buffer.from(
					(await api.repos.getContent({ owner: repoOwner, repo: repoName, path: entry.filePath, ref: repoBranch })).data.content,
					'base64'
				).toString('utf8');

			const parsed = matter(fileContent, { language: 'json' });
			parsed.data.instagram = resolvedUrl;

			commitFiles.push(
				createCommitFile(entry.filePath, matter.stringify(parsed.content, parsed.data, { language: 'json', spaces: 4 }))
			);

			results.push({ permalink: entry.permalink, status: 'resolved', instagram: resolvedUrl });
		} catch (e) {
			console.error(`Failed to read/update ${entry.filePath}:`, e.message);
			remaining.push(entry);
			results.push({ permalink: entry.permalink, status: 'error', message: e.message });
		}
	}

	if (commitFiles.length) {
		try {
			if (isDev) {
				for (const file of commitFiles) {
					fs.writeFileSync(path.join(projectRoot, file.filePath), file.content);
				}
				const filePaths = commitFiles.map(f => f.filePath).join(' ');
				execSync(`git add ${filePaths}`, { cwd: projectRoot });
				execSync(`git commit -m "API: Link ${commitFiles.length} Instagram post(s)"`, { cwd: projectRoot });
			} else {
				await createGithubCommit(
					api,
					repoOwner,
					repoName,
					repoBranch,
					`API: Link ${commitFiles.length} Instagram post(s)`,
					commitFiles
				);
			}
		} catch (e) {
			console.error('Failed to commit resolved Instagram links:', e.message);
			return jsonResponse(500, { status: 'error', message: `Failed to commit resolved links: ${e.message}`, results });
		}
	}

	await setPending(remaining);

	return jsonResponse(200, {
		status: 'ok',
		resolved: results.filter(r => r.status === 'resolved').length,
		pending: results.filter(r => r.status === 'pending').length,
		droppedStale: results.filter(r => r.status === 'dropped-stale').length,
		results,
	});
};

function jsonResponse(statusCode, body) {
	return {
		statusCode,
		headers: { 'content-type': 'application/json;charset=UTF-8' },
		body: JSON.stringify(body, null, 2),
	};
}
