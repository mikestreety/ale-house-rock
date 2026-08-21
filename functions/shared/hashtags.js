// Builds the set of hashtags for a Buffer/Instagram caption: a fixed
// general set, plus whatever categories the beer's Untappd style matches
// in hashtag-bank.json, plus any hashtags the reviewer typed into the
// Untappd check-in comment itself (see untappd.js's body parsing).
//
// To grow the bank, edit hashtag-bank.json - no code changes needed
// unless you're adding a genuinely new matching rule.
const bank = require('./hashtag-bank.json');

const MAX_HASHTAGS = 20;

function sanitizeTag(tag) {
	return String(tag)
		.replace(/^#/, '')
		.replace(/[^a-z0-9_]/gi, '')
		.toLowerCase();
}

/**
 * @param {string} [style] - the beer's Untappd style, e.g. "IPA - New England / Hazy"
 * @param {string[]} [extraHashtags] - hashtags scraped from the check-in comment (no #)
 * @returns {string[]} deduped hashtag words (no #), capped at MAX_HASHTAGS
 */
function buildHashtags({ style = '', extraHashtags = [] } = {}) {
	const styleLower = style.toLowerCase();
	const tags = new Set(bank.general);

	for (const [category, keywords] of Object.entries(bank.styleKeywords)) {
		if (keywords.some(keyword => styleLower.includes(keyword))) {
			for (const tag of bank.styles[category] || []) {
				tags.add(tag);
			}
		}
	}

	for (const raw of extraHashtags) {
		const clean = sanitizeTag(raw);
		if (clean) {
			tags.add(clean);
		}
	}

	return [...tags].slice(0, MAX_HASHTAGS);
}

module.exports = { buildHashtags };
