// netlify/functions/import-next-review.js
//
// Scheduled run of the RSS import (see functions/shared/import-next-review.js
// for what it actually does).
//
// Scheduled functions are invoked internally by Netlify's own scheduler,
// not by requesting this endpoint from the outside - Netlify rejects
// direct external calls to a scheduled function's URL. To trigger an
// import run on demand, use import-next-review-now instead, which runs
// the exact same shared logic but isn't registered as scheduled in
// netlify.toml, so it stays reachable via its own URL.

import { importNextReview } from '../shared/import-next-review.js';

export async function handler() {
	return await importNextReview();
}
