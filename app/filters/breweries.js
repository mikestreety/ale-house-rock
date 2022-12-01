const now = new Date();

module.exports = {
	breweryAliases: (collection) => {
		return collection
			.getFilteredByTag('brewery')
			.filter(a => a.data.aliases)
	},
}
