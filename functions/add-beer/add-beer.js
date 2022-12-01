const fetch = require('node-fetch');
const matter = require('gray-matter');
const sharp = require('sharp');
const { Gitlab } = require('@gitbeaker/node');

const slugify = require('./slugify');

require('dotenv').config();

const repoId = 25096202; // real repo
// const repoId = 38315485; // test repo
const repoBranch = 'main';

exports.handler = async (event, context) => {

	let data = event.queryStringParameters;

	/**
	* Data validation
	*/
	if (
		!data.hasOwnProperty('url') ||
		!data.hasOwnProperty('token') ||
		data.token !== process.env.ACCESS_TOKEN
	) {
		return {
			statusCode: 400,
			body: JSON.stringify({
				status: 'error',
				message: 'Missing GET params'
			})
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
				message: 'Missing data from returned JSON'
			})
		}
	}

	// Sort the breweries
	review.breweries.sort();

	// Get existing posts and make sure we've not done this before
	let beerCanonicals = await fetch('https://alehouse.rocks/api/beers/canonicals.json')
		.then(data => data.json());

	if(beerCanonicals[review.canonical]) {
		return {
			statusCode: 400,
			body: JSON.stringify({
				status: 'error',
				message: 'Beer already exists'
			})
		}
	}

	// Get existing posts and make sure we've not done this before
	let breweryAliases = await fetch('https://alehouse.rocks/api/breweries/aliases.json')
		.then(data => data.json());

	let shopAliases = await fetch('https://alehouse.rocks/api/shops/aliases.json')
		.then(data => data.json());

	// Start new Gitlab instance
	const api = new Gitlab({
		token: process.env.GITLAB_TOKEN,
	});

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

	for (const breweryName of review.breweries) {

		let slug = slugify(breweryName);

		// If we know this brewery by another name
		if(breweryAliases[slug]) {
			slug = breweryAliases[slug];
		}

		let brewery = {
			title: breweryName,
			permalink: `brewery/${slug}/`,
			slug
		};

		breweries.push(brewery);
		brewerySlugs.push(slug);
		breweryPaths.push(brewery.permalink);
	}

	let purchasedSlug = slugify(review.purchased);
	if(shopAliases[purchasedSlug]) {
		purchasedSlug = shopAliases[purchasedSlug];
	}
	let purchased = {
		title: review.purchased,
		permalink: `shop/${purchasedSlug}/`,
		slug: purchasedSlug
	}
	review.purchased = purchased.permalink;

	review.number = parseFloat(Object.keys(beerCanonicals).length + 1);
	review.breweries = breweryPaths;
	review.permalink = `beer/${slugify(
		`${review.title} ${brewerySlugs.join(' ')} ${review.number}`
	)}/`;


	for (const brewery of breweries) {
		let fileExists = false,
			filePath = 'app/content/brewery/' + brewery.slug + '.md';

		delete brewery.slug;

		try {
			// Try getting the original file
			await api.RepositoryFiles.showRaw(repoId, filePath, {ref: repoBranch});
			fileExists = true;
		} catch(e) {
			console.log('Brewery exists');
		}

		if(!fileExists) {
			commitFiles.push({
				action: 'create',
				filePath,
				content: matter.stringify("\n", brewery),
			});
		}
	}


	let purchasedFileExists = false,
		purchasedFilePath = 'app/content/shop/' + purchased.slug + '.md';

	delete purchased.slug;

	try {
		// Try getting the original file
		await api.RepositoryFiles.showRaw(repoId, purchasedFilePath, {ref: repoBranch});
		purchasedFileExists = true;
	} catch(e) {
		console.log('Shop exists');
	}
	if(!purchasedFileExists) {
		commitFiles.push({
			action: 'create',
			purchasedFilePath,
			content: matter.stringify("\n", purchased),
		});
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
		filePath: `app/content/images/${review.number}/image.webp`,
		content: imageLarge.toString('base64'),
		encoding: 'base64'
	});

	let imageSmall = await sharp(imageBuffer)
		.resize(200, 200)
		.webp({ lossless: true })
		.toBuffer();
	commitFiles.push({
		action: 'create',
		filePath: `app/content/images/${review.number}/thumbnail.webp`,
		content: imageSmall.toString('base64'),
		encoding: 'base64'
	});

	/**
	* Data cleanup
	*/

	review.rating = parseFloat(review.rating);

	delete review.body;
	delete review.token;
	delete review.status;
	delete review.image;

	commitFiles.push({
		action: 'create',
		filePath: `app/content/beer/${slugify(`${review.number} ${review.title}`)}.md`,
		content: matter.stringify("\n" + body, review)
	});

	try {
		let c = await api.Commits.create(
			repoId,
			repoBranch,
			`API: Add ${review.number} - ${review.title}`,
			commitFiles
		);
	} catch(e) {
		return {
			statusCode: 400,
			body: JSON.stringify({
				status: 'error',
				message: 'File already exists'
			})
		}
	}

	return {
		statusCode: 301,
		headers: {
			'Location': '/add-beer/',
		},
	};
};
