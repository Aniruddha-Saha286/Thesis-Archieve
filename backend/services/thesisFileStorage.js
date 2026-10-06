// Stores thesis PDFs that students upload with the deposit form.
//
// Uses the same Cloudinary account as the ID-card upload, in its own folder. The file is
// stored as a "raw" asset and delivered from Cloudinary's public address, because an approved
// thesis is meant to be read by everyone. (ID cards are different: they stay private.)
//
// Nothing here touches the database. The deposit route saves the returned address on the Thesis.
const crypto = require('crypto');
const cloudinary = require('cloudinary').v2;

const THESIS_FOLDER = 'thesis_vault/theses';

// Largest PDF a student may upload, in MB. 20 by default; THESIS_PDF_MAX_MB can set 1 to 50.
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

// A real PDF starts with "%PDF-". Browsers report the type from the file name, which anyone can change.
function looksLikePdf(buffer) {
  return Boolean(buffer && buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-');
}

// A storage reference we created ourselves:
//   thesis_vault/theses/u<the uploader's account id, 24 hex characters>-<32 random hex characters>.pdf
// The uploader's id is part of the name, so the deposit route can tell whose upload it is
// without keeping a separate list.
const OWN_REF_RE = /^thesis_vault\/theses\/u([a-f0-9]{24})-[a-f0-9]{32}\.pdf$/;

function isOwnStorageRef(ref) {
  return typeof ref === 'string' && OWN_REF_RE.test(ref);
}

// The account id of the member who uploaded the file, or null when the reference is not ours.
function storageRefOwner(ref) {
  const match = typeof ref === 'string' ? OWN_REF_RE.exec(ref) : null;
  return match ? match[1] : null;
}

function isUploadedBy(ref, userId) {
  const owner = storageRefOwner(ref);
  return Boolean(owner) && owner === String(userId || '').toLowerCase();
}

// True only when the address is this account's Cloudinary copy of that exact file.
// The deposit route uses it so a form cannot claim an upload it did not make.
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

// Uploads one PDF for the member `ownerId`. `uploader` can be replaced in tests.
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

  // The uploader's id, then a random part: the address cannot be guessed while the thesis is still waiting for review
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

// Removes an uploaded PDF. Never throws: a failed clean-up must not block deleting the record.
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

// Removes an uploaded PDF unless a thesis record still points at it. `ThesisModel` is the
// Mongoose model; it is handed in so that this file needs no database of its own.
// Call it AFTER the record that held the file has been deleted.
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
