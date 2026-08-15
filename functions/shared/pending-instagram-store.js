// Small persistent queue (Netlify Blobs) of beers whose Buffer post
// hasn't been confirmed as published yet. add-beer.js pushes an entry
// once it queues a Buffer post; resolve-instagram-links.js drains it
// once Buffer confirms the post went live.
//
// Reads/writes use ETag-based compare-and-swap (retrying on conflict)
// since add-beer.js and resolve-instagram-links.js can run concurrently
// and a plain read-modify-write would let one writer's update silently
// clobber another's.
const { getStore } = require('@netlify/blobs');

const STORE_NAME = 'pending-instagram-links';
const KEY = 'queue.json';
const MAX_RETRIES = 5;

function store() {
	return getStore(STORE_NAME);
}

async function getPending() {
	const result = await store().getWithMetadata(KEY, { type: 'json' });
	return result?.data || [];
}

/**
 * Read-modify-write the queue via `mutate(currentQueue) -> newQueue`,
 * retrying on write conflicts. Throws if it can't win after MAX_RETRIES
 * attempts (heavy concurrent contention).
 */
async function updatePending(mutate) {
	const s = store();

	for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
		const current = await s.getWithMetadata(KEY, { type: 'json' });
		const queue = current?.data || [];
		const nextQueue = mutate(queue);

		const result = current
			? await s.setJSON(KEY, nextQueue, { onlyIfMatch: current.etag })
			: await s.setJSON(KEY, nextQueue, { onlyIfNew: true });

		if (result.modified) {
			return nextQueue;
		}
	}

	throw new Error('Failed to update pending-instagram-links queue - too much write contention');
}

async function addPending(entry) {
	return updatePending(queue => [...queue, entry]);
}

module.exports = { getPending, addPending, updatePending };
