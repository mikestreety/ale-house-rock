const beerListStats = require('../../filters/beerListStats');
const buildFilterOptions = require('../../filters/filterOptions');
const styleMainName = require('../../filters/styleMainName');
const slugifyStyle = require('../../filters/slugifyStyle');

module.exports = {
	parent: 'style',
	layout: 'style.njk',
	tags: ['style'],
	eleventyComputed: {
		seoTitle: data => {
			return `${data.title} - Beers in this style`
		},
		beers: (data) =>  beerListStats.sortBeers(
			data.collections.beer.filter(a => a.data.style == data.title)
		),
		stats: data => beerListStats.buildStats(data.beers),
		// These pages are keyed on the full compound style (e.g. "IPA -
		// American"); the cross-filter system only understands main styles,
		// so pre-select the parent main style's filter here.
		filterOptions: data => {
			const mainStyle = styleMainName(data.title);
			return buildFilterOptions(data.collections, {
				styleSlug: mainStyle ? slugifyStyle(mainStyle) : null
			});
		},
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
