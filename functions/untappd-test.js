// netlify/functions/untappd-test.js
//
// Minimal test function to check whether Untappd blocks requests
// originating from Netlify's network (AWS Lambda), the same way
// it blocks Cloudflare Workers' shared IPs.
//
// Deploy this as a Netlify Function, then hit:
//   https://<your-site>.netlify.app/.netlify/functions/untappd-test
//
// It will return the status code, headers, and body snippet from
// Untappd, so you can see immediately whether it's a clean 200
// or another block (e.g. the same "error code: 1106" text, or a
// different Cloudflare challenge/403).

export async function handler(event, context) {
    const targetUrl = 'https://untappd.com/user/mikestreety/checkin/1579908958';
  
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
        statusCode: 200,
        headers: { 'content-type': 'application/json;charset=UTF-8' },
        body: JSON.stringify(
          {
            targetStatus: res.status,
            targetStatusText: res.statusText,
            targetHeaders: Object.fromEntries(res.headers),
            // Only return the first ~1000 chars so we don't ship the
            // entire HTML page back — enough to see if it's a real
            // Untappd page or a block/challenge page.
            bodySnippet: bodyText.slice(0, 1000),
            bodyLength: bodyText.length,
          },
          null,
          2
        ),
      };
    } catch (err) {
      return {
        statusCode: 500,
        headers: { 'content-type': 'application/json;charset=UTF-8' },
        body: JSON.stringify({ error: err.message }, null, 2),
      };
    }
  }