const fage = require('./file-age');
const fload = require('./file-load');
const fsave = require('./file-save');

const cloudinary = require('../cloudinary');

const slugify = require('./../../app/filters/slugify');
const meanMedianMode = require('./../../app/filters/meanMedianMode');

const regex = [
	['title', /🍺(.*?)\n/],
	['brewery', /🏢(.*?)\n/],
	['description', /📝(.*?)\n/],
	['rating', /🏅\s?([0-9]?.?[0-9])\/[0-9]{2}/],
	['hashtags', /\n(#.*?)$/],
];

module.exports = async function(paths) {
	let fetchData = fage(paths.beers),
		output = {
			status: false,
			message: 'Beers file less than an hour old, skipping'
		},
		rawData = fload(paths.raw),
		images = fload(paths.images);

	if(!rawData.length) {
		output.step = 1;
		output.message = 'No raw file found';
		return output;
	}

	if(fetchData) {
		output.message = 'Beers and breweries updating';

		let beers = processBeers(rawData, images),
			breweries = processBreweries(beers);

		if(beers.length && breweries.length) {
			fsave(paths.beers, beers);
			fsave(paths.breweries, breweries);

			output = {
				status: true,
				message: 'Beers and breweries updated'
			}
		}
	}

	return output;
}

function processBeers(raw, images) {
	let number = 1;
	let beers = raw.map(item => {

		let [date, desc, link, image] = item,
			result = '';

			attrs = {
				number: number++
			};

		for(let attr of regex) {
			result = attr[1].exec(desc);
			attrs[attr[0]] = result && result.length > 1 ? result[1].trim() : '';
		}

		d = /(.*) ([0-9]?.?[0-9]), ([0-9]{4}) at ([0-9]{2}):([0-9]{2})(..)/.exec(date);
		attrs.date = `${d[2]} ${d[1]} ${d[3]} ${parseInt(d[4]) + (d[6] == 'pm' ? 12 : 0)}:${d[5]}:00 GMT`;

		attrs.code = /\.am\/p\/(.*?)\//.exec(link)[1];
		attrs.slug = `/beer/` + slugify(`${attrs.title} ${attrs.brewery} ${attrs.number}`);
		attrs.brewery_slug = `/brewery/` + slugify(`${attrs.brewery}`);
		attrs.image = `${attrs.code}/image.jpg.webp`;

		let image_path = `alehouserock/${attrs.code}/image.jpg`;

		if(!images.includes(image_path)) {
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
		if(!breweries[beer.brewery_slug]) {
			breweries[beer.brewery_slug] = {
				title: beer.brewery,
				slug: beer.brewery_slug,
				beers: []
			}
		}

		breweries[beer.brewery_slug].beers.push(beer)
	}

	breweries =  Object.values(breweries);

	for (let brewery of breweries) {
		let ratings = brewery.beers
			.map(a => Number(a.rating));

		brewery.meta = meanMedianMode(ratings);
		brewery.beers = brewery.beers
			.sort((a, b) => parseInt(a.number) + parseInt(b.number));
	}

	return breweries.sort((a, b) => a.title.localeCompare(b.title));;
}
