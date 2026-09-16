const eleventyNavigationPlugin = require('@11ty/eleventy-navigation');
const createAliasesFilter = require('./app/filters/createAliasesFilter');

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
