// Small persistent queue (Netlify Blobs) of beers whose Buffer post
// hasn't been confirmed as published yet. add-beer.js pushes an entry
// once it queues a Buffer post; resolve-instagram-links.js drains it
// once Buffer confirms the post went live.
const { getStore } = require('@netlify/blobs');

const STORE_NAME = 'pending-instagram-links';
const KEY = 'queue.json';

function store() {
	return getStore(STORE_NAME);
}

async function getPending() {
	const queue = await store().get(KEY, { type: 'json' });
	return queue || [];
}

async function addPending(entry) {
	const queue = await getPending();
	queue.push(entry);
	await store().setJSON(KEY, queue);
}

async function setPending(queue) {
	await store().setJSON(KEY, queue);
}

module.exports = { getPending, addPending, setPending };
