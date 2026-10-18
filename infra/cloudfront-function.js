// CloudFront Functions v2 viewer-request: rewrites directory-format Astro routes to
// their index.html object so S3 can serve them. `/about` and `/about/` both become
// `/about/index.html`. Paths that already carry a file extension (`/rss.xml`,
// `/keystatic/_astro/foo.D8x9.js`, `/favicon.svg`, etc.) are left untouched — those
// are real objects, not directories.
//
// Triggered by aws_cloudfront_function.site_dir_rewrite in cloudfront.tf as a
// viewer-request function_association on the distribution's default cache behavior.
//
// CloudFront Functions v2 expects a top-level function called `handler`; the
// `module.exports` line below both documents that contract for biome and makes
// the function reachable from the static analysis that lints the file.
function handler(event) {
    var request = event.request;

    // Skip paths that already point at a file (anything with a `.` in the last segment,
    // e.g. `/rss.xml`, `/favicon.svg`, `/keystatic/_astro/foo.js`).
    var lastSlash = request.uri.lastIndexOf('/');
    var lastSegment = lastSlash === -1 ? request.uri : request.uri.substring(lastSlash + 1);
    if (lastSegment.indexOf('.') !== -1) {
        return request;
    }

    // Empty last segment means the URI ended in `/` — strip it, append /index.html.
    if (lastSegment === '') {
        request.uri = `${request.uri}index.html`;
        return request;
    }

    // Directory-format Astro route (`/about`): append `/index.html`.
    request.uri = `${request.uri}/index.html`;
    return request;
}

module.exports = { handler };
