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

// Builds the URL for the combination described by whichever slugs are
// present on a combo entry, in the fixed brewery -> style -> shop segment
// order every permalink in this feature uses.
function comboUrl(entry) {
	let url = '';
	if (entry.brewerySlug) url += `/brewery/${entry.brewerySlug}`;
	if (entry.styleSlug) url += `/style/${entry.styleSlug}`;
	if (entry.shopSlug) url += `/shop/${entry.shopSlug}`;
	return url + '/';
}

// The URL for whatever's left after dropping `dimension` from the current
// filters - i.e. what picking "All" for that dimension should navigate to.
// Always safe without consulting the combo collections: if a fuller
// combination has a prebuilt page, every smaller combination formed by
// dropping one of its dimensions is guaranteed to have one too.
function clearedUrl(dimension, active) {
	const parts = [];
	if (dimension !== 'brewery' && active.brewerySlug) parts.push(`brewery/${active.brewerySlug}`);
	if (dimension !== 'style' && active.styleSlug) parts.push(`style/${active.styleSlug}`);
	if (dimension !== 'shop' && active.shopSlug) parts.push(`shop/${active.shopSlug}`);

	if (parts.length) return `/${parts.join('/')}/`;

	return { brewery: '/breweries/', style: '/styles/', shop: '/shops/' }[dimension];
}

function projectEntry(dimension, entry) {
	const title = dimension === 'brewery' ? entry.brewery.data.title
		: dimension === 'shop' ? entry.shop.data.title
		: entry.styleMain;

	return { title, url: comboUrl(entry), slug: entry[`${dimension}Slug`] };
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

	return options
		.map(o => ({ title: o.title, url: o.url, active: !!activeSlug && o.slug === activeSlug }))
		.sort((a, b) => a.title.localeCompare(b.title));
}

module.exports = function buildFilterOptions(collections, active = {}) {
	return {
		filterBreweries: optionsForDimension('brewery', collections, active),
		filterStyles: optionsForDimension('style', collections, active),
		filterShops: optionsForDimension('shop', collections, active),
		allBreweryUrl: clearedUrl('brewery', active),
		allStyleUrl: clearedUrl('style', active),
		allShopUrl: clearedUrl('shop', active),
		breweryActive: !!active.brewerySlug,
		styleActive: !!active.styleSlug,
		shopActive: !!active.shopSlug
	};
};
