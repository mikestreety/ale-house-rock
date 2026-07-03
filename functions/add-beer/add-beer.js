const fetch = require('node-fetch');
const matter = require('gray-matter');
const { Octokit } = require('@octokit/rest');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const slugify = require('./slugify');
const { handleBrewery, handleShop, handleStyle, fetchImageBuffer, processImage, createCommitFile, createGithubCommit } = require('./file-handler');

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

	commitFiles.push(
		createCommitFile(
			`app/content/beer/${slugify(`${date} ${review.title}`)}.md`,
			matter.stringify('', review, { language: 'json', spaces: 4 })
		)
	);

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

		} catch(e) {
			console.error('Dev mode error:', e);
			return {
				statusCode: 500,
				body: JSON.stringify({
					status: 'error',
					message: e.message,
					commitFiles: commitFiles.map(item => {
						return {
							action: item.action,
							filePath: item.filePath,
						}
					})
				})
			}
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
		} catch(e) {
			console.log(e);
			return {
				statusCode: 500,
				body: JSON.stringify({
					status: 'error',
					message: e.description || e.message,
					commitFiles: commitFiles.map(item => {
						return {
							action: item.action,
							filePath: item.filePath,
						}
					})
				})
			}
		}
	}

	return {
		statusCode: 301,
		headers: {
			'Location': '/add-beer/',
		},
	};
};
