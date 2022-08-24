module.exports = function(slugs, collection) {
	if(slugs) {
		return collection
			.filter(b => slugs.includes(b.data.permalink))
			.filter(a => a);
	}
};
