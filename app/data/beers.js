const Cache = require("@11ty/eleventy-cache-assets");
const slugify = require('./../filters/slugify');

module.exports = async function() {
	let url = "https://beer.mikestreety.co.uk/api/beers.json";

	/* This returns a promise */
	const response = await Cache(url, {
		duration: "4h", // save for 1 day
		type: "json"    // we’ll parse JSON for you
	});

	let data = response.map(beer => {
		beer.slug = `/beer/` + slugify(`${beer.title} ${beer.brewery} ${beer.number}`);
		beer.brewery_slug = `/brewery/` + slugify(`${beer.brewery}`);
		return beer;
	});

	return data;
};
