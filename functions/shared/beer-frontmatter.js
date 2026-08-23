// Centralises how beer .md frontmatter gets written, so every writer
// (add-beer.js, resolve-instagram-links.js) produces the same ---json
// fenced JSON - gray-matter's stringify() doesn't tag the fence with the
// language on its own even when told `language: 'json'`, it has to be
// given explicitly via `delimiters`.
const matter = require('gray-matter');

const JSON_MATTER_OPTIONS = { language: 'json', delimiters: ['---json', '---'] };

function stringifyBeer(content, data) {
	return matter.stringify(content, data, JSON_MATTER_OPTIONS);
}

module.exports = { stringifyBeer };
