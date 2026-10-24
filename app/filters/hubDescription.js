// Builds a meta description for a list page (brewery, shop, style or combo)
// from the beers it lists, e.g. "42 Lidl GB beers reviewed and rated out of
// 10, averaging 6.1/10. Top rated: Green Gecko (8/10)."
// `label` receives "beer" or "beers" and returns the phrase describing them.
module.exports = function hubDescription(beers, stats, label) {
	if (!beers || !beers.length) {
		return `Honest reviews of ${label('beers')}, rated out of 10.`;
	}

	const noun = beers.length === 1 ? 'beer' : 'beers';
	let text = `${beers.length} ${label(noun)} reviewed and rated out of 10`;

	if (stats && stats.mean && beers.length > 1) {
		text += `, averaging ${stats.mean}/10`;
	}

	const best = beers
		.filter(beer => beer.data.rating)
		.sort((a, b) => b.data.rating - a.data.rating)[0];

	if (best && beers.length > 1) {
		text += `. Top rated: ${best.data.title} (${best.data.rating}/10)`;
	}

	return `${text}.`;
};
