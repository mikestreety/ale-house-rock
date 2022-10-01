const findBySlug = require('./../../filters/findBySlug');

module.exports = {
	eleventyComputed: {
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
		seoTitle: data => {
			return `${data.title} by ${data.brewedBy}`
		},
		imagePath: data => {
			if(data.page) {
				return `/images/${data.number}/image.webp`
			}
		},
		thumbnailPath: data => {
			if(data.imagePath) {
				return data.imagePath.replace('image.webp', 'thumbnail.webp');
			}
		}
	}
};
