const fetch = require('node-fetch');
const matter = require('gray-matter');
const sharp = require('sharp');
const { Gitlab } = require('@gitbeaker/node');

const slugify = require('./slugify');

require('dotenv').config();

// const repoId = 25096202; // real repo
const repoId = 38315485; // test repo
const repoBranch = 'main';


// const repo = 25096202 // real repo
const repo = 38315485 // test repo

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
				message: 'Missing data'
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
		!review.hasOwnProperty('tags') ||
		!review.hasOwnProperty('body') ||
		!review.hasOwnProperty('breweries')
	) {
		return {
			statusCode: 400,
			body: JSON.stringify({
				status: 'error',
				message: 'Missing data'
			})
		}
	}

	// Sort the breweries
	review.breweries.sort();

	// Get existing posts and make sure we've not done this before
	let canonicals = await fetch('https://alehouse.rocks/api/canonicals.json')
		.then(data => data.json());

	if(canonicals[review.canonical]) {
		return {
			statusCode: 400,
			body: JSON.stringify({
				status: 'error',
				message: 'Beer already exists'
			})
		}
	}

	// Start new Gitlab instance
	const api = new Gitlab({
		token: process.env.GITLAB_TOKEN,
	});

	/**
	* Data processing
	*/
	let body = review.body;
	let commitFiles = [];

	review.number = parseFloat(Object.keys(canonicals).length + 1);
	review.number = 720;
	review.permalink = `beer/${slugify(
		`${review.title} ${review.breweries.join(' ')} ${review.number}`
	)}/`;

	/**
	* Breweries
	*/
	let brewerySlugs = [];
	for (const breweryName of review.breweries) {

		let slug = slugify(breweryName),
		brewery = {
			title: breweryName,
			permalink: `brewery/${slug}/`,
			beers: [
				review.permalink
			]
		};
		brewerySlugs.push(brewery.permalink);

		let fileExists = false,
			filePath = 'app/content/brewery/' + slug + '.md';

		try {
			// Try getting the original file
			let file = await api.RepositoryFiles.showRaw(repoId, path, {ref: repoBranch});
			// Try decoding the original file
			let content = matter(file);
			if(!content.data.beers.includes(review.permalink)) {
				content.data.beers.push(review.permalink);
				content = matter.stringify(content.content, content.data)

				commitFiles.push({
					action: 'update',
					filePath,
					content,
				});
			}

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
	review.breweries = brewerySlugs;
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
			'API: Add ' + review.title,
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
		statusCode: 200,
		body: JSON.stringify(review)
	};
};
