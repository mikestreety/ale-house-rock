const findBySlug = require('./../../filters/findBySlug');
const styleMainName = require('./../../filters/styleMainName');

// Reviews are stored with HTML entities (e.g. &#39;) - decode them for meta
// tags and JSON-LD, which escape the text themselves
const plainText = text => text
	.replace(/<[^>]+>/g, '')
	.replace(/&#39;/g, "'")
	.replace(/&quot;/g, '"')
	.replace(/&amp;/g, '&');

module.exports = {
	layout: 'beer.njk',
	parent: 'beer',
	// The brewery/style/shop dropdowns list every option and were ~70% of a
	// beer page's HTML - they're only useful on list pages
	hideFilters: true,
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

		// Untappd styles are "Main style - Sub category" (e.g. "Pale Ale -
		// Other"). Split it so each half can link to its own style page,
		// while `style` itself keeps holding the full compound value used
		// everywhere else (existing style pages, hashtag matching, etc).
		styleMain: data => styleMainName(data.style),
		styleCategory: data => {
			if (!data.style) return null;
			const separatorIndex = data.style.indexOf(' - ');
			return separatorIndex > -1 ? data.style.slice(separatorIndex + 3) : null;
		},

		purchased_from: data => findBySlug(data.purchased, data.collections.all),
		seoTitle: data => {
			let title = data.brewedBy ? `${data.title} by ${data.brewedBy}` : data.title;

			// The same beer reviewed more than once gets the review number,
			// so each page has a unique title
			const isRepeat = data.collections.beer.some(beer =>
				beer.data.title === data.title && beer.data.permalink !== data.permalink
			);
			if (isRepeat) {
				title += ` (#${data.number})`;
			}

			return data.rating ? `${title} review: ${data.rating}/10` : `${title} review`;
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
			if (!data.review) {
				// No written review - describe the beer from its details instead
				const details = [data.style, data.abv].filter(a => a).join(', ');
				return `${data.title}${data.brewedBy ? ` by ${data.brewedBy}` : ''}${details ? ` (${details})` : ''}, rated ${data.rating}/10 on Ale House Rock.`;
			}

			const review = plainText(data.review);
			return (review.length > 150) ? review.slice(0, 140) + '...' : review;
		},
		schema: data => {
			const url = data.meta.site.url + data.page.url;
			const brewery = (data.breweries || []).find(b => b && b.url);

			const review = {
				'@type': 'Review',
				'@id': `${url}#review`,
				url,
				name: `${data.title} review`,
				itemReviewed: {
					'@type': 'Product',
					name: data.title,
					...(data.brewedBy && { brand: { '@type': 'Brand', name: data.brewedBy } }),
					...(data.socialMediaPhoto && { image: data.socialMediaPhoto }),
					...(data.style && { category: data.style })
				},
				reviewRating: {
					'@type': 'Rating',
					ratingValue: Number(data.rating),
					bestRating: 10,
					worstRating: 0
				},
				author: { '@type': 'Person', name: 'Mike Street', url: 'https://www.mikestreety.co.uk' },
				publisher: { '@type': 'Organization', name: data.meta.site.title, url: data.meta.site.url },
				datePublished: data.page.date.toISOString().slice(0, 10),
				...(data.review && { reviewBody: plainText(data.review) })
			};

			const crumbs = [
				{ name: 'Beers', url: `${data.meta.site.url}/beers/` },
				...(brewery ? [{ name: brewery.data.title, url: data.meta.site.url + brewery.url }] : []),
				{ name: data.title, url }
			];

			return {
				'@context': 'https://schema.org',
				'@graph': [
					review,
					{
						'@type': 'BreadcrumbList',
						itemListElement: crumbs.map((crumb, index) => ({
							'@type': 'ListItem',
							position: index + 1,
							name: crumb.name,
							item: crumb.url
						}))
					}
				]
			};
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
