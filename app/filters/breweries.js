const now = new Date();

module.exports = {
	aliases: (collection) => {
		return collection
			.getFilteredByTag('brewery')
			.filter(a => a.data.aliases)
	},
}
