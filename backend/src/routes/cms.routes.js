const express = require('express');
const { z } = require('zod');
const { query, one } = require('../config/db');
const { asyncHandler, HttpError, parsePaging, slugify } = require('../utils/http');
const { validate } = require('../middleware/validate');
const { requirePerm, requireAuth } = require('../middleware/auth');
const { runUpload, checkFile, saveFile } = require('../middleware/upload');
const { audit } = require('../utils/audit');
const env = require('../config/env');

const COLLECTIONS = {
  programs: { table: 'school_programs', perm: 'cms.manage', label: 'Program Keahlian' },
  facilities: { table: 'school_facilities', perm: 'cms.manage', label: 'Fasilitas' },
  gallery: { table: 'school_gallery', perm: 'cms.manage', label: 'Galeri' },
  achievements: { table: 'school_achievements', perm: 'cms.manage', label: 'Prestasi', extra: ['achievement_year', 'achievement_level'] },
  news: { table: 'news_articles', perm: 'cms.manage', label: 'Berita & Artikel', extra: ['article_type'] },
  announcements: { table: 'announcements', perm: 'announcements.manage', label: 'Pengumuman', extra: ['category', 'audience'] },
  extracurriculars: { table: 'school_extracurriculars', perm: 'cms.manage', label: 'Ekstrakurikuler' },
  events: { table: 'school_events', perm: 'cms.manage', label: 'Kegiatan Sekolah', extra: ['event_type', 'starts_at', 'ends_at', 'location'] },
  staff_profiles: { table: 'school_staff_profiles', perm: 'cms.manage', label: 'Kepala Sekolah, Guru & Staf', extra: ['staff_role', 'teacher_record_id', 'education', 'subjects', 'sort_order'] },
};
const SECTIONS = ['beranda', 'profil', 'sejarah', 'visi_misi', 'identitas', 'yayasan', 'kontak', 'lokasi', 'kontak_panitia'];

const imagePath = z.string().regex(/^\/uploads\/[a-f0-9-]+\.(png|jpg|webp)$/, 'Path gambar tidak valid').or(z.literal('')).optional().default('');
const contentSchema = z.object({
  title: z.string().trim().min(3, 'Judul minimal 3 karakter').max(200),
  slug: z.string().trim().max(200).optional().default(''),
  summary: z.string().trim().max(500).optional().default(''),
  body: z.string().max(50000).optional().default(''),
  image_path: imagePath,
  status: z.enum(['draft', 'published', 'archived']),
  published_at: z.string().regex(/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})?/).optional().or(z.literal('')).default(''),
  achievement_year: z.union([z.coerce.number().int().min(1990).max(2100), z.literal('')]).optional(),
  achievement_level: z.string().trim().max(80).optional(),
  article_type: z.enum(['news', 'article']).optional(),
  category: z.enum(['general', 'ppdb']).optional(),
  audience: z.enum(['public', 'authenticated']).optional(),
  event_type: z.enum(['activity', 'academic', 'ppdb', 'other']).optional().default('activity'),
  starts_at: z.string().regex(/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})?$/).optional().or(z.literal('')).default(''),
  ends_at: z.string().regex(/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})?$/).optional().or(z.literal('')).default(''),
  location: z.string().trim().max(200).optional().default(''),
  staff_role: z.enum(['principal', 'teacher', 'staff', 'organization']).optional().default('teacher'),
  teacher_record_id: z.union([z.coerce.number().int().positive(), z.null(), z.literal('')]).optional().default(null),
  education: z.string().trim().max(300).optional().default(''),
  subjects: z.string().trim().max(500).optional().default(''),
  sort_order: z.coerce.number().int().min(0).max(9999).optional().default(0),
});

const collection = (name) => {
  const c = COLLECTIONS[name];
  if (!c) throw new HttpError(404, 'Koleksi konten tidak dikenal.', 'NOT_FOUND');
  return c;
};
const toDt = (v) => (v ? `${v.replace('T', ' ').slice(0, 16)}${v.length > 10 ? ':00' : ' 00:00:00'}` : null);

// ===== Publik: hanya konten published dengan waktu publikasi yang sudah lewat =====
const publicRouter = express.Router();

// Branding dipusatkan pada satu record agar header, footer, favicon, dan homepage tidak berbeda sumber.
publicRouter.get('/branding', asyncHandler(async (req, res) => {
  const row = await one('SELECT school_name, short_name, tagline, established_on, logo_path, favicon_path, primary_color, secondary_color, address, phone, email, map_url, social_json, footer_text, updated_at FROM school_branding WHERE id = 1');
  if (!row) return res.json({ data: { school_name: 'SMKS Nila Harapan TIK Sunggal', short_name: 'SMK Nila Harapan', primary_color: '#0f766e', secondary_color: '#123047' } });
  let social = {};
  try { social = row.social_json ? (typeof row.social_json === 'string' ? JSON.parse(row.social_json) : row.social_json) : {}; } catch { social = {}; }
  res.json({ data: { ...row, social } });
}));

