const fetch = require('node-fetch');
const matter = require('gray-matter');
const { Octokit } = require('@octokit/rest');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const slugify = require('./slugify');
const { handleBrewery, handleShop, handleStyle, fetchImageBuffer, processImage, createCommitFile, createGithubCommit } = require('./file-handler');
const { addPending } = require('../shared/pending-instagram-store');

require('dotenv').config();

// Load aliases data (auto-generated from 11ty build)
let aliasesData = {};
try {
	aliasesData = require('./aliases-data.json');
} catch(e) {
	console.warn('Could not load aliases data:', e.message);
}

const repoOwner = 'mikestreety';
const repoName = 'ale-house-rock';
const repoBranch = 'main';

// Detect if we're in dev mode
const isDev = process.env.NETLIFY_DEV === 'true' || process.env.NODE_ENV === 'development';

/**
 * Look up each profile's pending (queued/scheduled) Buffer updates and
 * return the set of days (YYYY-MM-DD, UTC) that already have at least
 * one post scheduled, so a new post can avoid piling up on the same day.
 * Best-effort - a profile that fails to load just contributes nothing.
 */
async function getOccupiedDays(profileIds, accessToken) {
	const occupiedDays = new Set();

	await Promise.all(profileIds.map(async (profileId) => {
		try {
			const res = await fetch(
				`https://api.bufferapp.com/1/profiles/${profileId}/updates/pending.json?access_token=${encodeURIComponent(accessToken)}&count=100`
			);
			if (!res.ok) {
				return;
			}
			const data = await res.json();
			for (const update of data.updates || []) {
				if (update.scheduled_at) {
					occupiedDays.add(new Date(update.scheduled_at * 1000).toISOString().slice(0, 10));
				}
			}
		} catch (e) {
			// Non-fatal - just means we won't know this profile's schedule
		}
	}));

	return occupiedDays;
}

/**
 * Pick a random time between 6:00pm and 8:59pm on the next day (looking
 * up to two weeks ahead) that doesn't already have a post scheduled. If
 * every day in that window already has one, falls back to tomorrow.
 */
function pickScheduledTime(occupiedDays) {
	const MAX_LOOKAHEAD_DAYS = 14;
	let chosenDate;

	for (let offset = 1; offset <= MAX_LOOKAHEAD_DAYS; offset++) {
		const candidate = new Date();
		candidate.setUTCDate(candidate.getUTCDate() + offset);

		if (!occupiedDays.has(candidate.toISOString().slice(0, 10))) {
			chosenDate = candidate;
			break;
		}
	}

	if (!chosenDate) {
		chosenDate = new Date();
		chosenDate.setUTCDate(chosenDate.getUTCDate() + 1);
	}

	const hour = 18 + Math.floor(Math.random() * 3); // 18, 19 or 20 (6pm-8:59pm)
	const minute = Math.floor(Math.random() * 60);
	chosenDate.setUTCHours(hour, minute, 0, 0);

	return chosenDate;
}

