const slugSegment = require('./slugSegment');

const DIMENSIONS = ['brewery', 'style', 'shop'];

const PAIR_COLLECTIONS = {
	brewery_shop: 'breweryShopCombos',
	brewery_style: 'breweryStyleCombos',
	shop_style: 'styleShopCombos'
};

function pairCollectionName(a, b) {
	return PAIR_COLLECTIONS[[a, b].sort().join('_')];
}

function projectEntry(dimension, entry) {
	if (dimension === 'brewery') {
		return { title: entry.brewery.data.title, url: entry.brewery.url, slug: entry.brewerySlug };
	}
	if (dimension === 'shop') {
		return { title: entry.shop.data.title, url: entry.shop.url, slug: entry.shopSlug };
	}
	return { title: entry.styleMain, url: `/style/${entry.styleSlug}/`, slug: entry.styleSlug };
}

function fullList(dimension, collections) {
	if (dimension === 'brewery') {
		return collections.sortedBreweries.map(item => ({ title: item.data.title, url: item.url, slug: slugSegment(item.url, 'brewery') }));
	}
	if (dimension === 'shop') {
		return collections.sortedShops.map(item => ({ title: item.data.title, url: item.url, slug: slugSegment(item.url, 'shop') }));
	}
	return collections.sortedStyleMains.map(item => ({ title: item.data.title, url: item.url, slug: slugSegment(item.url, 'style') }));
}

// For a given dimension (brewery/style/shop), work out which values are
// actually reachable given whatever the *other* two dimensions are
// currently filtered to (if any), each marked `active` when it matches the
// page's own current filter. Every returned `url` is a real prebuilt page.
function optionsForDimension(dimension, collections, active) {
	const [otherA, otherB] = DIMENSIONS.filter(d => d !== dimension);
	const activeA = active[`${otherA}Slug`];
	const activeB = active[`${otherB}Slug`];

	let entries = null;
	if (activeA && activeB) {
		entries = collections.breweryStyleShopCombos.filter(e => e[`${otherA}Slug`] === activeA && e[`${otherB}Slug`] === activeB);
	} else if (activeA || activeB) {
		const setDimension = activeA ? otherA : otherB;
		const setSlug = activeA || activeB;
		entries = collections[pairCollectionName(dimension, setDimension)].filter(e => e[`${setDimension}Slug`] === setSlug);
	}

	const options = entries ? entries.map(e => projectEntry(dimension, e)) : fullList(dimension, collections);
	const activeSlug = active[`${dimension}Slug`];

	return options.map(o => ({ title: o.title, url: o.url, active: !!activeSlug && o.slug === activeSlug }));
}

module.exports = function buildFilterOptions(collections, active = {}) {
	return {
		filterBreweries: optionsForDimension('brewery', collections, active),
		filterStyles: optionsForDimension('style', collections, active),
		filterShops: optionsForDimension('shop', collections, active)
	};
};
