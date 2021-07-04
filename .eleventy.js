const eleventyNavigationPlugin = require('@11ty/eleventy-navigation');

module.exports = function (config) {

	config.addFilter('limit', require('./app/filters/limit.js'));
	config.addFilter('squashandweed', require('./app/filters/squashandweed.js'));

	config.addPlugin(require('@mikestreety/11ty-utils'));

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
