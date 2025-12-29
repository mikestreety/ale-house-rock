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
		relatedBeersByStyle: data => {
			if (!data.style) return null;

			// Get all beers with the same style, excluding current beer
			const beersWithStyle = data.collections.beer
				.filter(beer => beer.data.style === data.style && beer.data.permalink !== data.permalink)
				.reverse(); // Most recent first

			return beersWithStyle.length > 0 ? beersWithStyle[0] : null;
		},
		relatedBeersByShop: data => {
			if (!data.purchased) return null;

			// Get all beers purchased from the same shop, excluding current beer
			const beersFromShop = data.collections.beer
				.filter(beer => beer.data.purchased === data.purchased && beer.data.permalink !== data.permalink)
				.reverse(); // Most recent first

			return beersFromShop.length > 0 ? beersFromShop[0] : null;
		},
		relatedBeersByBrewery: data => {
			if (!data.breweries || data.breweries.length === 0) return null;

			// Get all beers from any of the same breweries, excluding current beer
			const beersFromBrewery = data.collections.beer
				.filter(beer => {
					if (beer.data.permalink === data.permalink) return false;
					if (!beer.data.breweries) return false;
					// Check if any brewery matches
					return data.breweries.some(brewery => beer.data.breweries.includes(brewery));
				})
				.reverse(); // Most recent first

			return beersFromBrewery.length > 0 ? beersFromBrewery[0] : null;
		},
		ratingWord: data => {
			if (!data.rating) return null;

			const rating = Math.floor(data.rating);

			if (rating >= 9) return 'excellent';
			if (rating === 8) return 'good';
			if (rating === 6 || rating === 7) return 'average';
			if (rating === 4 || rating === 5) return 'below';
			if (rating <= 3) return 'poor';

			return null;
		},
	}
};
