const getCSV = require('./api/get-csv');
const getUploadedImages = require('./api/get-uploaded-images');
const processBeersAndBreweries = require('./api/process-beers-and-breweries');
// const buildSite = require('./functions/step-build-site');

exports.handler = async function(event) {
	let csv = await getCSV();
	let images = await getUploadedImages();
	let output = await processBeersAndBreweries(csv, images);

	return {
		statusCode: 200,
		body: JSON.stringify(output)
	}
}
