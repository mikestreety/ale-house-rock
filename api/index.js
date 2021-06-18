const paths = require('./paths.json');

const setProgress = require('./functions/set-progress');
const fload = require('./functions/file-load');

const getCSV = require('./functions/step-get-csv');
const getUploadedImages = require('./functions/step-get-uploaded-images');
const processBeersAndBreweries = require('./functions/step-process-beers-and-breweries');
const buildSite = require('./functions/step-build-site');

module.exports = async function (event) {
	let progress = fload(paths.progress, {step: 0}),
		output = {
			status: false
		};

	if(event.queryStringParameters.step) {
		progress.step = parseInt(event.queryStringParameters.step);
	}

	switch(progress.step) {
		case 1:
			output = await getCSV(paths.raw);
			break;
		case 2:
			output = await getUploadedImages(paths.images);
			break;
		case 3:
			output = await processBeersAndBreweries(paths);
			break;
		case 4:
			output = await buildSite();
			output.step = 1;
			break;
	}

	// Force the progress to skip
	if(event.queryStringParameters.step) {
		output.status = false;
		output.step = false;
		output.isManual = true;
	}

	if(output.status || output.step) {
		setProgress(output.step || false);
	}

	return JSON.stringify({
		step: progress.step,
		output
	});
}
