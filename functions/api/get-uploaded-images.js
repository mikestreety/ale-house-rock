const cloudinary = require('./cloudinary');

async function list_resources(results, next_cursor = null) {
	await new Promise((resolve) => {
		cloudinary.api.resources(
			{
				resource_type: 'image',
				type: 'upload',
				prefix: 'alehouserock/',
				max_results: 500, //can be any value up to 500
				next_cursor: next_cursor
			},
			function (err, res) {
				if (err) {
					console.log(err);
					resolve();

				} else {
					res.resources.forEach(function (resource) {
						results.push(resource);
					});

					if (res.next_cursor) {
						list_resources(results, res.next_cursor).then(() => resolve());
					} else {
						resolve();
					}
				}

			}
		);
	});
}

module.exports = async function() {
	const results = [];
	await list_resources(results);
	return results.map(image => image.public_id)
}
