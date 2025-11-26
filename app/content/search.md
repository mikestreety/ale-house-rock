---
layout: default.njk
seoTitle: Search
---

# Search

<div id="results"><h3>Searching...</h3></div>

<script>
const queryString = new URLSearchParams(window.location.search),
		search = queryString.get('q').trim().toLowerCase();

function highlightMatches(sourceText, searchWord) {
  const escapedSearch = searchWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedSearch})`, 'gi');
  return sourceText.replace(regex, '<mark>$1</mark>');
}

let searchData = fetch('/api/beers.json').then(data => data.json())
	.then(data => {
		let results = [];
		for(let item of data) {

			let points = 0,
				regex = new RegExp(search, 'g'),
				title = item.title.toLowerCase(),
				brewery = item.brewery.toLowerCase();

			if(title.includes(search)) {
				points += title.match(regex).length;
			}

			if(brewery.includes(search)) {
				points += brewery.match(regex).length;
			}


			if(points) {
				results.push(item);
			}
		}
		results = results.reverse();
		return results;
	});

searchData.then(data => {
	let results = document.getElementById('results')

	results.innerHTML = '<h3>No results</h3>';

	if(data.length) {
		results.innerHTML = `<h3>${data.length} result${data.length === 1 ? '' : 's'} found</h3>`;

		list = document.createElement('ul');
		for (let beer of data) {
			let childElement = document.createElement('li');

			let breweries = '';
			for(let brewery of beer.breweries) {
				breweries += `<a href="${ brewery.slug }" class="brewery">${ highlightMatches(brewery.title, search) }</a>, `
			}
			childElement.innerHTML = `
				<a href="${ beer.slug }" title="${ beer.title }">
					<img src="${ beer.thumbnail }" width="150" height="150" loading="lazy" alt="${ beer.brewery } - ${ beer.title }">
				</a>
				<div class="content">
					<div class="breweries">${ breweries.trim().slice(0, -1) }</div>
					<a href="${ beer.slug }" class="title">${ highlightMatches(beer.title, search) }</a>
					<div class="rating">${ beer.rating }</div>

					<div class="meta">
						<div class="number">${ beer.number } - ${ beer.date }</div>
					</div>
				</div>
			`;
			list.appendChild(childElement)
		}

		list.className = 'list';
		results.appendChild(list);
	}

});

document.getElementById('searchbox').value = search;
</script>
