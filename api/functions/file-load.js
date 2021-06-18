const fs = require('fs');
const fexists = require('./file-exists');

module.exports = function (path, fallback) {
	let output = fallback ?? false;
	if(fexists(path)) {
		output = JSON.parse(fs.readFileSync(path, {encoding: 'utf8'}));
	}

	return output;
};
