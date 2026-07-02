const baseUrl = 'https://untappd.com';

// Replace with your actual Netlify site URL
const PROXY_BASE = 'https://alehouse.rocks/.netlify/functions/untappd-proxy';

addEventListener('fetch', event => {
	event.respondWith(handleRequest(event.request));
});

/**
 * Convert an Untappd path or full Untappd URL into a call to the
 * Netlify proxy function, since Untappd blocks Cloudflare's IPs
 * directly (error 1106) but currently allows Netlify's.
 */
function proxyUrl(pathOrUrl) {
	let path = pathOrUrl;
	if (pathOrUrl.startsWith('http')) {
		path = new URL(pathOrUrl).pathname;
	}
	return `${PROXY_BASE}?url=${encodeURIComponent(path)}`;
}

async function handleRequest(request) {
	// Get the path at the end of the workers URL
	const { pathname } = new URL(request.url),
		// Create a new object which has the link to begin with
		output = {
			canonical: (baseUrl + pathname)
		};

	let pathParts = pathname.split('/').filter(v => v !== '');

	// Get the Untappd page, via the Netlify proxy
	let response = await fetch(proxyUrl(pathname));

	// Add the code to highlight if it is a 404
	output.status = response.status;

	if(pathParts.length > 2 && pathParts[2] === 'checkin') {
		return await getCheckin(response, output);
	} else if (pathParts.length > 2 && pathParts[0] === 'b') {
		return await getBeer(response, output)
	} else {
		return await getBrewery(response, output)
	}
}

