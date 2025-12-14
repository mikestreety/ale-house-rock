const now = new Date();

module.exports = {
	styleAliases: (collection) => {
		return collection
			.getFilteredByTag('style')
			.filter(a => a.data.aliases)
	},
}
