function jsonResponse(statusCode, body) {
	return {
		statusCode,
		headers: { 'content-type': 'application/json;charset=UTF-8' },
		body: JSON.stringify(body, null, 2),
	};
}

module.exports = { jsonResponse };
