#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const BEER_DIR = 'app/content/beer';
const BREWERY_DIR = 'app/content/brewery';

// Slugify function (from add-beer.js)
function slugify(str) {
  if (str) {
    str = str.replace(/^\s+|\s+$/g, ''); // trim
    str = str.toLowerCase();

    // remove accents, swap ñ for n, etc
    var from = "àáäâèéëêìíïîòóöôùúüûñç·/_,:;";
    var to = "aaaaeeeeiiiioooouuuunc------";
    for (var i = 0, l = from.length; i < l; i++) {
      str = str.replace(new RegExp(from.charAt(i), 'g'), to.charAt(i));
    }

    str = str.replace(/[^a-z0-9 -]/g, '') // remove invalid chars
      .replace(/\s+/g, '-') // collapse whitespace and replace by -
      .replace(/-+/g, '-'); // collapse dashes
  }

  return str;
}

// Read and parse a markdown file with JSON frontmatter
function parseMarkdownFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const match = content.match(/^---json?\s*\n([\s\S]*?)\n---/);

  if (match) {
    try {
      return {
        data: JSON.parse(match[1]),
        content: content,
        frontmatterEnd: match[0].length
      };
    } catch (e) {
      console.error(`Error parsing JSON in ${filePath}:`, e.message);
      return null;
    }
  }

  return null;
}

// Update markdown file with new data
function updateMarkdownFile(filePath, newData) {
  const content = fs.readFileSync(filePath, 'utf8');
  const match = content.match(/^---json?\s*\n([\s\S]*?)\n---/);

  if (match) {
    const restOfFile = content.substring(match[0].length);
    const newContent = '---json\n' + JSON.stringify(newData, null, 4) + '\n---' + restOfFile;
    fs.writeFileSync(filePath, newContent, 'utf8');
    return true;
  }

  return false;
}

async function main() {
  console.log('Syncing beer data from Untappd API...\n');

  // Fetch brewery aliases
  console.log('Fetching brewery aliases...');
  const breweryAliases = await fetch('https://alehouse.rocks/api/breweries/aliases.json')
    .then(data => data.json())
    .catch(err => {
      console.error('Error fetching brewery aliases:', err.message);
      return {};
    });

  // Get all markdown files
  const files = fs.readdirSync(BEER_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => path.join(BEER_DIR, f))
    .reverse(); // Start with newest

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const file of files) {
    const filename = path.basename(file);
    const parsed = parseMarkdownFile(file);

    if (!parsed) {
      console.log(`Skipping: ${filename} (cannot parse)`);
      skipped++;
      continue;
    }

    const data = parsed.data;

    // Skip if no untappd_link
    if (!data.untappd_link) {
      console.log(`Skipping: ${filename} (no untappd_link)`);
      skipped++;
      continue;
    }

    console.log(`\nProcessing: ${filename}`);
    console.log(`  Title: ${data.title}`);
    console.log(`  Untappd Link: ${data.untappd_link}`);

    // Transform untappd.com URL to API URL
    const apiUrl = data.untappd_link.replace('https://untappd.com/', 'https://untappd.alehouse.rocks/');
    console.log(`  API URL: ${apiUrl}`);

    try {
      // Fetch data from API
      const apiData = await fetch(apiUrl).then(res => res.json());

      if (!apiData || apiData.status === 404) {
        console.log('  ✗ API returned no data or 404');
        errors++;
        continue;
      }

      let hasChanges = false;
      const changes = [];

      // Update title if different
      if (apiData.title && apiData.title !== data.title) {
        changes.push(`title: "${data.title}" → "${apiData.title}"`);
        data.title = apiData.title;
        hasChanges = true;
      }

      // Add/update ABV if missing or different
      if (apiData.abv) {
        if (!data.abv) {
          changes.push(`abv: added "${apiData.abv}"`);
          data.abv = apiData.abv;
          hasChanges = true;
        } else if (data.abv !== apiData.abv) {
          changes.push(`abv: "${data.abv}" → "${apiData.abv}"`);
          data.abv = apiData.abv;
          hasChanges = true;
        }
      }

      // Add/update style if missing or different
      if (apiData.style) {
        if (!data.style) {
          changes.push(`style: added "${apiData.style}"`);
          data.style = apiData.style;
          hasChanges = true;
        } else if (data.style !== apiData.style) {
          changes.push(`style: "${data.style}" → "${apiData.style}"`);
          data.style = apiData.style;
          hasChanges = true;
        }
      }

      // Process breweries
      if (apiData.breweries && apiData.breweries.length > 0) {
        const newBreweryPaths = [];
        const breweryChanges = [];

        for (const brewery of apiData.breweries) {
          let slug = slugify(brewery.title);

          // If we know this brewery by another name
          if (breweryAliases[slug]) {
            slug = breweryAliases[slug];
            breweryChanges.push(`${brewery.title} → ${slug} (aliased)`);
          }

          const breweryPath = `brewery/${slug}/`;
          newBreweryPaths.push(breweryPath);
        }

        // Compare brewery arrays
        const currentBreweries = data.breweries || [];
        const breweriesDifferent = JSON.stringify(currentBreweries.sort()) !== JSON.stringify(newBreweryPaths.sort());

        if (breweriesDifferent) {
          changes.push(`breweries: [${currentBreweries.join(', ')}] → [${newBreweryPaths.join(', ')}]`);
          if (breweryChanges.length > 0) {
            changes.push(`  ${breweryChanges.join(', ')}`);
          }
          data.breweries = newBreweryPaths;
          hasChanges = true;
        }
      }

      // Update file if there are changes
      if (hasChanges) {
        console.log('  Changes detected:');
        changes.forEach(change => console.log(`    - ${change}`));

        if (updateMarkdownFile(file, data)) {
          console.log('  ✓ Updated successfully');
          updated++;
        } else {
          console.log('  ✗ Failed to update file');
          errors++;
        }
      } else {
        console.log('  ○ No changes needed');
        skipped++;
      }

      processed++;

      // Add delay to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.error(`  ✗ Error: ${error.message}`);
      errors++;
    }
  }

  console.log('\n================================');
  console.log('Summary:');
  console.log(`  Files processed: ${processed}`);
  console.log(`  Files updated: ${updated}`);
  console.log(`  Files skipped: ${skipped}`);
  console.log(`  Errors: ${errors}`);
  console.log('================================');
}

main().catch(console.error);
