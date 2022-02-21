const cloudinary = require('./cloudinary');

const slugify = require('@mikestreety/11ty-utils/filters/slugify');
const meanMedianMode = require('./../../app/filters/meanMedianMode');

const regex = [
	['title', /🍺(.*?)\n/],
	['brewery', /🏢(.*?)\n/],
	['description', /📝(.*?)\n/],
	['rating', /🏅\s?([0-9]?.?[0-9])\/[0-9]{2}/],
	['hashtags', /\n(#.*?)$/],
];

module.exports = async function(csv, images) {
	let beers = processBeers(csv, images),
		breweries = processBreweries(beers);

	return {
		beers,
		breweries
	};
}

function processBeers(raw, images) {
	let number = 1;
	let beers = raw.data.map(item => {

		let [date, desc, link, image] = item,
			result = '';

			attrs = {
				number: number++
			};

		for(let attr of regex) {
			result = attr[1].exec(desc);
			attrs[attr[0]] = result && result.length > 1 ? result[1].trim() : '';
		}

		attrs.breweries = attrs.brewery.split(',').map(item => {
			let title = item.trim();

			return {
				title,
				slug: `/brewery/` + slugify(title)
			}
		});

		d = /(.*) ([0-9]?.?[0-9]), ([0-9]{4}) at ([0-9]{2}):([0-9]{2})(..)/.exec(date);
		attrs.date = `${d[2]} ${d[1]} ${d[3]} ${parseInt(d[4]) + (d[6] == 'pm' ? 12 : 0)}:${d[5]}:00 GMT`;

		attrs.code = /(?:\.am|\.com)\/p\/(.*?)\//.exec(link)[1];
		attrs.slug = `/beer/` + slugify(`${attrs.title} ${attrs.brewery} ${attrs.number}`);
		attrs.image = `${attrs.code}/image.jpg.webp`;

		let image_path = `alehouserock/${attrs.code}/image.jpg`;

		if(!images.includes(image_path)) {
			console.log(image_path);
			cloudinary.uploader.upload(
				image,
				{
					secure: true,
					public_id: image_path
				},
				function() {
				}
			);
		}

		return attrs;
	});

	return beers.reverse();
}

function processBreweries(beers) {
	let breweries = {};

	for(let beer of beers) {
		for(let brewery of beer.breweries) {
			let b = JSON.parse(JSON.stringify(brewery));
			if(!breweries[b.slug]) {
				b.beers = [];
				breweries[b.slug] = b;
			}

			breweries[b.slug].beers.push(beer)
		}
	}

	breweries = Object.values(breweries);

	for (let brewery of breweries) {
		let ratings = brewery.beers
			.map(a => Number(a.rating));

		brewery.meta = meanMedianMode(ratings);
		brewery.beers = brewery.beers
			.sort((a, b) => parseInt(a.number) + parseInt(b.number));
	}

	return breweries.sort((a, b) => a.title.localeCompare(b.title));;
}
