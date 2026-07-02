// netlify/functions/untappd-proxy.js
//
// Proxies a raw HTML page from Untappd, since Untappd blocks requests
// originating from Cloudflare's IP ranges (error 1106) but not from
// Netlify's (AWS Lambda).
//
// Usage:
//   /.netlify/functions/untappd-proxy?url=/user/mikestreety/checkin/1579908958
//   /.netlify/functions/untappd-proxy?url=https://untappd.com/b/some-beer/12345
//
// Accepts either a path or a full untappd.com URL in `url` — only the
// pathname is used, so it always fetches from untappd.com itself.
// Returns the raw HTML body with the original status code, so the
// calling Worker can pass the Response straight into HTMLRewriter.

const UNTAPPD_BASE = 'https://untappd.com';

export async function handler(event) {
  const rawUrl = event.queryStringParameters && event.queryStringParameters.url;

  if (!rawUrl) {
    return {
      statusCode: 400,
      headers: { 'content-type': 'application/json;charset=UTF-8' },
      body: JSON.stringify({ error: 'Missing required "url" query parameter' }),
    };
  }

  // Accept either a bare path or a full URL — always resolve to a
  // path on untappd.com, so this function can't be used as an open proxy.
  let path;
  try {
    path = rawUrl.startsWith('http')
      ? new URL(rawUrl).pathname
      : rawUrl.startsWith('/')
      ? rawUrl
      : `/${rawUrl}`;
  } catch (err) {
    return {
      statusCode: 400,
      headers: { 'content-type': 'application/json;charset=UTF-8' },
      body: JSON.stringify({ error: 'Invalid url parameter' }),
    };
  }

  const targetUrl = UNTAPPD_BASE + path;

  try {
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept':
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9',
      },
    });

    const bodyText = await res.text();

    return {
      statusCode: res.status,
      headers: {
        'content-type': 'text/html; charset=UTF-8',
        // Let the Worker/browser cache this a little to reduce
        // how often we hit Untappd for the same page.
        'cache-control': 'public, max-age=300',
      },
      body: bodyText,
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { 'content-type': 'application/json;charset=UTF-8' },
      body: JSON.stringify({ error: err.message }),
    };
  }
}