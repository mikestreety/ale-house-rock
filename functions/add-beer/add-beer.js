/**
* http://localhost:8888/.netlify/functions/add-beer?url=https://untappd-scaper.mikestreety.workers.dev/user/mikestreety/checkin/1192455594&token=123
*/

const fetch = require('node-fetch');
const matter = require('gray-matter');
const sharp = require('sharp');
const { Gitlab } = require('@gitbeaker/node');

require('dotenv').config();

// const repoId = 25096202; // real repo
const repoId = 38315485; // test repo
const repoBranch = 'main';

const slugify = str => {
	if(str) {
		str = str.replace(/^\s+|\s+$/g, ''); // trim
		str = str.toLowerCase();

		// remove accents, swap ñ for n, etc
		var from = "àáäâèéëêìíïîòóöôùúüûñç·/_,:;";
		var to   = "aaaaeeeeiiiioooouuuunc------";
		for (var i = 0, l = from.length ; i<l ; i++) {
			str = str.replace(new RegExp(from.charAt(i), 'g'), to.charAt(i));
		}

		str = str.replace(/[^a-z0-9 -]/g, '') // remove invalid chars
		.replace(/\s+/g, '-') // collapse whitespace and replace by -
		.replace(/-+/g, '-'); // collapse dashes
	}

	return str;
}

// const repo = 25096202 // real repo
const repo = 38315485 // test repo

exports.handler = async (event, context) => {

	let data = event.queryStringParameters;

	/**
	* Data validation
	*/
	if (
		!data.hasOwnProperty('url') ||
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

	const review = await fetch(data.url)
		.then(data => data.json());

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

	review.breweries.sort();

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

	const api = new Gitlab({
		token: process.env.GITLAB_TOKEN,
	});

	/**
	* Data processing
	*/
	let body = review.body;
	review.number = parseFloat(Object.keys(canonicals).length + 1);
	review.permalink = `beer/${slugify(
		`${review.title} ${review.breweries.join(' ')} ${review.number}`
	)}/`;

	/**
	* Breweries
	*/
	let brewerySlugs = [];
	for (const brewery of review.breweries) {

		let slug = slugify(brewery),
		b = {
			title: brewery,
			permalink: `brewery/${slug}/`,
			beers: [
				review.permalink
			]
		};
		brewerySlugs.push(b.permalink);

		let fileExists = false,
		path = 'app/content/' + slug + '.md';

		try {
			let file = await api.RepositoryFiles.showRaw(repoId, path, {ref: repoBranch});
			let contents = matter(file);
			if(!contents.data.beers.includes(review.permalink)) {
				contents.data.beers.push(review.permalink);
				contents = matter.stringify(contents.content, contents.data)
				file = await api.RepositoryFiles.edit(
					repoId,
					path,
					repoBranch,
					contents,
					'API: Edit ' + b.title
				);
			}
			fileExists = true;
		} catch(e) {
			console.log('Brewery exists');
		}

		if(!fileExists) {
			let c = await api.Commits.create(
				repoId,
				repoBranch,
				'API: Add ' + b.title,
				[
					{
						action: 'create',
						filePath: path,
						content: matter.stringify("\n", b)
					},
				]
			);
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

	let imageSmall = await sharp(imageBuffer)
		.resize(200, 200)
		.webp({ lossless: true })
		.toBuffer();

	/**
	* Data cleanup
	*/
	review.breweries = brewerySlugs;
	review.rating = parseFloat(review.rating);

	delete review.body;
	delete review.token;
	delete review.status;
	delete review.image;

	try {
		let c = await api.Commits.create(
			repoId,
			repoBranch,
			'API: Add ' + review.title,
			[
				{
					action: 'create',
					filePath: `app/content/beer/${slugify(`${review.number} ${review.title}`)}.md`,
					content: matter.stringify("\n" + body, review)
				},
				{
					action: 'create',
					filePath: `app/content/images/${review.number}/image.webp`,
					content: imageLarge.toString('base64'),
					encoding: 'base64'
				},
				{
					action: 'create',
					filePath: `app/content/images/${review.number}/thumbnail.webp`,
					content: imageSmall.toString('base64'),
					encoding: 'base64'
				},
			]
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
