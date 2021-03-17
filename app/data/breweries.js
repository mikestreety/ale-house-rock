const Cache = require('@11ty/eleventy-cache-assets');
const slugify = require('./../filters/slugify');
const meanMedianMode = require('./../filters/meanMedianMode');

module.exports = async function() {
	let url = "https://beer.mikestreety.co.uk/api/breweries.json";

	/* This returns a promise */
	const response = await Cache(url, {
		duration: "1d", // save for 1 day
		type: "json"    // we’ll parse JSON for you
	});

	let data = response.map((brewery) => {
		brewery.slug = `/brewery/` + slugify(`${brewery.title}`);

		let ratings = brewery.beers
			.map(a => Number(a.rating));

		brewery.meta = meanMedianMode(ratings);

		brewery.beers = brewery.beers
			.map(beer => {
				beer.slug = `/beer/` + slugify(`${beer.title} ${beer.brewery} ${beer.number}`);
				return beer;
			})
			.sort((a, b) => parseInt(a.number) + parseInt(b.number))
			.reverse();

		return brewery;
	});

	return data.sort((a, b) => a.title.localeCompare(b.title));
};
