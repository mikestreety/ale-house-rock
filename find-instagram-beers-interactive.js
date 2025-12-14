#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { chromium } = require('playwright');

const BEER_DIR = 'app/content/beer';
const BREWERY_DIR = 'app/content/brewery';

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Promisify readline question
function question(query) {
  return new Promise(resolve => {
    rl.question(query, resolve);
  });
}

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

// Search for beer on Untappd and return multiple results
async function searchUntappdForBeer(page, beerTitle, breweryName) {
  try {
    console.log(`  Searching Untappd for: "${beerTitle}" by "${breweryName}"`);

    if (breweryName == 'Beak Brewery') {
      breweryName = 'Beak';
    }
    // Navigate to Untappd search
    const searchUrl = `https://untappd.com/search?q=${encodeURIComponent(beerTitle + ' ' + breweryName)}&type=beer`;
    console.log(searchUrl);
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });

    // Wait a bit for results to load
    await page.waitForTimeout(2000);

    // Look for beer results
    const results = await page.$$('.beer-item');

    if (results.length === 0) {
      return [];
    }

    // Extract info from all results
    const beerResults = [];
    for (const result of results.slice(0, 10)) { // Get up to 10 results
      const nameElement = await result.$('.name');
      const breweryElement = await result.$('.brewery');
      const linkElement = await result.$('a[href*="/b/"]');

      if (!nameElement || !breweryElement || !linkElement) continue;

      const name = await nameElement.textContent();
      const brewery = await breweryElement.textContent();
      const href = await linkElement.getAttribute('href');

      beerResults.push({
        name: name.trim(),
        brewery: brewery.trim(),
        url: `https://untappd.com${href}`
      });
    }

    return beerResults;

  } catch (error) {
    console.error(`  Error searching: ${error.message}`);
    return [];
  }
}

async function main() {
  console.log('Finding Instagram beers and searching Untappd (Interactive Mode)...\n');

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

        console.log(`\nProcessing: ${filename}`);
        console.log(`  Title: ${data.title}`);

        // Get brewery name
        let breweryName = 'Unknown';
        if (data.breweries && data.breweries.length > 0) {
          breweryName = getBreweryName(data.breweries[0]) || 'Unknown';
          console.log(`  Brewery: ${breweryName}`);
        }

        // Search Untappd
        const results = await searchUntappdForBeer(page, data.title, breweryName);

        let untappdLink = null;

        if (results.length === 0) {
          console.log('  ✗ No results found on Untappd');
          console.log('\nOptions:');
          console.log('  1. Enter Untappd link manually');
          console.log('  2. Skip this beer');

          const choice = await question('Enter choice (1 or 2): ');

          if (choice.trim() === '1') {
            const manualLink = await question('Enter Untappd link: ');
            if (manualLink.trim() && manualLink.trim().startsWith('http')) {
              untappdLink = manualLink.trim();
            } else {
              console.log('  Invalid link, skipping...');
            }
          } else {
            console.log('  Skipping...');
          }
        } else if (results.length === 1) {
          // Only one result, confirm with user
          console.log(`\n  Found 1 result:`);
          console.log(`  1. ${results[0].name} - ${results[0].brewery}`);
          console.log(`     ${results[0].url}`);

          const confirm = await question('\nIs this correct? (y/n/manual): ');

          if (confirm.toLowerCase() === 'y' || confirm.toLowerCase() === 'yes') {
            untappdLink = results[0].url;
          } else if (confirm.toLowerCase() === 'manual') {
            const manualLink = await question('Enter Untappd link: ');
            if (manualLink.trim() && manualLink.trim().startsWith('http')) {
              untappdLink = manualLink.trim();
            }
          } else {
            console.log('  Skipping...');
          }
        } else {
          // Multiple results, let user choose
          console.log(`\n  Found ${results.length} results:`);
          results.forEach((beer, index) => {
            console.log(`  ${index + 1}. ${beer.name} - ${beer.brewery}`);
            console.log(`     ${beer.url}`);
          });
          console.log(`  ${results.length + 1}. Enter link manually`);
          console.log(`  ${results.length + 2}. Skip this beer`);

          const choice = await question(`\nEnter choice (1-${results.length + 2}): `);
          const choiceNum = parseInt(choice.trim());

          if (choiceNum >= 1 && choiceNum <= results.length) {
            untappdLink = results[choiceNum - 1].url;
          } else if (choiceNum === results.length + 1) {
            const manualLink = await question('Enter Untappd link: ');
            if (manualLink.trim() && manualLink.trim().startsWith('http')) {
              untappdLink = manualLink.trim();
            }
          } else {
            console.log('  Skipping...');
          }
        }

        // Add link to file if we have one
        if (untappdLink) {
          if (addUntappdLink(file, untappdLink)) {
            console.log(`  ✓ Added untappd_link to file`);
            updated++;
          }
        } else {
          skipped++;
        }

        processed++;

        // Add delay between searches
        await page.waitForTimeout(500);
      }
    }
  } finally {
    await browser.close();
    rl.close();
  }

  console.log('\n================================');
  console.log('Summary:');
  console.log(`  Files processed: ${processed}`);
  console.log(`  Files updated: ${updated}`);
  console.log(`  Files skipped: ${skipped}`);
  console.log('================================');
}

main().catch(console.error);
