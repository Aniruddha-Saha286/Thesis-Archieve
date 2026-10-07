const { parentPort, workerData } = require('worker_threads');

if (parentPort) {
  const { _internals } = require('./fullTextService');
  const bytes = workerData && workerData.bytes ? Buffer.from(workerData.bytes.buffer, workerData.bytes.byteOffset, workerData.bytes.byteLength) : Buffer.alloc(0);
  _internals
    .parsePdfBuffer(bytes, { maxPages: workerData && workerData.maxPages })
    .then(
      (result) => parentPort.postMessage(result),
      () => parentPort.postMessage({ ok: false, reason: 'unreadable' })
    );
}
