// Buffer's legacy REST API (api.bufferapp.com/1/...) stopped accepting
// personal/public API tokens - Buffer now requires the GraphQL API
// (https://developers.buffer.com/guides/rest-migration.html) for those.
// This wraps the bits add-beer.js and resolve-instagram-links.js need.
//
// CONFIDENCE NOTE: the createPost mutation shape below is reconstructed
// from Buffer's public docs/examples (not verified against a live
// account or schema introspection from this environment - the docs
// domain is blocked here). If it's wrong, bufferRequest() below folds a
// schema introspection of CreatePostInput/Post into the thrown error so
// the real field/enum names show up in the add-beer report instead of
// just a bare "GraphQL error" - use that to correct the shape in one
// pass rather than guessing again.

const fetch = require('node-fetch');

const BUFFER_API = 'https://api.buffer.com';

async function bufferRequest(query, variables, accessToken) {
	const res = await fetch(BUFFER_API, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'authorization': `Bearer ${accessToken}`,
		},
		body: JSON.stringify({ query, variables }),
	});

	const json = await res.json().catch(() => null);

	if (!res.ok || !json || json.errors) {
		const errorDetail = json?.errors ? JSON.stringify(json.errors) : await res.text().catch(() => res.statusText);
		const schema = await introspectRelevantTypes(accessToken).catch(() => null);
		const schemaNote = schema ? `\n\nIntrospected schema for debugging:\n${JSON.stringify(schema, null, 2)}` : '';
		throw new Error(`Buffer GraphQL error (${res.status}): ${errorDetail}${schemaNote}`);
	}

	return json.data;
}

/**
 * Best-effort introspection of the types this integration relies on, so
 * a shape mismatch is diagnosable from the error message alone instead
 * of requiring another round of guessing.
 */
async function introspectRelevantTypes(accessToken) {
	const query = `
		query IntrospectBufferTypes {
			createPostInput: __type(name: "CreatePostInput") {
				inputFields { name type { name kind ofType { name kind ofType { name kind } } } }
			}
			postInputMetaData: __type(name: "PostInputMetaData") {
				inputFields { name type { name kind ofType { name kind } } }
			}
			instagramMetadata: __type(name: "InstagramPostMetadataInput") {
				inputFields { name type { name kind ofType { name kind } } }
			}
			postsInput: __type(name: "PostsInput") {
				inputFields { name type { name kind ofType { name kind ofType { name kind } } } }
			}
			postStatus: __type(name: "PostStatus") {
				enumValues { name }
			}
		}
	`;

	const res = await fetch(BUFFER_API, {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'authorization': `Bearer ${accessToken}` },
		body: JSON.stringify({ query }),
	});

	const json = await res.json();
	return json.data;
}

/**
 * Create (schedule) a post on a single Buffer channel.
 * Returns { id, status } on success, throws on failure.
 */
async function createBufferPost({ channelId, text, imageUrl, dueAt, accessToken }) {
	const query = `
		mutation CreatePost($input: CreatePostInput!) {
			createPost(input: $input) {
				... on PostActionSuccess {
					post { id text status dueAt }
				}
				... on MutationError {
					message
				}
			}
		}
	`;

	const variables = {
		input: {
			text,
			channelId,
			schedulingType: 'automatic',
			mode: 'customScheduled',
			dueAt: dueAt.toISOString(),
			assets: [{ image: { url: imageUrl } }],
			// Instagram requires a post type (post/story/reel) and
			// shouldShareToFeed via InstagramPostMetadataInput - all our
			// configured channels are Instagram, so this is unconditional.
			metadata: {
				instagram: {
					type: 'post',
					shouldShareToFeed: true,
				},
			},
		},
	};

	const data = await bufferRequest(query, variables, accessToken);
	const result = data.createPost;

	if (result?.message && !result?.post) {
		const schema = await introspectRelevantTypes(accessToken).catch(() => null);
		const schemaNote = schema ? `\n\nIntrospected schema for debugging:\n${JSON.stringify(schema, null, 2)}` : '';
		throw new Error(`Buffer rejected the post: ${result.message}${schemaNote}`);
	}

	if (!result?.post?.id) {
		throw new Error(`Unexpected createPost response: ${JSON.stringify(result)}`);
	}

	return result.post;
}

