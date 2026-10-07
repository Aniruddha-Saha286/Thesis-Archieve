const crypto = require('crypto');
const cloudinary = require('cloudinary').v2;

const THESIS_FOLDER = 'thesis_vault/theses';

function getMaxUploadMb(env = process.env) {
  const parsed = parseInt(env.THESIS_PDF_MAX_MB, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 20;
  return Math.min(parsed, 50);
}

function hasStorage(env = process.env) {
  return Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
}

function configure(env = process.env) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
  });
}

function looksLikePdf(buffer) {
  return Boolean(buffer && buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-');
}

const OWN_REF_RE = /^thesis_vault\/theses\/u([a-f0-9]{24})-[a-f0-9]{32}\.pdf$/;

function isOwnStorageRef(ref) {
  return typeof ref === 'string' && OWN_REF_RE.test(ref);
}

function storageRefOwner(ref) {
  const match = typeof ref === 'string' ? OWN_REF_RE.exec(ref) : null;
  return match ? match[1] : null;
}

function isUploadedBy(ref, userId) {
  const owner = storageRefOwner(ref);
  return Boolean(owner) && owner === String(userId || '').toLowerCase();
}

function isOwnStorageUrl(url, ref, env = process.env) {
  if (!isOwnStorageRef(ref) || typeof url !== 'string' || !env.CLOUDINARY_CLOUD_NAME) return false;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'res.cloudinary.com') return false;
    const path = decodeURIComponent(parsed.pathname);
    return path.startsWith(`/${env.CLOUDINARY_CLOUD_NAME}/raw/upload/`) && path.endsWith(`/${ref}`);
  } catch {
    return false;
  }
}

async function uploadThesisPdf(buffer, { ownerId, uploader = cloudinary.uploader, env = process.env } = {}) {
  if (!hasStorage(env)) {
    const err = new Error('File storage is not configured.');
    err.code = 'STORAGE_UNAVAILABLE';
    throw err;
  }
  if (!looksLikePdf(buffer)) {
    const err = new Error('The file is not a PDF.');
    err.code = 'NOT_PDF';
    throw err;
  }
  const owner = String(ownerId || '').toLowerCase();
  if (!/^[a-f0-9]{24}$/.test(owner)) {
    const err = new Error('The uploader is not known.');
    err.code = 'NO_OWNER';
    throw err;
  }
  configure(env);

  const name = `u${owner}-${crypto.randomBytes(16).toString('hex')}.pdf`;

  const result = await new Promise((resolve, reject) => {
    const stream = uploader.upload_stream(
      { folder: THESIS_FOLDER, public_id: name, resource_type: 'raw', overwrite: false },
      (error, uploaded) => (error ? reject(error) : resolve(uploaded))
    );
    stream.end(buffer);
  });

  return {
    pdfUrl: result.secure_url,
    storageRef: result.public_id,
    sizeBytes: typeof result.bytes === 'number' ? result.bytes : buffer.length,
  };
}

async function destroyThesisPdf(ref, { uploader = cloudinary.uploader, env = process.env } = {}) {
  if (!isOwnStorageRef(ref) || !hasStorage(env)) return { removed: false };
  try {
    configure(env);
    const result = await uploader.destroy(ref, { resource_type: 'raw' });
    return { removed: Boolean(result && result.result === 'ok') };
  } catch (err) {
    console.warn('[thesisFileStorage] Could not remove a stored thesis PDF:', err.message);
    return { removed: false };
  }
}

async function destroyThesisPdfIfUnused(ref, ThesisModel, options = {}) {
  if (!isOwnStorageRef(ref)) return { removed: false };
  try {
    const stillUsed = await ThesisModel.exists({ pdfStorageRef: ref });
    if (stillUsed) return { removed: false, stillUsed: true };
  } catch (err) {
    console.warn('[thesisFileStorage] Could not check whether a stored PDF is still used:', err.message);
    return { removed: false };
  }
  return module.exports.destroyThesisPdf(ref, options);
}

module.exports = {
  THESIS_FOLDER,
  getMaxUploadMb,
  hasStorage,
  looksLikePdf,
  isOwnStorageRef,
  storageRefOwner,
  isUploadedBy,
  isOwnStorageUrl,
  uploadThesisPdf,
  destroyThesisPdf,
  destroyThesisPdfIfUnused,
};
