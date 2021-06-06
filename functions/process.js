const fs = require('fs');
const cloudinary = require('cloudinary').v2;

const slugify = require('../app/filters/slugify');
const meanMedianMode = require('../app/filters/meanMedianMode');

require('dotenv').config();

cloudinary.config({
	cloud_name: process.env.cloudinary.cloud_name,
	api_key: process.env.cloudinary.api_key,
	api_secret: process.env.cloudinary.api_secret,
});

const regex = [
	['title', /🍺(.*?)\n/],
	['brewery', /🏢(.*?)\n/],
	['description', /📝(.*?)\n/],
	['rating', /🏅\s?([0-9]?.?[0-9])\/[0-9]{2}/],
	['hashtags', /\n(#.*?)$/],
];

let number = 1;

function processBeers(raw, images) {

	let beers = raw.data.map(item => {

		let [date, desc, link, image] = item,
			result = '',
			cloud_image = '';

			attrs = {
				number: number++
			};

		for(let attr of regex) {
			result = attr[1].exec(desc);
			attrs[attr[0]] = result && result.length > 1 ? result[1].trim() : '';
		}

		d = /(...) ([0-9]?.?[0-9]), ([0-9]{4}) at ([0-9]{2}):([0-9]{2})(..)/.exec(date);
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

		breweries[beer.brewery_slug].beers.push({
			title: beer.title,
			brewery: beer.brewery,
			rating: beer.rating,
			number: beer.number,
		})
	}

	breweries =  Object.values(breweries);

	for (let brewery of breweries) {
		let ratings = brewery.beers
			.map(a => Number(a.rating));

		brewery.meta = meanMedianMode(ratings);
		brewery.beers = brewery.beers
			.sort((a, b) => parseInt(a.number) + parseInt(b.number))
			.reverse();
	}

	return breweries.sort((a, b) => a.title.localeCompare(b.title));;
}

function loadFile(path) {
	let data = '[]';

	if(fs.existsSync(path)) {
		let raw_data  = fs.readFileSync(path, {encoding: 'utf8'});

		if(raw_data.length) {
			data = raw_data;
		}
	}

	return JSON.parse(data);
}

function saveFile(path, data) {
	fs.writeFile(path, JSON.stringify(data), function (err) {
		if (err) return console.log(err);
	});
}

exports.handler = async function(event, context) {
	let path = './api',
		raw_data = loadFile(`${path}/raw.json`),
		beers_saved = loadFile(`${path}/beers.json`);

	if(raw_data.length == 0) {
		return {
			statusCode: 200,
			body: `No raw file`
		}
	}

	if(beers_saved.length === raw_data.data.length) {
		// return {
		// 	statusCode: 200,
		// 	body: `No update`
		// }
	}

	let beers = processBeers(raw_data, loadFile(`${path}/images.json`)),
		breweries = processBreweries(beers);

	if (!fs.existsSync(path)){
		fs.mkdirSync(path);
	}

	if(beers.length && breweries.length) {
		saveFile(`${path}/beers.json`, beers);
		saveFile(`${path}/breweries.json`, breweries);
	}

	return {
		statusCode: 200,
		body: `${beers.length} beers, ${breweries.length} breweries`
	}
}
