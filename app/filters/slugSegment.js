module.exports = function slugSegment(url, prefix) {
	if (!url) return null;
	const trimmed = url.replace(/^\/+|\/+$/g, '');
	return trimmed.replace(new RegExp(`^${prefix}/`), '');
};