publicRouter.get('/profile', asyncHandler(async (req, res) => {
  const rows = await query(`SELECT section_key, title, content, image_path, updated_at FROM school_profiles WHERE status = 'published'`);
  const safeRows = rows.map((r) => {
    if (r.section_key !== 'identitas' || !r.content) return r;
    // Enforce the school's publication boundary even on databases seeded by an older version.
    const content = String(r.content).split(/\r?\n/).filter((line) => !/^\s*(NPSN|Nomor Pokok Sekolah Nasional|SK Pendirian|SK Operasional|Nomor SK|Nomor Akreditasi)\s*[:：]/i.test(line)).join('\n').trim();
    return { ...r, content };
  });
  res.json({ data: Object.fromEntries(safeRows.map((r) => [r.section_key, r])) });
}));

publicRouter.get('/content/:collection', asyncHandler(async (req, res) => {
  const c = collection(req.params.collection);
  const { page, pageSize, offset } = parsePaging(req.query);
  const extra = req.params.collection === 'announcements' ? ` AND audience = 'public'${req.query.category ? ' AND category = ?' : ''}` : '';
  const params = req.params.collection === 'announcements' && req.query.category ? [req.query.category] : [];
  const activeProgramFilter = req.params.collection === 'programs' ? ' AND is_active = 1' : '';
  const where = `status = 'published' AND (published_at IS NULL OR published_at <= NOW())${extra}${activeProgramFilter}`;
  const total = await one(`SELECT COUNT(*) AS n FROM ${c.table} WHERE ${where}`, params);
  const orderBy = req.params.collection === 'staff_profiles' ? 'sort_order ASC, title ASC' : req.params.collection === 'events' ? 'starts_at IS NULL, starts_at ASC, published_at DESC' : 'COALESCE(published_at, created_at) DESC';
  const rows = await query(`SELECT * FROM ${c.table} WHERE ${where} ORDER BY ${orderBy} LIMIT ${pageSize} OFFSET ${offset}`, params);
  res.json({ data: rows.map(({ author_id, editor_id, teacher_record_id, updated_by, ...r }) => r), meta: { page, page_size: pageSize, total: Number(total.n) } });
}));

publicRouter.get('/content/:collection/:slug', asyncHandler(async (req, res) => {
  const c = collection(req.params.collection);
  const row = await one(`SELECT t.*, u.full_name AS author_name FROM ${c.table} t LEFT JOIN users u ON u.id = t.author_id
    WHERE t.slug = ? AND t.status = 'published' AND (t.published_at IS NULL OR t.published_at <= NOW())${req.params.collection === 'programs' ? ' AND t.is_active = 1' : ''}`, [req.params.slug]);
  if (!row || (row.audience && row.audience !== 'public')) throw new HttpError(404, 'Konten tidak ditemukan.', 'NOT_FOUND');
  delete row.author_id; delete row.editor_id; delete row.teacher_record_id; delete row.updated_by;
  res.json({ data: row });
}));

publicRouter.get('/internal-announcements', requireAuth, asyncHandler(async (req, res) => {
  res.json({ data: await query(`SELECT title, slug, summary, body, category, published_at FROM announcements WHERE status = 'published'
    AND (published_at IS NULL OR published_at <= NOW()) ORDER BY published_at DESC LIMIT 20`) });
}));

// ===== CMS (pengguna berwenang) =====
const cms = express.Router();

