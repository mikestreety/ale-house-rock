const Cache = require("@11ty/eleventy-cache-assets");

module.exports = async function() {

	let url = "https://alehouse.rocks/.netlify/functions/api";

	/* This returns a promise */
	const response = await Cache(url, {
		duration: "1h", // save for 1 day
		type: "json"    // we’ll parse JSON for you
	});

	return response;
};
