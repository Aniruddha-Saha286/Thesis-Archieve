// Sends large JSON answers gzip-compressed, using only Node's built-in zlib.
//
// A page of search results is 50 to 150 KB of JSON; compressed it is about a fifth of that,
// which matters on mobile data. Small answers are left alone because compressing them costs
// more than it saves. Only res.json() is touched, so file downloads, Socket.IO and anything
// streamed are unaffected.
const zlib = require('zlib');

function acceptsGzip(req) {
  const header = String(req.headers['accept-encoding'] || '');
  // "gzip;q=0" means the client refuses gzip
  return /(^|,)\s*gzip\s*(;(?!\s*q=0(\.0+)?\s*(,|$))[^,]*)?(,|$)/i.test(header) || /(^|,)\s*\*\s*(,|$)/.test(header);
}

function jsonCompression({ threshold = 1024, level = 6 } = {}) {
  return function jsonCompressionMiddleware(req, res, next) {
    if (req.method === 'HEAD' || !acceptsGzip(req)) return next();

    const sendJson = res.json.bind(res);

    res.json = function compressedJson(payload) {
      let body;
      try {
        body = JSON.stringify(payload);
      } catch {
        return sendJson(payload);
      }
      // Nothing to send, already encoded by someone else, or too small to be worth it
      if (typeof body !== 'string' || res.getHeader('Content-Encoding') || Buffer.byteLength(body) < threshold) {
        return sendJson(payload);
      }

      zlib.gzip(body, { level }, (err, compressed) => {
        if (res.headersSent) return;
        if (err) {
          sendJson(payload);
          return;
        }
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Content-Length', compressed.length);
        res.vary('Accept-Encoding');
        res.end(compressed);
      });
      return res;
    };

    return next();
  };
}

module.exports = { jsonCompression, acceptsGzip };