const brandingSchema = z.object({
  school_name: z.string().trim().min(3).max(180),
  short_name: z.string().trim().min(2).max(100),
  tagline: z.string().trim().max(250).optional().default(''),
  established_on: z.string().date().nullable().optional().or(z.literal('')).default(''),
  logo_path: imagePath,
  favicon_path: imagePath,
  primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  secondary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  address: z.string().trim().max(500).optional().default(''),
  phone: z.string().trim().max(40).optional().default(''),
  email: z.string().trim().max(180).refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Format email tidak valid').optional().default(''),
  map_url: z.string().trim().max(500).optional().default('').refine((v) => !v || /^https:\/\/(maps\.app\.goo\.gl|maps\.google\.com|www\.google\.com\/maps)(?:[/?#]|$)/i.test(v), 'Tautan lokasi wajib menggunakan Google Maps HTTPS.'),
  social: z.record(z.string(), z.string().trim().max(500)).optional().default({}),
  footer_text: z.string().trim().max(500).optional().default(''),
});

cms.get('/branding', requirePerm('cms.manage'), asyncHandler(async (req, res) => {
  const row = await one('SELECT school_name, short_name, tagline, established_on, logo_path, favicon_path, primary_color, secondary_color, address, phone, email, map_url, social_json, footer_text, updated_at FROM school_branding WHERE id = 1');
  let social = {};
  try { social = row && row.social_json ? (typeof row.social_json === 'string' ? JSON.parse(row.social_json) : row.social_json) : {}; } catch { social = {}; }
  res.json({ data: row ? { ...row, social } : null });
}));

cms.put('/branding', requirePerm('cms.manage'), validate(brandingSchema), asyncHandler(async (req, res) => {
  const v = req.valid;
  const links = {};
  for (const [key, value] of Object.entries(v.social || {})) {
    if (!/^[a-z][a-z0-9_-]{1,30}$/i.test(key)) throw new HttpError(422, 'Kunci sosial media tidak valid.', 'INVALID_SOCIAL_KEY');
    if (value && !/^https:\/\//i.test(value)) throw new HttpError(422, 'Tautan media sosial wajib menggunakan HTTPS.', 'INVALID_SOCIAL_URL');
    links[key] = value;
  }
  await query(`INSERT INTO school_branding (id, school_name, short_name, tagline, established_on, logo_path, favicon_path, primary_color, secondary_color, address, phone, email, map_url, social_json, footer_text, updated_by)
    VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE school_name=VALUES(school_name), short_name=VALUES(short_name), tagline=VALUES(tagline), established_on=VALUES(established_on),
    logo_path=VALUES(logo_path), favicon_path=VALUES(favicon_path), primary_color=VALUES(primary_color), secondary_color=VALUES(secondary_color),
    address=VALUES(address), phone=VALUES(phone), email=VALUES(email), map_url=VALUES(map_url), social_json=VALUES(social_json), footer_text=VALUES(footer_text), updated_by=VALUES(updated_by)`,
  [v.school_name, v.short_name, v.tagline || null, v.established_on || null, v.logo_path || null, v.favicon_path || null, v.primary_color, v.secondary_color,
    v.address || null, v.phone || null, v.email || null, v.map_url || null, JSON.stringify(links), v.footer_text || null, req.user.id]);
  await audit(req, 'cms.branding.update', 'school_branding', 1, { school_name: v.school_name, logo_changed: !!v.logo_path });
  res.json({ message: 'Branding website diperbarui.', data: { ...v, social: links } });
}));

cms.get('/sections', requirePerm('cms.manage'), asyncHandler(async (req, res) => {
  res.json({ data: await query(`SELECT s.*, u.full_name AS editor_name FROM school_profiles s LEFT JOIN users u ON u.id = s.updated_by ORDER BY FIELD(section_key, ${SECTIONS.map(() => '?').join(',')})`, SECTIONS) });
}));

cms.put('/sections/:key', requirePerm('cms.manage'), validate(z.object({
  title: z.string().trim().min(2).max(200), content: z.string().max(50000).optional().default(''),
  image_path: imagePath, status: z.enum(['draft', 'published', 'archived']),
})), asyncHandler(async (req, res) => {
  if (!SECTIONS.includes(req.params.key)) throw new HttpError(404, 'Bagian profil tidak dikenal.', 'NOT_FOUND');
  const v = req.valid;
  await query(`INSERT INTO school_profiles (section_key, title, content, image_path, status, updated_by) VALUES (?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE title=VALUES(title), content=VALUES(content), image_path=VALUES(image_path), status=VALUES(status), updated_by=VALUES(updated_by)`,
  [req.params.key, v.title, v.content, v.image_path || null, v.status, req.user.id]);
  await audit(req, 'cms.section_update', 'school_profile', req.params.key, { status: v.status });
  res.json({ message: 'Bagian profil sekolah tersimpan.' });
}));

cms.post('/uploads', requirePerm('cms.manage', 'announcements.manage'), asyncHandler(async (req, res) => {
  await runUpload(req, res);
  const t = checkFile(req.file, ['png', 'jpg', 'webp'], 2048);
  const name = await saveFile(env.publicUploadDir, req.file.buffer, t.type);
  await audit(req, 'cms.image_upload', 'upload', name);
  res.status(201).json({ data: { path: `/uploads/${name}` } });
}));

const permFor = (req, res, next) => {
  try { requirePerm(collection(req.params.collection).perm)(req, res, next); } catch (e) { next(e); }
};

cms.get('/:collection', permFor, asyncHandler(async (req, res) => {
  const c = collection(req.params.collection);
  const { page, pageSize, offset } = parsePaging(req.query);
  const where = '(? = \'\' OR t.status = ?) AND (? = \'\' OR t.title LIKE ?)';
  const s = req.query.status || ''; const q = req.query.q || '';
  const params = [s, s, q, `%${q}%`];
  const total = await one(`SELECT COUNT(*) AS n FROM ${c.table} t WHERE ${where}`, params);
  const rows = await query(`SELECT t.*, a.full_name AS author_name, e.full_name AS editor_name FROM ${c.table} t LEFT JOIN users a ON a.id = t.author_id
    LEFT JOIN users e ON e.id = t.editor_id WHERE ${where} ORDER BY t.updated_at DESC LIMIT ${pageSize} OFFSET ${offset}`, params);
  res.json({ data: rows, meta: { page, page_size: pageSize, total: Number(total.n), label: c.label } });
}));

cms.get('/:collection/:id(\\d+)', permFor, asyncHandler(async (req, res) => {
  const row = await one(`SELECT * FROM ${collection(req.params.collection).table} WHERE id = ?`, [req.params.id]);
  if (!row) throw new HttpError(404, 'Konten tidak ditemukan.', 'NOT_FOUND');
  res.json({ data: row });
}));

async function uniqueSlug(table, base, id) {
  let slug = slugify(base); let i = 1;
  while (await one(`SELECT id FROM ${table} WHERE slug = ? AND id <> ?`, [slug, id || 0])) slug = `${slugify(base)}-${++i}`;
  return slug;
}

async function saveContent(req, id) {
  const name = req.params.collection;
  const c = collection(name);
  const v = req.valid;
  const slug = await uniqueSlug(c.table, v.slug || v.title, id);
  const publishedAt = v.status === 'published' ? (toDt(v.published_at) || new Date().toISOString().slice(0, 19).replace('T', ' ')) : toDt(v.published_at);
  const cols = { title: v.title, slug, summary: v.summary, body: v.body, image_path: v.image_path || null, status: v.status, published_at: publishedAt, editor_id: req.user.id };
  (c.extra || []).forEach((k) => {
    if (k === 'starts_at' || k === 'ends_at') cols[k] = toDt(v[k]) || null;
    else if (k === 'teacher_record_id') cols[k] = v[k] === '' || v[k] === undefined || v[k] === null ? null : Number(v[k]);
    else cols[k] = v[k] === '' || v[k] === undefined ? null : v[k];
  });
  if (name === 'events' && cols.starts_at && cols.ends_at && cols.ends_at < cols.starts_at) throw new HttpError(422, 'Waktu selesai kegiatan harus sama dengan atau setelah waktu mulai.', 'INVALID_EVENT_DATES');
  if (name === 'news') cols.article_type = cols.article_type || 'news';
  if (name === 'announcements') { cols.category = cols.category || 'general'; cols.audience = cols.audience || 'public'; }
  if (id) {
    const r = await query(`UPDATE ${c.table} SET ${Object.keys(cols).map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...Object.values(cols), id]);
    if (!r.affectedRows) throw new HttpError(404, 'Konten tidak ditemukan.', 'NOT_FOUND');
  } else {
    cols.author_id = req.user.id;
    id = (await query(`INSERT INTO ${c.table} (${Object.keys(cols).join(',')}) VALUES (${Object.keys(cols).map(() => '?').join(',')})`, Object.values(cols))).insertId;
  }
  await audit(req, `cms.${name}_save`, c.table, id, { status: v.status, slug });
  return { id, slug };
}

cms.post('/:collection', permFor, validate(contentSchema), asyncHandler(async (req, res) => {
  res.status(201).json({ message: 'Konten dibuat.', data: await saveContent(req, null) });
}));
cms.put('/:collection/:id(\\d+)', permFor, validate(contentSchema), asyncHandler(async (req, res) => {
  res.json({ message: 'Konten diperbarui.', data: await saveContent(req, Number(req.params.id)) });
}));
cms.delete('/:collection/:id(\\d+)', permFor, asyncHandler(async (req, res) => {
  const c = collection(req.params.collection);
  const row = await one(`SELECT id, status FROM ${c.table} WHERE id = ?`, [req.params.id]);
  if (!row) throw new HttpError(404, 'Konten tidak ditemukan.', 'NOT_FOUND');
  // Arsip adalah soft-delete: tautan histori dan audit tetap terjaga serta konten hilang dari website publik.
  await query(`UPDATE ${c.table} SET status = 'archived', editor_id = ? WHERE id = ?`, [req.user.id, req.params.id]);
  await audit(req, `cms.${req.params.collection}_archived`, c.table, req.params.id, { previous_status: row.status, status: 'archived' });
  res.json({ message: 'Konten dipindahkan ke arsip. Riwayat konten tetap tersimpan.' });
}));

module.exports = { publicRouter, cms, SECTIONS };
