// const fs = require('fs');
// const paths = require('./../../api/paths.json');

module.exports = async function() {
	let data = '[]';

	// if(fs.existsSync(paths.breweries)) {
	// 	let raw_data  = fs.readFileSync(paths.breweries, {encoding: 'utf8'});

	// 	if(raw_data.length) {
	// 		data = raw_data;
	// 	}
	// }

	return JSON.parse(data);
};
