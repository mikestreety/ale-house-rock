// Atom uses RFC 3339 dates
// https://tools.ietf.org/html/rfc3339#section-5.8
module.exports = function(date) {
	let d = new Date(Date.parse(date));
	return d.toUTCString();
}
