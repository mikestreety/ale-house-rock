const fs = require('fs');

const meanMedianMode = require('../../filters/meanMedianMode');

module.exports = {
	parent: 'brewery',
	layout: 'brewery.njk',
	tags: [
		'brewery'
	],
	eleventyComputed: {
		seoTitle: data => {
			return `${data.title} - Beers from the brewery`
		},
		beers: (data) =>  data.collections.beer.filter(a => a.data.breweries.includes(data.permalink))
			.sort((a, b) => parseInt(a.data.number) + parseInt(b.data.number)),
		imagePath: data => {
			let path = `/images/${data.permalink}image.webp`;
			if (fs.existsSync(process.cwd() + '/app/content' + path)) {
				return path;
			} else {
				return false;
			}
		},
		socialMediaPhoto: data => {
			if (data.imagePath) {
				return data.meta.site.url + data.imagePath;
			}
		},
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
