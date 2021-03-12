const nth = function(d) {
	if (d > 3 && d < 21) {
		return 'th';
	}

	switch (d % 10) {
		case 1:
			return 'st';
		case 2:
			return 'nd';
		case 3:
			return 'rd';
		default:
			return 'th';
	}
}

const months = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
];

module.exports = function (date) {
	date = new Date(Date.parse(date));
	const day = date.getDate();
	return `${day}${nth(day)} ${months[date.getMonth()]} ${date.getFullYear()}`;
};
