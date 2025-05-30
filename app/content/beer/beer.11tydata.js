const findBySlug = require('./../../filters/findBySlug');

module.exports = {
	layout: 'beer.njk',
	parent: 'beer',
	tags: [
		'beer'
	],

	eleventyComputed: {
		number: data => {
			let slugs = data.collections.beer.map(b => b.data.permalink);
			return slugs.indexOf(data.permalink) + 1;
		},
		date: data => data.page.date,
		breweries: data => findBySlug(data.breweries, data.collections.all),
		brewedBy: data => {
			if(data.breweries) {
				let b = data.breweries.filter(a => a);

				if(b.length >= 1) {
					let titles = b.map(r => r.data.title).filter(d => d);

					if(titles.length === 1) {
						titles = titles[0]
					} else {
						titles = [titles.slice(0, -1).join(', '), titles.slice(-1)[0]].join(titles.length < 2 ? '' : ' and ');
					}

					return titles;
				}
			}
		},

		purchased_from: data => findBySlug(data.purchased, data.collections.all),
		seoTitle: data => {
			return `${data.title} by ${data.brewedBy}`
		},
		imagePath: data => {
			if(data.page) {
				return `/images/${data.permalink}image.webp`
			}
		},
		thumbnailPath: data => {
			if(data.imagePath) {
				return data.imagePath.replace('image.webp', 'thumbnail.webp');
			}
		},
		socialMediaPhoto: data => {
			if(data.imagePath) {
				return data.meta.site.url + data.imagePath;
			}
		},
		intro: data => {
			return (data.review.length > 150) ? data.review.slice(0, 140) + '...' : data.review;
		},
	}
};