/**
 * Look up each channel's scheduled posts and return the set of days
 * (YYYY-MM-DD, UTC) that already have at least one post due, so a new
 * post can avoid piling up on the same day. Best-effort per channel - one
 * that fails to load just contributes nothing to occupiedDays - but every
 * failure is collected and returned too, so a caller can surface "this
 * check didn't actually run" instead of silently scheduling as if no
 * days were occupied.
 */
async function getOccupiedDays(channelIds, accessToken) {
	const occupiedDays = new Set();
	const failures = [];

	await Promise.all(channelIds.map(async (channelId) => {
		try {
			const query = `
				query GetScheduledPosts($channelId: ChannelId!) {
					posts(input: { channelId: $channelId, status: [scheduled], first: 50 }) {
						edges { node { dueAt } }
					}
				}
			`;
			const data = await bufferRequest(query, { channelId }, accessToken);
			for (const edge of data?.posts?.edges || []) {
				if (edge.node?.dueAt) {
					occupiedDays.add(new Date(edge.node.dueAt).toISOString().slice(0, 10));
				}
			}
		} catch (e) {
			console.error(`Failed to fetch scheduled posts for channel ${channelId}:`, e.message);
			failures.push(`${channelId}: ${e.message}`);
		}
	}));

	return { occupiedDays, failures };
}

/**
 * Pick a random time between 6:00pm and 8:59pm on the next day (looking
 * up to two weeks ahead) that doesn't already have a post scheduled. If
 * every day in that window already has one, falls back to tomorrow.
 */
function pickScheduledTime(occupiedDays) {
	const MAX_LOOKAHEAD_DAYS = 14;
	let chosenDate;

	for (let offset = 1; offset <= MAX_LOOKAHEAD_DAYS; offset++) {
		const candidate = new Date();
		candidate.setUTCDate(candidate.getUTCDate() + offset);

		if (!occupiedDays.has(candidate.toISOString().slice(0, 10))) {
			chosenDate = candidate;
			break;
		}
	}

	if (!chosenDate) {
		chosenDate = new Date();
		chosenDate.setUTCDate(chosenDate.getUTCDate() + 1);
	}

	const hour = 18 + Math.floor(Math.random() * 3); // 18, 19 or 20 (6pm-8:59pm)
	const minute = Math.floor(Math.random() * 60);
	chosenDate.setUTCHours(hour, minute, 0, 0);

	return chosenDate;
}

let cachedLinkFieldNames = null;

/**
 * GraphQL rejects a query outright if it asks for a field that doesn't
 * exist, so the live-post-URL field (unverified - see file header)
 * can't just be guessed inline. Instead, introspect the Post type once
 * per invocation and pick out fields that look link-shaped by name;
 * those are then safe to request because introspection just confirmed
 * they exist.
 */
async function discoverPostLinkFields(accessToken) {
	if (cachedLinkFieldNames) {
		return cachedLinkFieldNames;
	}

	const query = `
		query IntrospectPostType {
			__type(name: "Post") {
				fields { name }
			}
		}
	`;

	const data = await bufferRequest(query, {}, accessToken);
	const fieldNames = (data?.__type?.fields || []).map(f => f.name);
	cachedLinkFieldNames = fieldNames.filter(name => /url|link|permalink/i.test(name));
	return cachedLinkFieldNames;
}

/**
 * Fetch a post's status plus whichever discovered fields might hold its
 * live URL once sent. Returns the raw post object (with the candidate
 * field names attached as __linkFields) so the caller can pick out
 * whichever one is actually populated.
 */
async function getPostStatus(postId, accessToken) {
	const linkFields = await discoverPostLinkFields(accessToken).catch(() => []);

	const query = `
		query GetPost($id: PostId!) {
			post(input: { id: $id }) {
				id
				status
				dueAt
				sentAt
				${linkFields.join('\n\t\t\t\t')}
			}
		}
	`;

	const data = await bufferRequest(query, { id: postId }, accessToken);
	const post = data?.post || null;

	if (post) {
		post.__linkFields = linkFields;
	}

	return post;
}

module.exports = {
	bufferRequest,
	createBufferPost,
	getOccupiedDays,
	pickScheduledTime,
	getPostStatus,
};
