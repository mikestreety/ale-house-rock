const fetch = require('node-fetch');

exports.handler = async (event, context) => {

	let data = event.queryStringParameters;

	/**
	* Data validation
	*/
	if (
		!data.hasOwnProperty('url') ||
		!data.hasOwnProperty('token') ||
		data.token !== process.env.ACCESS_TOKEN
	) {
		return {
			statusCode: 400,
			body: JSON.stringify({
				status: 'error',
				message: 'Missing data'
			})
		}
	}

	/**
	 * Untappd
	 */
	if(data.url.includes('untp.beer')) {
		let redirect = await fetch(data.url);
		data.url = redirect.url;
	}

	if(data.url.includes('untappd.com')) {
		data.url = data.url.replace('untappd.com', 'untappd.alehouse.rocks');
		return {
			statusCode: 302,
			headers: {
				'Location': '/.netlify/functions/add-beer?' + new URLSearchParams(data),
			},
		};
	}

	return {
		statusCode: 200,
		body: JSON.stringify(data)
	};
};
