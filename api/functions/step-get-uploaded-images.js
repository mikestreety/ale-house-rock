const fsave = require('./file-save');
const fage = require('./file-age');

const cloudinary = require('../cloudinary');

async function list_resources(path, results = [], next_cursor = null) {

	return await cloudinary.api.resources(
		{
			resource_type: 'image',
			type: 'upload',
			prefix: 'alehouserock/',
			mex_results: 500, //can be any value up to 500
			next_cursor: next_cursor
		},
		function(err, res) {

			res.resources.forEach(function(resource){
				//Do some processing or checks
				results.push(resource.public_id);
			});

			if (res.next_cursor) {
				list_resources(path, results, res.next_cursor);
			} else {
				fsave(path, results);
			}
		});
}

module.exports = async function(path) {
	let fetchData = fage(path),
		output = {
			status: false,
			message: 'Images file less than an hour old, skipping'
		};

	if(fetchData) {
		output.message = 'Fetching images';
		let result = await list_resources(path);
		if(result.resources) {
			output = {
				status: true,
				message: 'Images fetched'
			}
		}
	}

	return output;
}
