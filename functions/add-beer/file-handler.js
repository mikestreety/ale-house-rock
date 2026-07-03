const fetch = require('node-fetch');
const matter = require('gray-matter');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

/**
 * Check if a file exists in the repository
 * Handles both local dev mode and remote GitHub API
 */
async function fileExists(filePath, isDev, projectRoot, api, owner, repo, repoBranch) {
  if (isDev) {
    const localPath = path.join(projectRoot, filePath);
    return fs.existsSync(localPath);
  } else {
    try {
      await api.repos.getContent({ owner, repo, path: filePath, ref: repoBranch });
      return true;
    } catch(e) {
      console.log(`File does not exist: ${filePath}`);
      return false;
    }
  }
}

/**
 * Create a single commit containing multiple file additions using the
 * GitHub Git Data API (blobs -> tree -> commit -> ref update)
 */
async function createGithubCommit(api, owner, repo, branch, message, commitFiles) {
  const { data: ref } = await api.git.getRef({ owner, repo, ref: `heads/${branch}` });
  const parentSha = ref.object.sha;

  const { data: parentCommit } = await api.git.getCommit({ owner, repo, commit_sha: parentSha });

  const blobs = await Promise.all(commitFiles.map(async (file) => {
    const { data: blob } = await api.git.createBlob({
      owner,
      repo,
      content: file.content,
      encoding: file.encoding === 'base64' ? 'base64' : 'utf-8'
    });

    return {
      path: file.filePath,
      mode: '100644',
      type: 'blob',
      sha: blob.sha
    };
  }));

  const { data: tree } = await api.git.createTree({
    owner,
    repo,
    base_tree: parentCommit.tree.sha,
    tree: blobs
  });

  const { data: commit } = await api.git.createCommit({
    owner,
    repo,
    message,
    tree: tree.sha,
    parents: [parentSha]
  });

  await api.git.updateRef({ owner, repo, ref: `heads/${branch}`, sha: commit.sha });

  return commit;
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
 * Create a file commit object for the commit process
 * @param {string} filePath - Path of file in repository
 * @param {string|Buffer} content - File content
 * @param {string} encoding - Content encoding ('text' or 'base64')
 * @returns {Object} Commit file object
 */
function createCommitFile(filePath, content, encoding = 'text') {
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
async function handleBrewery(brewery, isDev, projectRoot, api, owner, repo, repoBranch) {
  const filePath = `app/content/brewery/${brewery.slug}.md`;

  const exists = await fileExists(filePath, isDev, projectRoot, api, owner, repo, repoBranch);
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
async function handleShop(purchased, isDev, projectRoot, api, owner, repo, repoBranch) {
  const filePath = `app/content/shop/${purchased.slug}.md`;

  const exists = await fileExists(filePath, isDev, projectRoot, api, owner, repo, repoBranch);
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
async function handleStyle(style, isDev, projectRoot, api, owner, repo, repoBranch) {
  const filePath = `app/content/style/${style.slug}.md`;

  const exists = await fileExists(filePath, isDev, projectRoot, api, owner, repo, repoBranch);
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
  createGithubCommit,
  handleBrewery,
  handleShop,
  handleStyle
};
