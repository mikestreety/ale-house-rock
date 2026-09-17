const fs = require('fs');

const beerListStats = require('../../filters/beerListStats');
const buildFilterOptions = require('../../filters/filterOptions');
const slugSegment = require('../../filters/slugSegment');

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
		beers: (data) =>  beerListStats.sortBeers(
			data.collections.beer.filter(a => a.data.breweries.includes(data.permalink))
		),
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
		stats: data => beerListStats.buildStats(data.beers),
		filterOptions: data => buildFilterOptions(data.collections, {
			brewerySlug: slugSegment(data.permalink, 'brewery')
		}),
		filterBreweries: data => data.filterOptions.filterBreweries,
		filterStyles: data => data.filterOptions.filterStyles,
		filterShops: data => data.filterOptions.filterShops
	}
};
