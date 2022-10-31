const meanMedianMode = require('../../filters/meanMedianMode');

module.exports = {
	eleventyComputed: {
		seoTitle: data => {
			return `${data.title}`
		},
		beers: (data) =>  data.collections.beer.filter(a => a.data.breweries.includes(data.permalink))
			.sort((a, b) => parseInt(a.data.number) + parseInt(b.data.number)),

		stats: data => {
			if(data.beers) {
				let ratings = data.beers
					.map(a => Number(a.data.rating))
					.filter(b => b);

				if(ratings.length) {
					return {
						ratings,
						titles: data.beers.map(a => `${a.data.number} - ${a.data.title}`),
						...meanMedianMode(ratings),
						max: Math.max(...ratings),
						min: Math.min(...ratings)
					}
				}
			}

		}
	}
};
