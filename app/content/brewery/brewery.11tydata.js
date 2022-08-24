const findBySlug = require('../../filters/findBySlug');
const meanMedianMode = require('../../filters/meanMedianMode');

module.exports = {
	eleventyComputed: {
		seoTitle: data => {
			return `${data.title}`
		},
		beers: data => findBySlug(data.beers, data.collections.all)
			.sort((a, b) => parseInt(a.data.number) + parseInt(b.data.number)),
		stats: data => {
			let ratings = data.beers
				.map(a => Number(a.data.rating))
				.filter(b => b);

			if(ratings.length) {
				return meanMedianMode(ratings);
			}

		}
	}
};
