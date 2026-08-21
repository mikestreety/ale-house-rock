// Builds the set of hashtags for a Buffer/Instagram caption: whatever
// hashtags the reviewer typed into the Untappd check-in comment (see
// untappd.js's body parsing), then whatever categories the beer's
// Untappd style matches in hashtag-bank.json, then a fixed general set
// as filler - in that priority order, since Instagram only allows 5
// hashtags per post.
//
// To grow the bank, edit hashtag-bank.json - no code changes needed
// unless you're adding a genuinely new matching rule.
const bank = require('./hashtag-bank.json');

const MAX_HASHTAGS = 5;

function sanitizeTag(tag) {
	return String(tag)
		.replace(/^#/, '')
		.replace(/[^a-z0-9_]/gi, '')
		.toLowerCase();
}

/**
 * @param {string} [style] - the beer's Untappd style, e.g. "IPA - New England / Hazy"
 * @param {string[]} [extraHashtags] - hashtags scraped from the check-in comment (no #)
 * @returns {string[]} deduped hashtag words (no #), capped at MAX_HASHTAGS, reviewer's own tags first
 */
function buildHashtags({ style = '', extraHashtags = [] } = {}) {
	const styleLower = style.toLowerCase();
	const tags = new Set();

	for (const raw of extraHashtags) {
		const clean = sanitizeTag(raw);
		if (clean) {
			tags.add(clean);
		}
	}

	for (const [category, keywords] of Object.entries(bank.styleKeywords)) {
		if (keywords.some(keyword => styleLower.includes(keyword))) {
			for (const tag of bank.styles[category] || []) {
				tags.add(tag);
			}
		}
	}

	for (const tag of bank.general) {
		tags.add(tag);
	}

	return [...tags].slice(0, MAX_HASHTAGS);
}

module.exports = { buildHashtags };
