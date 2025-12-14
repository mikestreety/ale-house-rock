const fetch = require('node-fetch');
const matter = require('gray-matter');
const sharp = require('sharp');
const { Gitlab } = require('@gitbeaker/node');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const slugify = require('./slugify');

require('dotenv').config();

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

	// Determine base URL for API calls
	const baseUrl = isDev ? 'http://localhost:8888' : 'https://alehouse.rocks';

	// Get existing posts and make sure we've not done this before
	let beerCanonicals = await fetch(`${baseUrl}/api/beers/canonicals.json`)
		.then(data => data.json())
		.catch(() => ({}));

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

	// Get existing posts and make sure we've not done this before
	let breweryAliases = await fetch(`${baseUrl}/api/breweries/aliases.json`)
		.then(data => data.json())
		.catch(() => ({}));

	let shopAliases = await fetch(`${baseUrl}/api/shops/aliases.json`)
		.then(data => data.json())
		.catch(() => ({}));

	let styleAliases = await fetch(`${baseUrl}/api/styles/aliases.json`)
		.then(data => data.json())
		.catch(() => ({})); // Return empty object if endpoint doesn't exist yet

	// Initialize API for production
	let api;
	if (!isDev) {
		api = new Gitlab({
			token: process.env.GITLAB_TOKEN,
		});
	}

	/**
	* Data processing
	*/
	let body = review.body;
	let commitFiles = [];

	/**
	* Breweries
	*/
	let breweries = [],
		breweryPaths = [],
		brewerySlugs = [];

	for (const brewery of review.breweries) {
		let slug = slugify(brewery.title);

		// If we know this brewery by another name
		if (breweryAliases[slug]) {
			slug = breweryAliases[slug];
		}

		brewery.permalink = `brewery/${slug}/`;
		brewery.slug = slug;

		breweries.push(brewery);
		brewerySlugs.push(slug);
		breweryPaths.push(brewery.permalink);
	}

	let purchased = {};
	if(review.purchased) {
		let purchasedSlug = slugify(review.purchased);
		if(shopAliases[purchasedSlug]) {
			purchasedSlug = shopAliases[purchasedSlug];
		}

		purchased.title = review.purchased,
		purchased.permalink =`shop/${purchasedSlug}/`,
		purchased.slug = purchasedSlug

		review.purchased = purchased.permalink;
	}

	/**
	* Styles
	*/
	let style = {};
	if(review.style) {
		let styleSlug = slugify(review.style);
		if(styleAliases[styleSlug]) {
			styleSlug = styleAliases[styleSlug];
		}

		style.title = review.style;
		style.permalink = `style/${styleSlug}/`;
		style.slug = styleSlug;
	}

	review.breweries = breweryPaths;
	review.permalink = `beer/${slugify(
		`${review.title} ${brewerySlugs.join(' ')}`
	)}/`;

	// Get project root directory
	const projectRoot = isDev ? process.cwd() : '/tmp';
	const contentRoot = isDev ? path.join(projectRoot, 'app/content') : 'app/content';

	for (const brewery of breweries) {
		let fileExists = false,
			filePath = 'app/content/brewery/' + brewery.slug + '.md';

		if (isDev) {
			// Check if file exists locally
			const localPath = path.join(projectRoot, filePath);
			fileExists = fs.existsSync(localPath);
		} else {
			// Check GitLab
			try {
				await api.RepositoryFiles.showRaw(repoId, filePath, {ref: repoBranch});
				fileExists = true;
			} catch(e) {
				console.log('Brewery does not exist');
			}
		}

		if(!fileExists) {
			if (brewery.image) {
				let image = await fetch(brewery.image);
				let imageBuffer = await image.buffer()

				let imageLarge = await sharp(imageBuffer)
					.resize(300, 300, {
						fit: 'contain', 'background': { r: 255, g: 255, b: 255, alpha: 1 }
					})
					.webp({ lossless: true })
					.toBuffer();
				commitFiles.push({
					action: 'create',
					filePath: `app/content/images/brewery/${brewery.slug}/image.webp`,
					content: imageLarge.toString('base64'),
					encoding: 'base64'
				});

			}

			let description = brewery.description;
			delete brewery.image;
			delete brewery.slug;
			delete brewery.description;

			commitFiles.push({
				action: 'create',
				filePath,
				content: matter.stringify("\n" + description, brewery),
			});
		}
	}

	if(review.purchased) {
		let purchasedFileExists = false,
			purchasedFilePath = 'app/content/shop/' + purchased.slug + '.md';

		delete purchased.slug;

		if (isDev) {
			// Check if file exists locally
			const localPath = path.join(projectRoot, purchasedFilePath);
			purchasedFileExists = fs.existsSync(localPath);
		} else {
			// Check GitLab
			try {
				await api.RepositoryFiles.showRaw(repoId, purchasedFilePath, {ref: repoBranch});
				purchasedFileExists = true;
			} catch(e) {
				console.log('Shop does not exist');
			}
		}

		if(!purchasedFileExists) {
			commitFiles.push({
				action: 'create',
				filePath: purchasedFilePath,
				content: matter.stringify("\n", purchased),
			});
		}
	}

	if(review.style) {
		let styleFileExists = false,
			styleFilePath = 'app/content/style/' + style.slug + '.md';

		delete style.slug;

		if (isDev) {
			// Check if file exists locally
			const localPath = path.join(projectRoot, styleFilePath);
			styleFileExists = fs.existsSync(localPath);
		} else {
			// Check GitLab
			try {
				await api.RepositoryFiles.showRaw(repoId, styleFilePath, {ref: repoBranch});
				styleFileExists = true;
			} catch(e) {
				console.log('Style does not exist');
			}
		}

		if(!styleFileExists) {
			commitFiles.push({
				action: 'create',
				filePath: styleFilePath,
				content: matter.stringify("\n", style),
			});
		}
	}
	/**
	 * Image
	 */

	let image = await fetch(review.image);
	let imageBuffer = await image.buffer()

	let imageLarge = await sharp(imageBuffer)
		.resize(1000, 1000)
		.webp({ lossless: true })
		.toBuffer();
	commitFiles.push({
		action: 'create',
		filePath: `app/content/images/${review.permalink}image.webp`,
		content: imageLarge.toString('base64'),
		encoding: 'base64'
	});

	let imageSmall = await sharp(imageBuffer)
		.resize(200, 200)
		.webp({ lossless: true })
		.toBuffer();
	commitFiles.push({
		action: 'create',
		filePath: `app/content/images/${review.permalink}thumbnail.webp`,
		content: imageSmall.toString('base64'),
		encoding: 'base64'
	});

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

	commitFiles.push({
		action: 'create',
		filePath: `app/content/beer/${slugify(`${date} ${review.title}`)}.md`,
		content: matter.stringify('', review, { language: 'json', spaces: 4 })
	});

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
			let c = await api.Commits.create(
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
