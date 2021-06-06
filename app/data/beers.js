const fs = require('fs');

module.exports = async function() {
	let data = '[]';

	if(fs.existsSync('./api/beers.json')) {
		let raw_data = fs.readFileSync('./api/beers.json', {encoding: 'utf8'});

		if(raw_data.length) {
			data = raw_data;
		}
	}

	return JSON.parse(data);
};
