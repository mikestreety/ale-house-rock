const api = require('./../api/');

exports.handler = async function(event) {
	return {
		statusCode: 200,
		body: await api(event)
	}
}
