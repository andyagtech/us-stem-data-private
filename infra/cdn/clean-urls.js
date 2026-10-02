// Serve /industries/mining for /industries/mining.html, at the edge.
//
// The site is static files in S3, so a page is an object called mining.html
// and the only way to drop the extension from the URL is to put it back on
// before the request reaches the bucket. This runs on viewer-request, which
// costs a fraction of a millisecond and nothing per GB.
//
// WHAT IT DELIBERATELY DOES NOT DO: it does not redirect. Every .html URL
// that has ever been shared keeps working and keeps serving, because links
// sent to other people are not ours to break. The extensionless form is the
// one to hand out from now on; both resolve to the same object.
//
// The test for "is this a page" is whether the last segment has a dot in it.
// That leaves /data/foo.json, /catalog.json, /llms.txt, /og/x.png and the
// Parquet exports untouched, and it is why the check is on the last segment
// rather than the whole path -- /industries/mining has a dot in neither.
function handler(event) {
    var request = event.request;
    var uri = request.uri;

    // "/" is handled by the distribution's default root object.
    if (uri === '/') {
        return request;
    }

    // A trailing slash means the page of that name, not a directory index:
    // /industries/ is the hub page, and there is no /industries/index.html.
    if (uri.endsWith('/')) {
        uri = uri.slice(0, -1);
        if (uri === '') {
            return request;
        }
    }

    var last = uri.slice(uri.lastIndexOf('/') + 1);
    if (last.indexOf('.') === -1) {
        request.uri = uri + '.html';
    }
    return request;
}