exports.handler = async (event, context) => {

	let data = event.queryStringParameters;

	/**
	* Data validation
	*/
	if (!data || !data.hasOwnProperty('url')) {
		return {
			statusCode: 400,
			body: JSON.stringify({
				status: 'error',
				message: 'Missing URL parameter'
			})
		}
	}

	// Only check token in production
	if (!isDev) {
		if (!data.hasOwnProperty('token') || data.token !== process.env.ACCESS_TOKEN) {
			return {
				statusCode: 400,
				body: JSON.stringify({
					status: 'error',
					message: 'Missing or invalid token'
				})
			}
		}
	}

	// Get the review from the URL (cache-bust to ensure fresh data)
	const reviewUrl = new URL(data.url);
	reviewUrl.searchParams.set('_', Date.now());
	const review = await fetch(reviewUrl.toString())
		.then(data => data.json());

	// Make sure the review has all the right data
	const requiredFields = ['title', 'rating', 'date', 'canonical', 'body', 'breweries', 'image'];
	const missingFields = requiredFields.filter(f => !review.hasOwnProperty(f) || !review[f]);

	if (missingFields.length) {
		return {
			statusCode: 400,
			body: JSON.stringify({
				status: 'error',
				message: `Missing or invalid data from returned JSON (missing: ${missingFields.join(', ')})`,
				review
			})
		}
	}

	// Get existing posts and make sure we've not done this before
	const beerCanonicals = aliasesData.beers || {};

	if(beerCanonicals[review.canonical]) {
		return {
			statusCode: 400,
			body: JSON.stringify({
				status: 'error',
				message: 'Beer already exists',
				canonical: review.canonical
			})
		}
	}

	// Use locally bundled aliases data (auto-generated from 11ty build)
	let breweryAliases = aliasesData.breweries || {};
	let shopAliases = aliasesData.shops || {};
	let styleAliases = aliasesData.styles || {};

	// Initialize API for production
	let api;
	if (!isDev) {
		api = new Octokit({
			auth: process.env.GITHUB_TOKEN,
		});
	}

	/**
	* Data processing - Helper to process entity (brewery, shop, style)
	*/
	const processEntity = (title, type, aliases) => {
		let slug = slugify(title);
		if (aliases[slug]) {
			slug = aliases[slug];
		}
		return {
			title,
			slug,
			permalink: `${type}/${slug}/`
		};
	};

	let commitFiles = [];
	const projectRoot = isDev ? process.cwd() : '/tmp';

	// Process breweries
	const breweries = review.breweries.map(brewery => ({
		...processEntity(brewery.title, 'brewery', breweryAliases),
		...brewery
	}));
	const brewerySlugs = breweries.map(b => b.slug);
	const breweryPaths = breweries.map(b => b.permalink);
	const breweryNames = breweries.map(b => b.title);

	// Process shop (purchased)
	const purchased = review.purchased ? processEntity(review.purchased, 'shop', shopAliases) : null;
	if (purchased) {
		review.purchased = purchased.permalink;
	}

	// Process style
	const style = review.style ? processEntity(review.style, 'style', styleAliases) : null;

	// Set review permalinks
	review.breweries = breweryPaths;
	review.permalink = `beer/${slugify(`${review.title} ${brewerySlugs.join(' ')}`)}/`;

	// Handle file creation for all entities in parallel - each brewery/shop/style
	// check is an independent GitHub/filesystem lookup, so there's no need to
	// serialise them.
	const [breweryCommitFiles, shopCommitFiles, styleCommitFiles, reviewImageBuffer] = await Promise.all([
		Promise.all(breweries.map(brewery =>
			handleBrewery(brewery, isDev, projectRoot, api, repoOwner, repoName, repoBranch)
		)),
		purchased ? handleShop(purchased, isDev, projectRoot, api, repoOwner, repoName, repoBranch) : [],
		style ? handleStyle(style, isDev, projectRoot, api, repoOwner, repoName, repoBranch) : [],
		fetchImageBuffer(review.image)
	]);

	const originalImage = review.image;

	commitFiles.push(...breweryCommitFiles.flat());
	commitFiles.push(...shopCommitFiles);
	commitFiles.push(...styleCommitFiles);

	/**
	 * Image
	 */

	const [imageLargeBuffer, imageSmallBuffer] = await Promise.all([
		processImage(reviewImageBuffer, 1000, 1000),
		processImage(reviewImageBuffer, 200, 200)
	]);

	commitFiles.push(
		createCommitFile(
			`app/content/images/${review.permalink}image.webp`,
			imageLargeBuffer.toString('base64'),
			'base64'
		)
	);

	commitFiles.push(
		createCommitFile(
			`app/content/images/${review.permalink}thumbnail.webp`,
			imageSmallBuffer.toString('base64'),
			'base64'
		)
	);

	/**
	* Data cleanup
	*/
	let date = review.date;

	review.rating = parseFloat(review.rating);
	review.review = review.body;

	delete review.body;
	delete review.token;
	delete review.status;
	delete review.image;
	delete review.date;

	const reviewFilePath = `app/content/beer/${slugify(`${date} ${review.title}`)}.md`;

	commitFiles.push(
		createCommitFile(
			reviewFilePath,
			matter.stringify('', review, { language: 'json', spaces: 4 })
		)
	);

	// New/existing status for each brewery and the shop, based on whether
	// handleBrewery/handleShop found a file already there (empty array)
	// or had to queue one up (non-empty array).
	const breweryReport = breweries.map((brewery, i) => ({
		title: brewery.title,
		status: breweryCommitFiles[i].length > 0 ? 'new' : 'existing',
	}));

	const shopReport = purchased
		? { title: purchased.title, status: shopCommitFiles.length > 0 ? 'new' : 'existing' }
		: null;

	let commitResult;

	if (isDev) {
		// Dev mode: Write files locally and commit with git
		try {
			for (const file of commitFiles) {
				const fullPath = path.join(projectRoot, file.filePath);
				const dir = path.dirname(fullPath);

				// Create directory if it doesn't exist
				if (!fs.existsSync(dir)) {
					fs.mkdirSync(dir, { recursive: true });
				}

				// Write file
				if (file.encoding === 'base64') {
					fs.writeFileSync(fullPath, Buffer.from(file.content, 'base64'));
				} else {
					fs.writeFileSync(fullPath, file.content);
				}

				console.log(`Created: ${file.filePath}`);
			}

			// Git add and commit
			const filePaths = commitFiles.map(f => f.filePath).join(' ');
			execSync(`git add ${filePaths}`, { cwd: projectRoot });
			execSync(`git commit -m "API: Add ${review.title}"`, { cwd: projectRoot });

			console.log('Files committed successfully');

			commitResult = { success: true, message: `API: Add ${review.title}` };
		} catch(e) {
			console.error('Dev mode error:', e);
			commitResult = { success: false, message: `${e.message}\n\nAttempted files:\n${commitFiles.map(f => f.filePath).join('\n')}` };
		}
	} else {
		// Production mode: Use GitHub API
		try {
			await createGithubCommit(
				api,
				repoOwner,
				repoName,
				repoBranch,
				`API: Add ${review.title}`,
				commitFiles
			);
			commitResult = { success: true, message: `API: Add ${review.title}` };
		} catch(e) {
			console.error(e);
			commitResult = { success: false, message: `${e.description || e.message}\n\nAttempted files:\n${commitFiles.map(f => f.filePath).join('\n')}` };
		}
	}

	/**
	 * Queue a post on Buffer (e.g. for Instagram) for the new review.
	 * Only attempted if the commit succeeded and BUFFER_ACCESS_TOKEN and
	 * BUFFER_PROFILE_IDS are configured. Failures here are non-fatal -
	 * the beer has already been committed by this point.
	 */
	const bufferResult = { configured: false, success: null, message: null };

	if (commitResult.success && process.env.BUFFER_ACCESS_TOKEN && process.env.BUFFER_PROFILE_IDS) {
		bufferResult.configured = true;

		try {
			const profileIds = process.env.BUFFER_PROFILE_IDS.split(',').map(id => id.trim()).filter(Boolean);

			const occupiedDays = await getOccupiedDays(profileIds, process.env.BUFFER_ACCESS_TOKEN);
			const scheduledAt = pickScheduledTime(occupiedDays);

			const caption = [
				`🍺 ${review.title}`,
				`🏢 ${breweryNames.join(', ')}`,
				`📝 ${review.review}`,
				`🏅 ${review.rating}/10`
			].join('\n');

			const body = new URLSearchParams();
			body.append('access_token', process.env.BUFFER_ACCESS_TOKEN);
			body.append('text', caption);
			body.append('media[photo]', originalImage);
			body.append('scheduled_at', Math.floor(scheduledAt.getTime() / 1000));
			for (const profileId of profileIds) {
				body.append('profile_ids[]', profileId);
			}

			const bufferResponse = await fetch('https://api.bufferapp.com/1/updates/create.json', {
				method: 'POST',
				headers: { 'content-type': 'application/x-www-form-urlencoded' },
				body: body.toString(),
			});

			const bufferBody = await bufferResponse.text();

			if (bufferResponse.ok) {
				bufferResult.success = true;
				bufferResult.message = `Scheduled for ${scheduledAt.toUTCString()}`;

				// Track the created update(s) so resolve-instagram-links can
				// later look up the live post URL once Buffer sends it, and
				// link it back onto this beer. Non-fatal if it fails - it
				// just means this one beer won't get auto-linked.
				try {
					const updateIds = (JSON.parse(bufferBody).updates || []).map(u => u.id).filter(Boolean);
					if (updateIds.length) {
						await addPending({
							permalink: review.permalink,
							filePath: reviewFilePath,
							buffer_update_ids: updateIds,
							addedAt: new Date().toISOString(),
						});
					}
				} catch (e) {
					console.error('Failed to queue pending Instagram link lookup:', e.message);
				}
			} else {
				bufferResult.success = false;
				bufferResult.message = `${bufferResponse.status}: ${bufferBody}`;
				console.error('Buffer API error:', bufferResponse.status, bufferBody);
			}
		} catch (e) {
			bufferResult.success = false;
			bufferResult.message = e.message;
			console.error('Failed to queue Buffer post:', e.message);
		}
	}

	return {
		statusCode: commitResult.success ? 200 : 500,
		headers: { 'content-type': 'text/html;charset=UTF-8' },
		body: renderReport({
			title: review.title,
			breweries: breweryReport,
			shop: shopReport,
			commit: commitResult,
			buffer: bufferResult,
		}),
	};
};

