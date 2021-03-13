const Cache = require('@11ty/eleventy-cache-assets');

module.exports = async function() {
	let url = "https://beer.mikestreety.co.uk/api/breweries.json";

	/* This returns a promise */
	const response = await Cache(url, {
		duration: "1d", // save for 1 day
		type: "json"    // we’ll parse JSON for you
	});

	let data = response.map((brewery) => {
		brewery.slug = `${brewery.title}`;

		let ratings = brewery.beers
			.map(beer => {
				beer.slug = `${beer.title} ${beer.brewery} ${beer.number}`;
				return beer;
			})
			.map(a => Number(a.rating));

		let average = ratings.reduce((a, b) => a + b, 0);
		average = average / brewery.beers.length;
		average = Math.round(average * 100) / 100;

		brewery.meta = {
			average
		};

		brewery.beers
			// .sort((a, b) => a.number.localeCompare(b.number))
			.reverse();

		return brewery;
	});

	return data.sort((a, b) => a.title.localeCompare(b.title));
};
