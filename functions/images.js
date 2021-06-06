const cloudinary = require('cloudinary').v2;
const fs = require('fs');

cloudinary.config({
	cloud_name: 'mikestreety',
	api_key: '378792126689264',
	api_secret: 'YeKTxlvQFvfDqIy9jQAgh2i3SQU'
});

function list_resources(results = [], next_cursor = null) {
	cloudinary.api.resources(
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
				list_resources(results, res.next_cursor);
			} else {
				fs.writeFile('./api/images.json', JSON.stringify(results), function (err) {
					if (err) return console.log(err);
				})
			}
		});
	}


exports.handler = async function(event, context) {
	list_resources();

	return {
		statusCode: 200,
		body: `Images collated`
	}
}
