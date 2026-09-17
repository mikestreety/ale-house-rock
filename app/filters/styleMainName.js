// Untappd styles are "Main style - Sub category" (e.g. "Pale Ale - Other").
module.exports = function styleMainName(style) {
	if (!style) return null;
	const separatorIndex = style.indexOf(' - ');
	return separatorIndex > -1 ? style.slice(0, separatorIndex) : null;
};
