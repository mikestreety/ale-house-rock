const fetch = require('node-fetch');
const matter = require('gray-matter');
const { Gitlab } = require('@gitbeaker/node');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const slugify = require('./slugify');
const { handleBrewery, handleShop, handleStyle, fetchAndProcessImage, createCommitFile } = require('./file-handler');

require('dotenv').config();

// Load aliases data (auto-generated from 11ty build)
let aliasesData = {};
try {
	aliasesData = require('./aliases-data.json');
} catch(e) {
	console.warn('Could not load aliases data:', e.message);
}

const repoId = 25096202; // real repo
// const repoId = 38315485; // test repo
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

	// Get the review from the URL
	const review = await fetch(data.url)
		.then(data => data.json());

	// Make sure the review has all the right data
	if (
		!review.hasOwnProperty('title') ||
		!review.hasOwnProperty('rating') ||
		!review.hasOwnProperty('date') ||
		!review.hasOwnProperty('canonical') ||
		// !review.hasOwnProperty('tags') ||
		!review.hasOwnProperty('body') ||
		!review.hasOwnProperty('breweries')
	) {
		return {
			statusCode: 400,
			body: JSON.stringify({
				status: 'error',
				message: 'Missing data from returned JSON',
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
		api = new Gitlab({
			token: process.env.GITLAB_TOKEN,
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
	review.permalink = `beer/${slugify(`${review.title} ${brewerySlugs.join(' ')}`)}/ `;

	// Handle file creation for all entities in a single section
	for (const brewery of breweries) {
		commitFiles.push(...await handleBrewery(brewery, isDev, projectRoot, api, repoId, repoBranch));
	}

	if (purchased) {
		commitFiles.push(...await handleShop(purchased, isDev, projectRoot, api, repoId, repoBranch));
	}

	if (style) {
		commitFiles.push(...await handleStyle(style, isDev, projectRoot, api, repoId, repoBranch));
	}
	/**
	 * Image
	 */

	const imageLarge = await fetchAndProcessImage(review.image, 1000, 1000);
	commitFiles.push(
		createCommitFile(
			`app/content/images/${review.permalink}image.webp`,
			imageLarge.base64,
			'base64'
		)
	);

	const imageSmall = await fetchAndProcessImage(review.image, 200, 200);
	commitFiles.push(
		createCommitFile(
			`app/content/images/${review.permalink}thumbnail.webp`,
			imageSmall.base64,
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
		// Production mode: Use GitLab API
		try {
			await api.Commits.create(
				repoId,
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
					message: e.description,
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
