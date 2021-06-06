const fetch = require('node-fetch');
const Papa = require('papaparse');
const fs = require('fs');

require('dotenv').config();

exports.handler = async function(event, context) {

	let data = await fetch(process.env.csv)
		.then(response => response.text())
		.then(response => Papa.parse(response))
		.then(response => {
			fs.writeFile('./api/raw.json', JSON.stringify(response), function (err) {
				if (err) return console.log(err);
			})

			return response.data.length;
		});

	return {
		statusCode: 200,
		body: `${data}`
	}
}
