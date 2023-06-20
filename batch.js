const fetch = require('node-fetch');
const matter = require('gray-matter');
const fs = require('fs');
const sharp = require('sharp');

function slugify(str) {
	if (str) {
		str = str.replace(/^\s+|\s+$/g, ''); // trim
		str = str.toLowerCase();

		// remove accents, swap ñ for n, etc
		var from = "àáäâèéëêìíïîòóöôùúüûñç·/_,:;";
		var to = "aaaaeeeeiiiioooouuuunc------";
		for (var i = 0, l = from.length; i < l; i++) {
			str = str.replace(new RegExp(from.charAt(i), 'g'), to.charAt(i));
		}

		str = str.replace(/[^a-z0-9 -]/g, '') // remove invalid chars
			.replace(/\s+/g, '-') // collapse whitespace and replace by -
			.replace(/-+/g, '-'); // collapse dashes
	}

	return str;
}


async function process() {
	let beerCanonicals = await fetch('https://alehouse.rocks/api/beers/canonicals.json')
		.then(data => data.json());

	let breweryAliases = await fetch('https://alehouse.rocks/api/breweries/aliases.json')
		.then(data => data.json());

	for(let can in beerCanonicals) {
		if (can.includes('instagram.com')) {
			continue;
		}
		console.log(can);

		const review = await fetch(can.replace('https://untappd.com', 'https://untappd.alehouse.rocks'))
			.then(data => data.json());

		for (const brewery of review.breweries) {
			let slug = slugify(brewery.title);

			if (breweryAliases[slug]) {
				slug = breweryAliases[slug];
			}

			if (slug == 'yonder-brewing') {
				slug = 'yonder-brewing-blending'
			}
			if (slug == 'pressure-drop-brewing-uk') {
				slug = 'pressure-drop'
			}

			if (fs.existsSync(`app/content/images/brewery/${slug}/image.webp`)) {
				continue;
			}
			const data = fs.readFileSync(`./app/content/brewery/${slug}.md`, 'utf8');

			brewery.permalink = `brewery/${slug}/`;
			if (brewery.image && !fs.existsSync(`app/content/images/brewery/${slug}/image.webp`)) {
				let image = await fetch(brewery.image);
				let imageBuffer = await image.buffer()

				let imageLarge = await sharp(imageBuffer)
					.resize(300, 300, {
						fit: 'contain', 'background': { r: 255, g: 255, b: 255, alpha: 1 }
					})
					.webp({ lossless: true })
					.toBuffer();

				fs.mkdirSync(`app/content/images/brewery/${slug}/`)
				fs.writeFileSync(`app/content/images/brewery/${slug}/image.webp`, imageLarge);


			}

			let description = brewery.description;
			delete brewery.image;
			delete brewery.description;

			let matterOutput = matter(data);

			let allBrewery = {
				...matterOutput.data,
				...brewery
			}


			fs.writeFileSync(`./app/content/brewery/${slug}.md`, matter.stringify("\n" + description, allBrewery));


			console.log(allBrewery);
		}
	}
}

process();
