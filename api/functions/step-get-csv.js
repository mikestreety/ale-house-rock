const fetch = require('node-fetch');
const Papa = require('papaparse');

const fsave = require('./file-save');
const fage = require('./file-age');
const fload = require('./file-load');

require('dotenv').config();

module.exports = async function(path) {
	let fetchData = fage(path),
		output = {
			status: false,
			message: 'RAW file less than an hour old, skipping'
		};

	if(fetchData) {
		output.message = 'RAW file due to be updated';

		output = await fetch(process.env.csv)
			.then(response => response.text())
			.then(response => Papa.parse(response))
			.then(response => {
				let prev = fload(path);
				if(prev.length === response.data.length) {
					return {
						status: false,
						message: 'New data and old data the same'
					};
				}

				fsave(path, response.data);
				return {
					status: true,
					message: 'RAW file updated'
				};


			});
	}

	return output;
}
