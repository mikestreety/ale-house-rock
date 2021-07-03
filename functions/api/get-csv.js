const fetch = require('node-fetch');
const Papa = require('papaparse');

require('dotenv').config();

module.exports = async function() {
	return await fetch(process.env.csv)
		.then(response => response.text())
		.then(response => Papa.parse(response))
}