async function getCheckin(response, output) {

	// Start our HTML Rewriter
	await new HTMLRewriter()
		// Get the image
		.on('.photo .image-big', { 
			element(element) {
				// Background image
				// let reg = /(?:\(['"]?)(.*?)(?:['"]?\))/;
				createOrAddToExisting(output, 'image', element.getAttribute('data-image'));
			}
		})
		// Beer details
		.on('.checkin-info .beer p a', { 
			element(element) {
				createOrAddToExisting(output, 'untappd_link', baseUrl + element.getAttribute('href'));
			}
		})
		// Comment/review
		.on('.checkin-info .comment', { 
			text(text) {
				createOrAddToExisting(output, 'body', text.text);
			}
		})
		// How was it served? e.g. Can, Bottle
		.on('.checkin-info .rating-serving .serving', { 
			text(text) {
				createOrAddToExisting(output, 'serving', text.text);
			}
		})
		// Rating out of 10 (Untappd does 5, double)
		.on('.checkin-info .rating-serving .caps', { 
			element(element) {
				createOrAddToExisting(output, 'rating', (element.getAttribute('data-rating') * 2));
			}
		})
		// Where was it purchased?
		.on('.checkin-extra .purchased-location > div > p:not(.sub-purchased) a', { 
			text(text) {
				createOrAddToExisting(output, 'purchased', text.text);
			}
		})
		// What was the date?
		.on('.checkin-bottom .time', { 
			text(text) {
				if(text.text && Date.parse(text.text)) {
					let date = new Date(Date.parse(text.text));
					createOrAddToExisting(output, 'date', date.toISOString());
				}
			}
		})
		// Pass in the HTML response
		.transform(response)
		// Convert it to an array
		.arrayBuffer();

	// Fetch the beer page via the proxy too
	const beerDetails = await fetch(proxyUrl(output.untappd_link));
	
	output = await getBeerDetails(beerDetails, output);
	
	// Extract any hashtags from the body
	if(output.body) {
		// Find all the hashtags as an array
		let hashtags = output.body.match(/#[a-z0-9_]+/g);
		if(hashtags) {
			// Add them without the hash
			output.tags = hashtags.map(h => h.replace('#', ''));
			// Remove the hashtags from the body
			for(let h of hashtags) {
				output.body = output.body.replace(h, ' ');
			}
			// Remove any empty space
			output.body = output.body.trim();
		}
	}

	// delete output.untappd_link;

	// Convert to a JSON string
	const json = JSON.stringify(output, null, 2)

	// Return the JSON
	return new Response(json, {
		headers: {
			'content-type': 'application/json;charset=UTF-8'
		}
	});
}

async function getBeer(response, output) {
	// Convert to a JSON string
	let details = await getBeerDetails(response, output);
	const json = JSON.stringify(details, null, 2)

	// Return the JSON
	return new Response(json, {
		headers: {
			'content-type': 'application/json;charset=UTF-8'
		}
	});
}

async function getBrewery(response, output) {
	// Convert to a JSON string
	let details = await getBreweryDetails(response, output);
	const json = JSON.stringify(details, null, 2)

	// Return the JSON
	return new Response(json, {
		headers: {
			'content-type': 'application/json;charset=UTF-8'
		}
	});
}

async function getBreweryDetails(response, output = {}) {
	// Start our HTML Rewriter
	await new HTMLRewriter()
		// Get the image
		.on('.top .image-big', { 
			element(element) {
				// Background image
				createOrAddToExisting(output, 'image', element.getAttribute('data-image'));
			}
		})
		// Beer details
		.on('.name h1', { 
			text(text) {
				createOrAddToExisting(output, 'title', text.text);
			},
		})
		.on('.name .brewery', { 
			text(text) {
				createOrAddToExisting(output, 'location', text.text);
			},
		})
		.on('.name .style', { 
			text(text) {
				createOrAddToExisting(output, 'style', text.text);
			},
		})
		.on('.beer-descrption-read-less', { 
			text(text) {
				createOrAddToExisting(output, 'description', text.text.replace('Show Less', ''));
			},
		})
		.on('.actions.social .url', { 
			element(element) {
				createOrAddToExisting(output, 'website', element.getAttribute('href'));
			}
		})
		.on('.actions.social .ig', { 
			element(element) {
				createOrAddToExisting(output, 'instagram', element.getAttribute('href'));
			}
		})
		.on('.actions.social .tw', { 
			element(element) {
				createOrAddToExisting(output, 'twitter', element.getAttribute('href'));
			}
		})
		.on('.actions.social .fb', { 
			element(element) {
				createOrAddToExisting(output, 'facebook', element.getAttribute('href'));
			}
		})
		// Pass in the HTML response
		.transform(response)
		// Convert it to an array
		.arrayBuffer();

	// Convert to a JSON string
	return output;
}

async function getBeerDetails(response, output = {}) {
	// Start our HTML Rewriter
	await new HTMLRewriter()
		// Beer details
		.on('.name h1', { 
			text(text) {
				createOrAddToExisting(output, 'title', text.text);
			},
		})
		// Beer details
		.on('.brewery a', { 
			element(element) {
				createOrAddToExisting(output, 'brewery_links', [baseUrl + element.getAttribute('href')]);
			}
		})
		.on('.subsidiary a[href^="/brewery"]', { 
			element(element) {
				createOrAddToExisting(output, 'brewery_links', [baseUrl + element.getAttribute('href')]);
			}
		})
		.on('p.style', { 
			text(text) {
				if(text.text) {
					createOrAddToExisting(output, 'style', text.text);
				}
			}
		})
		.on('p.abv', { 
			text(text) {
				if(text.text) {
					let abv = text.text.replace('ABV', '').trim()
					createOrAddToExisting(output, 'abv', abv);
				}
				
			}
		})
		// Pass in the HTML response
		.transform(response)
		// Convert it to an array
		.arrayBuffer();

	if(output.brewery_links) {
		output.breweries = [];
		for(let b of output.brewery_links) {
			// Fetch each brewery page via the proxy
			let breweries = await getBreweryDetails(await fetch(proxyUrl(b)));
			breweries.untappd = b;
			output.breweries.push(breweries);
		}

		delete output.brewery_links;
	}

	return output;
}

/**
 * Create a new index or appended to existing one if it already exists
 * 
 * @param attr the key
 * @param text the value
 * @returns 
 */
function createOrAddToExisting(output, attr, text) {
	if(!text) {
		return;
	}

	if(Array.isArray(text)) {
		let result = output[attr] === undefined ? [] : output[attr];
		for(let t of text) {
			if(t) {
				t = t.replace(/[\n\t\r]/g," ").trim();
				result.push(t);
			}
			
		}

		output[attr] = result
	} else {
		// Replace new line characters with spaces
		text = String(text).replace(/[\n\t\r]/g," ").trim();

		// If it exists, append, if it doesn't create it
		output[attr] = (output[attr] === undefined ? '' : output[attr])  + text;
	}	
}