const slugify = require('@sindresorhus/slugify');

// Mirrors Eleventy's built-in `slugify` filter (used e.g. in style-main.njk's
// permalink) so combo pages built in .eleventy.js always land on the same
// slug for a given main style.
module.exports = function slugifyStyle(value) {
	return slugify(String(value), { decamelize: false });
};
