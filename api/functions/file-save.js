const fs = require('fs');

module.exports = function (path, data) {
	return fs.writeFileSync(path, JSON.stringify(data));
};
