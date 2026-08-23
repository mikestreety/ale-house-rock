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
// reachable via its own URL. No token needed (unlike retry-buffer-post.js)
// - it takes no parameters and only checks the fixed, internally-populated
// queue against Buffer, writing back a link Buffer has already confirmed;
// there's no user-supplied input to authenticate and nothing destructive
// to gate.
//
// Usage:
//   /.netlify/functions/resolve-instagram-links-now

const { resolvePendingInstagramLinks } = require('../shared/resolve-instagram-links');
const { jsonResponse } = require('../shared/json-response');

exports.handler = async () => {
	const result = await resolvePendingInstagramLinks();
	const { statusCode, ...body } = result;
	return jsonResponse(statusCode || 200, body);
};
