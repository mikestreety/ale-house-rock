const Cache = require("@11ty/eleventy-cache-assets");

module.exports = async function() {
	let url = "https://beer.mikestreety.co.uk/api/breweries.json";

	/* This returns a promise */
	const response = await Cache(url, {
		duration: "1d", // save for 1 day
		type: "json"    // we’ll parse JSON for you
	});

	let data = response.map((brewery) => {
		brewery.slug = `${brewery.title}`;
		return brewery;
	});

	return data;
};