function escapeHtml(value) {
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function statusBadge(label, status) {
	return `<span class="badge ${status}">${escapeHtml(label)}</span>`;
}

/**
 * Render a small mobile-friendly summary page for the result of an
 * add-beer request - what was new vs. already existed, whether the
 * commit succeeded, and what happened with the Buffer post.
 */
function renderReport({ title, breweries, shop, commit, buffer }) {
	const breweryItems = breweries.length
		? breweries.map(b => `<li><span>${escapeHtml(b.title)}</span>${statusBadge(b.status, b.status)}</li>`).join('')
		: '<li><span>None</span></li>';

	const shopItem = shop
		? `<li><span>${escapeHtml(shop.title)}</span>${statusBadge(shop.status, shop.status)}</li>`
		: '<li><span>None</span></li>';

	const bufferStatus = !buffer.configured ? 'skipped' : (buffer.success ? 'success' : 'failure');
	const bufferLabel = !buffer.configured ? 'Not configured' : (buffer.success ? 'Success' : 'Failure');

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,minimum-scale=1">
<title>${escapeHtml(title)} - Add Beer</title>
<style>
	:root { color-scheme: light dark; }
	* { box-sizing: border-box; }
	body {
		margin: 0;
		padding: 1.5rem 1rem 3rem;
		font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
		background: #f4f4f4;
		color: #1a1a1a;
	}
	.wrap { max-width: 32rem; margin: 0 auto; }
	h1 { font-size: 1.35rem; margin: 0 0 1.25rem; word-break: break-word; }
	.card {
		background: #fff;
		border-radius: 10px;
		padding: 1rem 1.1rem;
		margin-bottom: 1rem;
		box-shadow: 0 1px 3px rgba(0,0,0,.12);
	}
	.card h2 {
		font-size: .75rem;
		text-transform: uppercase;
		letter-spacing: .04em;
		color: #777;
		margin: 0 0 .6rem;
	}
	ul { list-style: none; margin: 0; padding: 0; }
	li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: .75rem;
		padding: .4rem 0;
		border-bottom: 1px solid #eee;
	}
	li:last-child { border-bottom: none; }
	li span:first-child { word-break: break-word; }
	.badge {
		flex-shrink: 0;
		display: inline-block;
		padding: .15rem .55rem;
		border-radius: 999px;
		font-size: .72rem;
		font-weight: 600;
		text-transform: capitalize;
		white-space: nowrap;
	}
	.badge.new, .badge.success { background: #e3f5e6; color: #1c7c31; }
	.badge.existing, .badge.skipped { background: #eceff3; color: #5a6472; }
	.badge.failure { background: #fbe4e2; color: #b3261e; }
	.message {
		margin-top: .5rem;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: .78rem;
		color: #555;
		word-break: break-word;
		white-space: pre-wrap;
	}
	a.button {
		display: block;
		text-align: center;
		margin-top: 1.5rem;
		padding: .8rem 1rem;
		background: #4A90BE;
		color: #fff;
		border-radius: 8px;
		text-decoration: none;
		font-weight: 600;
	}
	@media (prefers-color-scheme: dark) {
		body { background: #17181a; color: #eee; }
		.card { background: #232427; box-shadow: none; }
		.card h2 { color: #9aa0a6; }
		li { border-bottom-color: #333; }
		.message { color: #aaa; }
		.badge.new, .badge.success { background: #16341f; color: #7fd996; }
		.badge.existing, .badge.skipped { background: #2c2e33; color: #b3b9c2; }
		.badge.failure { background: #3a1a18; color: #f39a94; }
	}
</style>
</head>
<body>
<div class="wrap">
	<h1>${escapeHtml(title)}</h1>

	<div class="card">
		<h2>Brewery</h2>
		<ul>${breweryItems}</ul>
	</div>

	<div class="card">
		<h2>Shop</h2>
		<ul>${shopItem}</ul>
	</div>

	<div class="card">
		<h2>Commit</h2>
		<ul><li><span>Status</span>${statusBadge(commit.success ? 'Success' : 'Failure', commit.success ? 'success' : 'failure')}</li></ul>
		<div class="message">${escapeHtml(commit.message)}</div>
	</div>

	<div class="card">
		<h2>Buffer</h2>
		<ul><li><span>Status</span>${statusBadge(bufferLabel, bufferStatus)}</li></ul>
		${buffer.message ? `<div class="message">${escapeHtml(buffer.message)}</div>` : ''}
	</div>

	<a class="button" href="/add-beer/">← Add another beer</a>
</div>
</body>
</html>`;
}
