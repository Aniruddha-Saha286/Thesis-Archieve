const zlib = require('zlib');

function acceptsGzip(req) {
  const header = String(req.headers['accept-encoding'] || '');
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
