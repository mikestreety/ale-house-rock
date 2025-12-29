const fetch = require('node-fetch');
const matter = require('gray-matter');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

/**
 * Check if a file exists in the repository
 * Handles both local dev mode and remote GitLab API
 */
async function fileExists(filePath, isDev, projectRoot, api, repoId, repoBranch) {
  if (isDev) {
    const localPath = path.join(projectRoot, filePath);
    return fs.existsSync(localPath);
  } else {
    try {
      await api.RepositoryFiles.showRaw(repoId, filePath, { ref: repoBranch });
      return true;
    } catch(e) {
      console.log(`File does not exist: ${filePath}`);
      return false;
    }
  }
}

/**
 * Process and optimize an image
 * @param {Buffer} imageBuffer - Image data
 * @param {number} width - Target width in pixels
 * @param {number} height - Target height in pixels
 * @param {Object} options - Additional sharp options
 * @returns {Promise<Buffer>} Optimized image buffer
 */
async function processImage(imageBuffer, width, height, options = {}) {
  const defaultOptions = {
    fit: 'contain',
    background: { r: 255, g: 255, b: 255, alpha: 1 }
  };

  return await sharp(imageBuffer)
    .resize(width, height, { ...defaultOptions, ...options })
    .webp({ lossless: true })
    .toBuffer();
}

/**
 * Fetch and process an image from a URL
 * @param {string} imageUrl - URL of the image
 * @param {number} width - Target width
 * @param {number} height - Target height
 * @param {Object} options - Additional sharp options
 * @returns {Promise<{buffer: Buffer, base64: string}>}
 */
async function fetchAndProcessImage(imageUrl, width, height, options = {}) {
  const image = await fetch(imageUrl);
  const imageBuffer = await image.buffer();
  const processedBuffer = await processImage(imageBuffer, width, height, options);

  return {
    buffer: processedBuffer,
    base64: processedBuffer.toString('base64')
  };
}

/**
 * Create a file commit object for GitLab API
 * @param {string} filePath - Path of file in repository
 * @param {string|Buffer} content - File content
 * @param {string} encoding - Content encoding ('utf-8' or 'base64')
 * @returns {Object} Commit file object
 */
function createCommitFile(filePath, content, encoding = 'utf-8') {
  return {
    action: 'create',
    filePath,
    content: encoding === 'base64' ? content : content,
    encoding
  };
}

/**
 * Handle brewery file creation
 */
async function handleBrewery(brewery, isDev, projectRoot, api, repoId, repoBranch) {
  const filePath = `app/content/brewery/${brewery.slug}.md`;

  const exists = await fileExists(filePath, isDev, projectRoot, api, repoId, repoBranch);
  if (exists) {
    return [];
  }

  const commitFiles = [];

  // Process brewery image
  if (brewery.image) {
    const { base64 } = await fetchAndProcessImage(brewery.image, 300, 300);
    commitFiles.push(
      createCommitFile(
        `app/content/images/brewery/${brewery.slug}/image.webp`,
        base64,
        'base64'
      )
    );
  }

  // Create brewery metadata file
  const description = brewery.description;
  delete brewery.image;
  delete brewery.slug;
  delete brewery.description;

  commitFiles.push(
    createCommitFile(filePath, matter.stringify('\n' + description, brewery))
  );

  return commitFiles;
}

/**
 * Handle shop file creation
 */
async function handleShop(purchased, isDev, projectRoot, api, repoId, repoBranch) {
  const filePath = `app/content/shop/${purchased.slug}.md`;

  const exists = await fileExists(filePath, isDev, projectRoot, api, repoId, repoBranch);
  if (exists) {
    return [];
  }

  const shopData = { ...purchased };
  delete shopData.slug;

  return [
    createCommitFile(filePath, matter.stringify('\n', shopData))
  ];
}

/**
 * Handle style file creation
 */
async function handleStyle(style, isDev, projectRoot, api, repoId, repoBranch) {
  const filePath = `app/content/style/${style.slug}.md`;

  const exists = await fileExists(filePath, isDev, projectRoot, api, repoId, repoBranch);
  if (exists) {
    return [];
  }

  const styleData = { ...style };
  delete styleData.slug;

  return [
    createCommitFile(filePath, matter.stringify('\n', styleData))
  ];
}

module.exports = {
  fileExists,
  processImage,
  fetchAndProcessImage,
  createCommitFile,
  handleBrewery,
  handleShop,
  handleStyle
};
