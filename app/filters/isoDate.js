module.exports = function (date) {
	let d = new Date(Date.parse(date));
	return d.toISOString();
};
