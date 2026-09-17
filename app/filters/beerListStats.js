const meanMedianMode = require('./meanMedianMode');

function sortBeers(beers) {
	return [...beers].sort((a, b) => parseInt(a.data.number) - parseInt(b.data.number));
}

function buildStats(beers) {
	if (!beers) return;

	let ratings = beers
		.map(a => Number(a.data.rating))
		.filter(b => b);

	if (ratings.length) {
		return {
			ratings,
			titles: beers.map(a => `${a.data.number} - ${a.data.title}`),
			...meanMedianMode(ratings),
			max: Math.max(...ratings),
			min: Math.min(...ratings)
		};
	}
}

module.exports = { sortBeers, buildStats };
