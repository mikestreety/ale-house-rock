const eleventyNavigationPlugin = require('@11ty/eleventy-navigation');
const {breweryAliases} = require('./app/filters/breweries');
const {shopAliases} = require('./app/filters/shops');
const {styleAliases} = require('./app/filters/styles');

module.exports = function (config) {

	config.addCollection('breweryAliases', breweryAliases);
	config.addCollection('shopAliases', shopAliases);
	config.addCollection('styleAliases', styleAliases);

	config.addCollection('sortedBreweries', function (collections) {
		return collections.getFilteredByTag('brewery').sort(function (a, b) {
			return a.data.title.localeCompare(b.data.title);
		});
	});

	config.addCollection('sortedStyles', function (collections) {
		return collections.getFilteredByTag('style').sort(function (a, b) {
			return a.data.title.localeCompare(b.data.title);
		});
	});

	config.addFilter('limit', require('./app/filters/limit.js'));
	config.addFilter('squashandweed', require('./app/filters/squashandweed.js'));
	config.addFilter('findBySlug', require('./app/filters/findBySlug.js'));

	config.addPlugin(require('@mikestreety/11ty-utils'));

	config.addPassthroughCopy({'build': 'assets'});
	config.addPassthroughCopy('./app/content/admin');
	config.addPassthroughCopy('./app/content/images');

	config.addPlugin(eleventyNavigationPlugin);
	config.setDataDeepMerge(true);

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
