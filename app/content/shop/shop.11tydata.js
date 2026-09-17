const beerListStats = require('../../filters/beerListStats');
const buildFilterOptions = require('../../filters/filterOptions');
const slugSegment = require('../../filters/slugSegment');

module.exports = {
	parent: 'shop',
	layout: 'shop.njk',
	tags: ['shop'],
	eleventyComputed: {
		seoTitle: data => {
			return `${data.title} - Beers purchased from`
		},
		beers: (data) =>  beerListStats.sortBeers(
			data.collections.beer.filter(a => a.data.purchased == data.permalink)
		),
		stats: data => beerListStats.buildStats(data.beers),
		filterOptions: data => buildFilterOptions(data.collections, {
			shopSlug: slugSegment(data.permalink, 'shop')
		}),
		filterBreweries: data => data.filterOptions.filterBreweries,
		filterStyles: data => data.filterOptions.filterStyles,
		filterShops: data => data.filterOptions.filterShops,
		allBreweryUrl: data => data.filterOptions.allBreweryUrl,
		allStyleUrl: data => data.filterOptions.allStyleUrl,
		allShopUrl: data => data.filterOptions.allShopUrl,
		breweryActive: data => data.filterOptions.breweryActive,
		styleActive: data => data.filterOptions.styleActive,
		shopActive: data => data.filterOptions.shopActive
	}
};
