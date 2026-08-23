// netlify/functions/resolve-instagram-links.js
//
// Weekly scheduled run of the pending-instagram-links queue (see
// functions/shared/resolve-instagram-links.js for what it actually does).
//
// Scheduled functions are invoked internally by Netlify's own scheduler,
// not by requesting this endpoint from the outside - Netlify rejects
// direct external calls to a scheduled function's URL (that's what was
// happening when this was hit manually and returned a 403). To trigger a
// resolve run on demand, use resolve-instagram-links-now instead, which
// runs the exact same shared logic but isn't registered as scheduled in
// netlify.toml, so it stays reachable via its own URL (?token=...).

const { resolvePendingInstagramLinks } = require('../shared/resolve-instagram-links');
const { jsonResponse } = require('../shared/json-response');

exports.handler = async () => {
	const result = await resolvePendingInstagramLinks();
	const { statusCode, ...body } = result;
	return jsonResponse(statusCode || 200, body);
};
