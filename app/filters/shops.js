const now = new Date();

module.exports = {
	shopAliases: (collection) => {
		return collection
			.getFilteredByTag('shop')
			.filter(a => a.data.aliases)
	},
}
