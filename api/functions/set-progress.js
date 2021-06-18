const fload = require('./file-load');
const fsave = require('./file-save');

const paths = require('./../paths.json');

module.exports = function(step) {
	// Load previous progress or an empty object
	let progress = fload(paths.progress, {});

	// Set the current step
	let cur_step = step ?
		// Use specified step
		step :
		// If not see if we have one
		(progress?.step ?
			// Increase if we do
			++progress.step :
			// Otherwise use 1
			1
		);

	// Save a new json object with the data
	progress = {
		step: cur_step,
		time: new Date().getTime()
	};

	fsave(
		paths.progress,
		progress
	);

	return progress;
}
