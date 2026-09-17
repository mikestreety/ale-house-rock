const eleventyNavigationPlugin = require('@11ty/eleventy-navigation');
const createAliasesFilter = require('./app/filters/createAliasesFilter');
const slugSegment = require('./app/filters/slugSegment');
const slugifyStyle = require('./app/filters/slugifyStyle');

module.exports = function (config) {

	config.addCollection('breweryAliases', createAliasesFilter('brewery'));
	config.addCollection('shopAliases', createAliasesFilter('shop'));
	config.addCollection('styleAliases', createAliasesFilter('style'));

	// Factory function for creating sorted collections by title
	const createSortedCollection = (tag) => (collections) =>
		collections.getFilteredByTag(tag).sort((a, b) =>
			a.data.title.localeCompare(b.data.title)
		);

	config.addCollection('sortedBreweries', createSortedCollection('brewery'));
	config.addCollection('sortedStyles', createSortedCollection('style'));
	config.addCollection('sortedShops', createSortedCollection('shop'));
	config.addCollection('sortedStyleMains', createSortedCollection('styleMain'));

	// Names of the main style for every beer whose Untappd style splits into
	// "Main style - Sub category" (e.g. "Pale Ale" from "Pale Ale - Other").
	// Used purely as the pagination source for generating one page per main
	// style - see app/content/style-main.njk.
	config.addCollection('styleMainNames', (collections) => {
		const names = new Set();
		for (const beer of collections.getFilteredByTag('beer')) {
			if (beer.data.styleMain) {
				names.add(beer.data.styleMain);
			}
		}
		return [...names].sort();
	});

	// Prebuilt filter/combo pages: one page per distinct brewery+style,
	// brewery+shop, style+shop and brewery+style+shop combination that
	// actually has at least one matching beer - see app/content/brewery-style.njk,
	// brewery-shop.njk, style-shop.njk and brewery-style-shop.njk.
	// `beer.data.breweries` may be either the raw array of brewery slugs from
	// frontmatter or (once Eleventy resolves that beer's own computed data)
	// the resolved brewery collection items, so both shapes are normalised here.
	const resolveBrewery = (entry, breweriesByPermalink) => {
		if (!entry) return null;
		if (typeof entry === 'string') return breweriesByPermalink.get(entry) || null;
		if (entry.data && entry.data.permalink) return entry;
		return null;
	};

	const accumulate = (map, key, base, beer) => {
		if (!map.has(key)) {
			map.set(key, { ...base, beers: [] });
		}
		map.get(key).beers.push(beer);
	};

	config.addCollection('breweryStyleCombos', (collections) => {
		const breweriesByPermalink = new Map(collections.getFilteredByTag('brewery').map(b => [b.data.permalink, b]));
		const map = new Map();

		for (const beer of collections.getFilteredByTag('beer')) {
			const styleMain = beer.data.styleMain;
			if (!styleMain) continue;
			const styleSlug = slugifyStyle(styleMain);

			for (const raw of beer.data.breweries || []) {
				const brewery = resolveBrewery(raw, breweriesByPermalink);
				if (!brewery) continue;
				const brewerySlug = slugSegment(brewery.url, 'brewery');
				accumulate(map, `${brewerySlug}|${styleSlug}`, { brewery, brewerySlug, styleMain, styleSlug }, beer);
			}
		}

		return [...map.values()];
	});

	config.addCollection('breweryShopCombos', (collections) => {
		const breweriesByPermalink = new Map(collections.getFilteredByTag('brewery').map(b => [b.data.permalink, b]));
		const shopsByPermalink = new Map(collections.getFilteredByTag('shop').map(s => [s.data.permalink, s]));
		const map = new Map();

		for (const beer of collections.getFilteredByTag('beer')) {
			const shop = shopsByPermalink.get(beer.data.purchased);
			if (!shop) continue;
			const shopSlug = slugSegment(shop.url, 'shop');

			for (const raw of beer.data.breweries || []) {
				const brewery = resolveBrewery(raw, breweriesByPermalink);
				if (!brewery) continue;
				const brewerySlug = slugSegment(brewery.url, 'brewery');
				accumulate(map, `${brewerySlug}|${shopSlug}`, { brewery, brewerySlug, shop, shopSlug }, beer);
			}
		}

		return [...map.values()];
	});

	config.addCollection('styleShopCombos', (collections) => {
		const shopsByPermalink = new Map(collections.getFilteredByTag('shop').map(s => [s.data.permalink, s]));
		const map = new Map();

		for (const beer of collections.getFilteredByTag('beer')) {
			const styleMain = beer.data.styleMain;
			const shop = shopsByPermalink.get(beer.data.purchased);
			if (!styleMain || !shop) continue;
			const styleSlug = slugifyStyle(styleMain);
			const shopSlug = slugSegment(shop.url, 'shop');
			accumulate(map, `${styleSlug}|${shopSlug}`, { styleMain, styleSlug, shop, shopSlug }, beer);
		}

		return [...map.values()];
	});

	config.addCollection('breweryStyleShopCombos', (collections) => {
		const breweriesByPermalink = new Map(collections.getFilteredByTag('brewery').map(b => [b.data.permalink, b]));
		const shopsByPermalink = new Map(collections.getFilteredByTag('shop').map(s => [s.data.permalink, s]));
		const map = new Map();

		for (const beer of collections.getFilteredByTag('beer')) {
			const styleMain = beer.data.styleMain;
			const shop = shopsByPermalink.get(beer.data.purchased);
			if (!styleMain || !shop) continue;
			const styleSlug = slugifyStyle(styleMain);
			const shopSlug = slugSegment(shop.url, 'shop');

			for (const raw of beer.data.breweries || []) {
				const brewery = resolveBrewery(raw, breweriesByPermalink);
				if (!brewery) continue;
				const brewerySlug = slugSegment(brewery.url, 'brewery');
				accumulate(map, `${brewerySlug}|${styleSlug}|${shopSlug}`, { brewery, brewerySlug, styleMain, styleSlug, shop, shopSlug }, beer);
			}
		}

		return [...map.values()];
	});

	config.addFilter('limit', require('./app/filters/limit.js'));
	config.addFilter('findBySlug', require('./app/filters/findBySlug.js'));

	config.addPlugin(require('@mikestreety/11ty-utils'));

	config.addPassthroughCopy({'build': 'assets'});
	config.addPassthroughCopy('./app/content/images');

	config.addPlugin(eleventyNavigationPlugin);
	config.setDataDeepMerge(true);

	// Copy generated aliases to functions directory after build
	config.addPlugin(function(eleventyConfig) {
		eleventyConfig.on('eleventy.after', async () => {
			const fs = require('fs');
			const path = require('path');

			try {
				fs.copyFileSync(
					path.join(__dirname, 'html/api/aliases.json'),
					path.join(__dirname, 'functions/add-beer/aliases-data.json')
				);
				console.log('[11ty] Copied aliases data to functions directory');
			} catch(e) {
				console.warn('[11ty] Could not copy aliases data:', e.message);
			}
		});
	});

	return {
		dir: {
			input: 'app/content',
			output: 'html',

			data: './../data',
			includes: './../includes',
			layouts: './../layouts'
		}
	};
};
