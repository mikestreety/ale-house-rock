// Backfills Untappd flavour tags (see getFlavourTags in
// functions/untappd/untappd.js) onto existing beer entries that already
// link to an Untappd beer page (meta.untappd) but were added before
// flavour-tag scraping existed.
//
// Fetches untappd.com directly, same as the live scraping function, so
// it needs to be run somewhere with real network access to it (this
// can't run from a network-sandboxed environment). It only rewrites the
// affected .md files - it does not commit anything, so review the diff
// and commit yourself once you're happy with it.
//
// Usage:
//   node scripts/backfill-beer-tags.mjs [--limit=N] [--delay=MS] [--dry-run]
//
//   --limit=N    only process the first N beers with an Untappd link (default: all)
//   --delay=MS   pause this long between requests, to go easy on Untappd (default: 1500)
//   --dry-run    fetch and log what would change, but don't write any files

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';

import { stringifyBeer } from '../functions/shared/beer-frontmatter.js';
import { fetchBeerTags } from '../functions/untappd/untappd.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BEER_DIR = path.join(__dirname, '..', 'app', 'content', 'beer');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limit = parseArgInt('--limit', Infinity);
const delayMs = parseArgInt('--delay', 1500);

function parseArgInt(flag, fallback) {
	const arg = args.find(a => a.startsWith(`${flag}=`));
	return arg ? parseInt(arg.split('=')[1], 10) : fallback;
}

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
	const files = fs.readdirSync(BEER_DIR).filter(f => f.endsWith('.md'));

	const candidates = files
		.map(file => {
			const filePath = path.join(BEER_DIR, file);
			const raw = fs.readFileSync(filePath, 'utf8');
			const parsed = matter(raw, { language: 'json' });
			return { file, filePath, parsed, untappdUrl: parsed.data.meta && parsed.data.meta.untappd };
		})
		.filter(beer => beer.untappdUrl);

	console.log(`Found ${candidates.length} beers with an Untappd link (of ${files.length} total).`);

	const toProcess = candidates.slice(0, limit);
	let updated = 0;
	let unchanged = 0;
	const failures = [];

	for (const [i, beer] of toProcess.entries()) {
		const label = beer.parsed.data.title || beer.file;
		process.stdout.write(`[${i + 1}/${toProcess.length}] ${label}: `);

		let tags;
		try {
			tags = await fetchBeerTags(beer.untappdUrl);
		} catch (err) {
			console.log(`FAILED (${err.message})`);
			failures.push({ file: beer.file, url: beer.untappdUrl, error: err.message });
			await sleep(delayMs);
			continue;
		}

		const existingTags = Array.isArray(beer.parsed.data.tags) ? beer.parsed.data.tags : [];
		const mergedTags = [...new Set([...existingTags, ...tags])];
		const isUnchanged = mergedTags.length === existingTags.length
			&& mergedTags.every(t => existingTags.includes(t));

		if (isUnchanged) {
			console.log(tags.length ? 'already up to date' : 'no tags found');
			unchanged++;
			await sleep(delayMs);
			continue;
		}

		console.log(`tags: ${mergedTags.join(', ')}`);
		updated++;

		if (!dryRun) {
			beer.parsed.data.tags = mergedTags;
			fs.writeFileSync(beer.filePath, stringifyBeer(beer.parsed.content, beer.parsed.data));
		}

		await sleep(delayMs);
	}

	console.log('\n--- Summary ---');
	console.log(`Updated:   ${updated}`);
	console.log(`Unchanged: ${unchanged}`);
	console.log(`Failed:    ${failures.length}`);

	if (failures.length) {
		console.log('\nFailures:');
		for (const f of failures) {
			console.log(`  ${f.file} (${f.url}): ${f.error}`);
		}
	}

	if (dryRun) {
		console.log('\n(dry run - no files were written)');
	}
}

main();
