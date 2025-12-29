/**
 * Factory function to create alias filters for any collection tag
 * @param {string} tag - The collection tag (e.g., 'brewery', 'shop', 'style')
 * @returns {Function} A filter function for use with 11ty collections
 */
module.exports = (tag) => (collection) =>
  collection.getFilteredByTag(tag).filter(item => item.data.aliases);
