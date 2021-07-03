const fetch = require('node-fetch');

require('dotenv').config();

module.exports = async function() {
	const url = process.env.netlify_hook;
	const init = {
		method: "POST",
		headers: {
			"content-type": "application/json;charset=UTF-8",
		},
	}
	return await fetch(url, init);
};
