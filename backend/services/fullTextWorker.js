// Runs in its own thread, started by services/fullTextService.js for one PDF at a time.
// Reading a PDF is the only work on this site that a single file can make slow or heavy, so it
// is kept apart from the thread that answers requests. The starter stops this thread when it
// takes too long or uses too much memory.
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
