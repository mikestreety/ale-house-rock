const fs = require('fs');
const fexists = require('./file-exists');

module.exports = async function(path) {
	let fetchData = true;

	if(fexists(path)) {
		let fstats = await fs.statSync(path),
			now = new Date();

		// Is it less than an hour since the last check?
		fetchData = (now - fstats.mtime) > 3600000; // 1 hour in ms
	}

	return fetchData;
}
