const eleventyNavigationPlugin = require('@11ty/eleventy-navigation');

module.exports = function (config) {
	// config.addFilter('date', require('./app/filters/date.js'));

	config.addFilter('limit', require('./app/filters/limit.js'));
	config.addFilter('utcDate', require('./app/filters/utcDate.js'));
	config.addFilter('isoDate', require('./app/filters/isoDate.js'));
	config.addFilter('readableDate', require('./app/filters/readableDate.js'));
	config.addFilter('squashandweed', require('./app/filters/squashandweed.js'));
	config.addFilter('slugify', require('./app/filters/slugify.js'));

	config.addPassthroughCopy({'build': 'assets'});

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
