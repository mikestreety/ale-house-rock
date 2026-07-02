exports.handler = async (event) => {
	const data = event.queryStringParameters || {};

	/**
	 * Data validation
	 */
	if (
		!data.url ||
		!data.token ||
		data.token !== process.env.ACCESS_TOKEN
	) {
		return jsonResponse(400, { status: 'error', message: 'Missing or invalid data' });
	}

	let parsedUrl;
	try {
		parsedUrl = new URL(data.url);
	} catch (err) {
		return jsonResponse(400, { status: 'error', message: 'Invalid URL' });
	}

	/**
	 * Resolve untp.beer short links to their real untappd.com URL
	 */
	if (parsedUrl.hostname === 'untp.beer') {
		try {
			const redirect = await fetch(data.url, { redirect: 'follow' });
			if (!redirect.ok && redirect.status !== 0) {
				// status 0 can happen with opaque redirects in some runtimes;
				// otherwise treat non-OK as a real failure
				return jsonResponse(502, {
					status: 'error',
					message: `Could not resolve short link (status ${redirect.status})`,
				});
			}
			data.url = redirect.url;
			parsedUrl = new URL(data.url);
		} catch (err) {
			return jsonResponse(502, { status: 'error', message: 'Failed to resolve short link' });
		}
	}

	/**
	 * Hand off to the parser once we have a genuine untappd.com URL
	 */
	if (parsedUrl.hostname === 'untappd.com' || parsedUrl.hostname.endsWith('.untappd.com')) {
		const parserUrl =
			'https://alehouse.rocks/.netlify/functions/untappd?url=' + encodeURIComponent(data.url);

		const redirectParams = new URLSearchParams({
			url: parserUrl,
			token: data.token,
		});

		return {
			statusCode: 302,
			headers: {
				Location: '/.netlify/functions/add-beer?' + redirectParams.toString(),
			},
		};
	}

	return jsonResponse(400, {
		status: 'error',
		message: 'URL was not recognised as an Untappd link',
	});
};

function jsonResponse(statusCode, body) {
	return {
		statusCode,
		headers: { 'content-type': 'application/json;charset=UTF-8' },
		body: JSON.stringify(body),
	};
}