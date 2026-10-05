// Cloudflare Pages invokes this only for the site root.
// Return directly so retained static assets cannot serve the old homepage.
// GitHub Pages does not execute Pages Functions; its index.html is unchanged.
export function onRequest() {
  return new Response(null, {
    status: 404,
    headers: {
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex'
    }
  });
}
