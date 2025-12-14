#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BEER_DIR = 'app/content/beer';
const BREWERY_DIR = 'app/content/brewery';

// Read and parse a markdown file with JSON frontmatter
function parseMarkdownFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const match = content.match(/^---json?\s*\n([\s\S]*?)\n---/);

  if (match) {
    try {
      return JSON.parse(match[1]);
    } catch (e) {
      console.error(`Error parsing JSON in ${filePath}:`, e.message);
      return null;
    }
  }

  return null;
}

// Get brewery name from brewery file
function getBreweryName(breweryPermalink) {
  // Remove 'brewery/' prefix and trailing slash if present
  const brewerySlug = breweryPermalink.replace('brewery/', '').replace(/\/$/, '');
  const breweryFile = path.join(BREWERY_DIR, brewerySlug + '.md');

  if (fs.existsSync(breweryFile)) {
    const content = fs.readFileSync(breweryFile, 'utf8');
    const titleMatch = content.match(/^title:\s*(.+)$/m);
    if (titleMatch) {
      return titleMatch[1].trim();
    }
  }

  console.log(`  Warning: Brewery file not found: ${breweryFile}`);
  return null;
}

// Add untappd_link to markdown file
function addUntappdLink(filePath, untappdLink) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Check if untappd_link already exists
  if (content.includes('"untappd_link"')) {
    console.log('  File already has untappd_link, skipping update');
    return false;
  }

  // Add after canonical line
  content = content.replace(
    /("canonical":\s*"[^"]*",?)/,
    `$1\n  "untappd_link": "${untappdLink}",`
  );

  fs.writeFileSync(filePath, content, 'utf8');
  return true;
}

// Search for beer on Untappd
async function searchUntappdForBeer(page, beerTitle, breweryName) {
  try {
    console.log(`  Searching Untappd for: "${beerTitle}" by "${breweryName}"`);

    // Navigate to Untappd search
    const searchUrl = `https://untappd.com/search?q=${encodeURIComponent(beerTitle + ' ' + breweryName)}&type=beer`;
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });

    // Wait a bit for results to load
    await page.waitForTimeout(2000);

    // Look for beer results
    const results = await page.$$('.beer-item');

    if (results.length === 0) {
      console.log('  No results found');
      return null;
    }

    // Try to find exact match or close match
    for (const result of results.slice(0, 3)) {
      const nameElement = await result.$('.name');
      const breweryElement = await result.$('.brewery');
      const linkElement = await result.$('a[href*="/b/"]');

      if (!nameElement || !breweryElement || !linkElement) continue;

      const name = await nameElement.textContent();
      const brewery = await breweryElement.textContent();
      const href = await linkElement.getAttribute('href');

      console.log(`  Found: "${name}" by "${brewery}"`);

      // Check if it's a good match
      if (name.toLowerCase().includes(beerTitle.toLowerCase()) ||
          beerTitle.toLowerCase().includes(name.toLowerCase())) {
        const fullUrl = `https://untappd.com${href}`;
        console.log(`  ✓ Match found: ${fullUrl}`);
        return fullUrl;
      }
    }

    console.log('  No exact match found in results');
    return null;

  } catch (error) {
    console.error(`  Error searching: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('Finding Instagram beers and searching Untappd...\n');

  // Get all markdown files
  const files = fs.readdirSync(BEER_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => path.join(BEER_DIR, f))
    .reverse(); // Start with newest

  let processed = 0;
  let updated = 0;
  let skipped = 0;

  // Launch browser
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    for (const file of files) {
      const filename = path.basename(file);
      const data = parseMarkdownFile(file);

      if (!data) continue;

      // Check if it has Instagram canonical
      if (data.canonical && data.canonical.includes('instagram.com')) {
        // Skip if already has untappd_link
        if (data.untappd_link) {
          console.log(`Skipping: ${filename} (already has untappd_link)`);
          skipped++;
          continue;
        }

        console.log(`Processing: ${filename}`);
        console.log(`  Title: ${data.title}`);

        // Get brewery name
        let breweryName = 'Unknown';
        if (data.breweries && data.breweries.length > 0) {
          breweryName = getBreweryName(data.breweries[0]) || 'Unknown';
          console.log(`  Brewery: ${breweryName}`);
        }

        // Search Untappd
        const untappdLink = await searchUntappdForBeer(page, data.title, breweryName);

        if (untappdLink) {
          if (addUntappdLink(file, untappdLink)) {
            console.log(`  ✓ Added untappd_link to file`);
            updated++;
          }
        } else {
          console.log(`  ✗ Could not find beer on Untappd`);
          skipped++;
        }

        processed++;
        console.log('');

        // Add delay between searches
        await page.waitForTimeout(1000);
      }
    }
  } finally {
    await browser.close();
  }

  console.log('================================');
  console.log('Summary:');
  console.log(`  Files processed: ${processed}`);
  console.log(`  Files updated: ${updated}`);
  console.log(`  Files skipped: ${skipped}`);
  console.log('================================');
}

main().catch(console.error);
