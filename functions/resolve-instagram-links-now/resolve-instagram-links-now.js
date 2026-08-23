// netlify/functions/resolve-instagram-links-now.js
//
// Manually-triggerable copy of resolve-instagram-links.js, for forcing a
// resolve run instead of waiting for the weekly schedule.
//
// resolve-instagram-links.js is registered with a `schedule` in
// netlify.toml, which makes Netlify treat it as an internally-invoked
// scheduled function - requesting its URL directly is rejected by Netlify
// itself (403), regardless of anything in this repo. This is a separate,
// unscheduled function running the identical shared logic, so it stays
// reachable via its own URL. Gated by ACCESS_TOKEN (same convention as
// retry-buffer-post.js) since, unlike the scheduled run, this endpoint is
// open to being hit by anyone who finds it.
//
// Usage:
//   /.netlify/functions/resolve-instagram-links-now?token=XXXX

const { resolvePendingInstagramLinks } = require('../shared/resolve-instagram-links');
const { jsonResponse } = require('../shared/json-response');

require('dotenv').config();

exports.handler = async (event) => {
	const data = event.queryStringParameters || {};

	if (!data.token || data.token !== process.env.ACCESS_TOKEN) {
		return jsonResponse(400, { status: 'error', message: 'Missing or invalid token' });
	}

	const result = await resolvePendingInstagramLinks();
	const { statusCode, ...body } = result;
	return jsonResponse(statusCode || 200, body);
};
