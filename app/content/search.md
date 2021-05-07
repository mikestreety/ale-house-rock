---
layout: default.njk
---

# Search

<div id="results" class="list"></div>

<script>
const queryString = new URLSearchParams(window.location.search),
		search = queryString.get('q').trim().toLowerCase();

let searchData = fetch('/search.json').then(data => data.json())
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

		return results;
	});

searchData.then(data => {
	let results = document.getElementById('results'),
		baseImageUrl = "{{ meta.img }}";

	results.innerHTML = '';

	if(data.length) {
		list = document.createElement('ol');
		for (let beer of data) {
			let childElement = document.createElement('li');
			childElement.innerHTML = `
				<a href="${ beer.slug }" title="">
					<img src="${ baseImageUrl }${ beer.id }/small.webp" width="150" height="150" loading="lazy" alt="${ beer.brewery } - ${ beer.title }">
				</a>
				<div class="content">
					<a href="${ beer.brewery_slug }" class="brewery">${ beer.brewery }</a>
					<a href="${ beer.slug }" class="title">${ beer.title }</a>
					<div class="rating">${ beer.rating }</div>

					<div class="meta">
						<div class="number">${ beer.number }</div>
					</div>
				</div>
			`;
			list.appendChild(childElement)
		}

		results.appendChild(list);
	}

});

document.getElementById('searchbox').value = search;
</script>
