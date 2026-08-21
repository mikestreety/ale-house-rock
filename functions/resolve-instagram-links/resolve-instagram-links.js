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
// NOTE: the live-post-URL field name is unverified (Buffer's GraphQL
// Post type isn't documented in detail anywhere this environment could
// reach) - getPostStatus() introspects the Post type and tries every
// field whose name looks link-shaped, logging the full post object
// whenever a post is sent but none of them came back populated, so the
// real field name can be read from the logs and hardcoded here later.

const matter = require('gray-matter');
const { Octokit } = require('@octokit/rest');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const { createCommitFile, createGithubCommit } = require('../add-beer/file-handler');
const { getPending, updatePending } = require('../shared/pending-instagram-store');
const { jsonResponse } = require('../shared/json-response');
const { getPostStatus } = require('../shared/buffer-graphql');

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
	const toRemove = new Set();
	const commitFiles = [];
	const results = [];

	for (const entry of queue) {
		const ageDays = (now - new Date(entry.addedAt).getTime()) / (1000 * 60 * 60 * 24);

		if (ageDays > STALE_AFTER_DAYS) {
			results.push({ permalink: entry.permalink, status: 'dropped-stale' });
			toRemove.add(entry.permalink);
			continue;
		}

		let resolvedUrl = null;

		for (const postId of entry.buffer_post_ids || []) {
			try {
				const post = await getPostStatus(postId, process.env.BUFFER_ACCESS_TOKEN);

				if (!post) {
					continue;
				}

				if (post.status && /sent/i.test(post.status)) {
					const linkValue = (post.__linkFields || [])
						.map(field => post[field])
						.find(value => typeof value === 'string' && value.startsWith('http'));

					if (linkValue) {
						resolvedUrl = linkValue;
						break;
					}

					console.log(
						`Buffer post ${postId} is sent but none of [${(post.__linkFields || []).join(', ')}] were a populated URL:`,
						JSON.stringify(post)
					);
				}
			} catch (e) {
				console.error(`Failed checking Buffer post ${postId}:`, e.message);
			}
		}

		if (!resolvedUrl) {
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
			toRemove.add(entry.permalink);
		} catch (e) {
			console.error(`Failed to read/update ${entry.filePath}:`, e.message);
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

	// Remove resolved/stale entries from whatever the *current* queue looks
	// like (not the snapshot we started with) - add-beer.js may have added
	// new entries while this run was in progress.
	if (toRemove.size) {
		await updatePending(currentQueue => currentQueue.filter(entry => !toRemove.has(entry.permalink)));
	}

	return jsonResponse(200, {
		status: 'ok',
		resolved: results.filter(r => r.status === 'resolved').length,
		pending: results.filter(r => r.status === 'pending').length,
		droppedStale: results.filter(r => r.status === 'dropped-stale').length,
		results,
	});
};
