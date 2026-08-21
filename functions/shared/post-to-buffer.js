// Shared by add-beer.js (posting a freshly-added review) and
// retry-buffer-post.js (retrying one that failed or wasn't configured
// at the time) so both stay in sync with a single implementation.
const { createBufferPost, getOccupiedDays, pickScheduledTime } = require('./buffer-graphql');
const { addPending } = require('./pending-instagram-store');

/**
 * Schedule a Buffer post for a beer review across every configured
 * channel, and queue it for later Instagram-link resolution.
 *
 * Returns { configured, success, message } - configured is false if
 * Buffer isn't set up at all (not an error, just a no-op); otherwise
 * success/message describe what happened.
 */
async function postReviewToBuffer({ title, breweryNames, rating, reviewText, imageUrl, permalink, filePath }) {
	if (!process.env.BUFFER_ACCESS_TOKEN || !process.env.BUFFER_CHANNEL_IDS) {
		return { configured: false, success: null, message: null };
	}

	const result = { configured: true, success: null, message: null };

	try {
		const channelIds = process.env.BUFFER_CHANNEL_IDS.split(',').map(id => id.trim()).filter(Boolean);
		const accessToken = process.env.BUFFER_ACCESS_TOKEN;

		const { occupiedDays, failures: occupiedDaysFailures } = await getOccupiedDays(channelIds, accessToken);
		const scheduledAt = pickScheduledTime(occupiedDays);

		// If every channel's lookup failed, occupiedDays is empty not because
		// nothing's scheduled but because we couldn't check - flag that so
		// it's visible in the report instead of quietly always landing on
		// "tomorrow" as if the day were free.
		const occupiedDaysCheckFailed = occupiedDaysFailures.length > 0 && occupiedDaysFailures.length === channelIds.length;
		const occupiedDaysWarning = occupiedDaysCheckFailed
			? `Warning: could not check for already-scheduled posts (${occupiedDaysFailures.join('; ')}) - scheduled anyway without avoiding a busy day. `
			: '';

		const caption = [
			`🍺 ${title}`,
			`🏢 ${breweryNames.join(', ')}`,
			`📝 ${reviewText}`,
			`🏅 ${rating}/10`
		].join('\n');

		// createPost takes a single channel per call, so post to each
		// configured channel separately and collect whatever succeeds.
		const postIds = [];
		const channelErrors = [];

		for (const channelId of channelIds) {
			try {
				const post = await createBufferPost({
					channelId,
					text: caption,
					imageUrl,
					dueAt: scheduledAt,
					accessToken,
				});
				postIds.push(post.id);
			} catch (e) {
				channelErrors.push(`${channelId}: ${e.message}`);
			}
		}

		if (postIds.length) {
			result.success = channelErrors.length === 0;
			result.message = occupiedDaysWarning + (channelErrors.length
				? `Scheduled for ${scheduledAt.toUTCString()} on ${postIds.length}/${channelIds.length} channel(s). Failures: ${channelErrors.join('; ')}`
				: `Scheduled for ${scheduledAt.toUTCString()}`);

			// Track the created post(s) so resolve-instagram-links can later
			// look up the live post URL once Buffer sends it, and link it
			// back onto this beer. Non-fatal if it fails - it just means
			// this one beer won't get auto-linked.
			try {
				await addPending({
					permalink,
					filePath,
					buffer_post_ids: postIds,
					addedAt: new Date().toISOString(),
				});
			} catch (e) {
				console.error('Failed to queue pending Instagram link lookup:', e.message);
			}
		} else {
			result.success = false;
			result.message = channelErrors.join('; ');
			console.error('Buffer API error(s):', result.message);
		}
	} catch (e) {
		result.success = false;
		result.message = e.message;
		console.error('Failed to queue Buffer post:', e.message);
	}

	return result;
}

module.exports = { postReviewToBuffer };
