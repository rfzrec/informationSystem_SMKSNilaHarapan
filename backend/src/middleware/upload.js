const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const multer = require('multer');
const { HttpError } = require('../utils/http');

const MAX_BYTES = 5 * 1024 * 1024;

const memoryUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1 } }).single('file');

const SIGNATURES = [
  { type: 'pdf', mime: 'application/pdf', test: (b) => b.slice(0, 5).toString('latin1') === '%PDF-' },
  { type: 'png', mime: 'image/png', test: (b) => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { type: 'jpg', mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'webp', mime: 'image/webp', test: (b) => b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP' },
];

// Tipe file ditentukan dari signature isi berkas, bukan dari nama/ekstensi kiriman browser.
function detectType(buffer) {
  return SIGNATURES.find((s) => buffer && buffer.length > 12 && s.test(buffer)) || null;
}

function checkFile(file, allowedTypes, maxKb) {
  if (!file) throw new HttpError(422, 'Berkas wajib dipilih.', 'FILE_REQUIRED');
  const detected = detectType(file.buffer);
  if (!detected || !allowedTypes.includes(detected.type)) {
    throw new HttpError(422, `Tipe berkas tidak diizinkan. Format yang diterima: ${allowedTypes.join(', ').toUpperCase()}.`, 'FILE_TYPE');
  }
  if (maxKb && file.size > maxKb * 1024) throw new HttpError(413, `Ukuran berkas melebihi ${maxKb} KB.`, 'FILE_TOO_LARGE');
  return detected;
}

async function saveFile(dir, buffer, ext) {
  await fs.mkdir(dir, { recursive: true });
  const name = `${crypto.randomUUID()}.${ext}`;
  await fs.writeFile(path.join(dir, name), buffer, { mode: 0o640 });
  return name;
}

const runUpload = (req, res) => new Promise((resolve, reject) => memoryUpload(req, res, (err) => (err ? reject(err) : resolve())));

module.exports = { runUpload, checkFile, saveFile, detectType };
