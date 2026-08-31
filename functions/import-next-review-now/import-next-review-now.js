// netlify/functions/import-next-review-now.js
//
// Manually-triggerable copy of import-next-review.js, for forcing an
// import run instead of waiting for the schedule.
//
// import-next-review.js is registered with a `schedule` in netlify.toml,
// which makes Netlify treat it as an internally-invoked scheduled
// function - requesting its URL directly is rejected by Netlify itself
// (403), regardless of anything in this repo. This is a separate,
// unscheduled function running the identical shared logic, so it stays
// reachable via its own URL. No token needed - it takes no parameters and
// the ACCESS_TOKEN used to authorise the downstream add-beer commit is
// read server-side from the environment.
//
// Usage:
//   /.netlify/functions/import-next-review-now

import { importNextReview } from '../shared/import-next-review.js';

export async function handler() {
	return await importNextReview();
}
