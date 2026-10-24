const path = require('path');
const express = require('express');
const session = require('express-session');
const MySQLStoreFactory = require('express-mysql-session');
const helmet = require('helmet');
const env = require('./config/env');
const { pool } = require('./config/db');
const { loadUser } = require('./middleware/auth');
const { csrfProtection } = require('./middleware/security');
const { notFoundApi, errorHandler } = require('./middleware/errorHandler');
const { asyncHandler, HttpError } = require('./utils/http');

const MySQLStore = MySQLStoreFactory(session);
const FRONTEND_DIR = path.join(env.rootDir, 'frontend', 'public');
const NODE_MODULES = path.join(env.rootDir, 'node_modules');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.trustProxy === 'true' ? true : Number(env.trustProxy) || env.trustProxy);

  app.use(helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", 'https://fonts.googleapis.com'],
        styleSrcAttr: ["'unsafe-inline'"],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        frameSrc: ['https://www.google.com', 'https://maps.google.com'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
        upgradeInsecureRequests: env.isProduction ? [] : null,
      },
    },
  }));

  app.use(express.json({ limit: '1mb' }));

  const store = new MySQLStore({ createDatabaseTable: false, clearExpired: !env.isTest && ['all', 'identity'].includes(env.serviceDomain), checkExpirationInterval: 15 * 60 * 1000, schema: { tableName: 'sessions' } }, pool);
  app.use(session({
    name: 'nh.sid',
    secret: env.sessionSecret,
    store,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.cookieSecure === 'auto' ? 'auto' : env.cookieSecure === 'true',
      maxAge: env.sessionMaxAgeMs,
    },
  }));

  app.get('/api/health', asyncHandler(async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', database: 'ok', time: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'error' });
    }
  }));

  app.use('/api', loadUser, csrfProtection, (req, _res, next) => {
    // Temporary credentials cannot call business APIs until the user changes the password.
    if (!req.user || !req.user.must_change_password) return next();
    const allowed = (req.method === 'GET' && ['/auth/me', '/auth/csrf'].includes(req.path))
      || (req.method === 'PUT' && req.path === '/auth/password')
      || (req.method === 'POST' && req.path === '/auth/logout');
    if (allowed) return next();
    return next(new HttpError(423, 'Akun menggunakan sandi sementara. Ganti kata sandi sebelum menggunakan fitur lain.', 'PASSWORD_CHANGE_REQUIRED'));
  });

  // Each deployable service exposes only the route groups it owns. SERVICE_DOMAIN=all
  // remains available for local compatibility and automated legacy tests.
  const domain = env.serviceDomain;
  const mountIdentity = () => {
    app.use('/api/auth', require('./routes/auth.routes').router);
    const admin = require('./routes/admin.routes');
    app.use('/api/users', admin.users);
    app.use('/api/system', admin.system);
    app.use('/api/audit-logs', admin.auditLogs);
    app.use('/api/notifications', admin.notifications);
  };
  const mountCms = () => {
    const cmsRoutes = require('./routes/cms.routes');
    app.use('/api/public', cmsRoutes.publicRouter);
    app.use('/api/cms', cmsRoutes.cms);
  };
  const mountAdmissions = () => {
    app.use('/api/admissions/me', require('./routes/applicant.routes'));
    app.use('/api/admissions/applications', require('./routes/applications.routes'));
    app.use('/api/admissions/selections', require('./routes/selections.routes'));
    const ops = require('./routes/operations.routes');
    app.use('/api/admissions/integrations', ops.integrations);
    app.use('/api/admissions/reports', ops.reports);
    app.use('/api/admissions', require('./routes/admissions.routes'));
  };
  const mountAcademic = () => {
    app.use('/api/dashboard', require('./routes/dashboard.routes'));
    app.use('/api/academics', require('./routes/academics.routes'));
    app.use('/api/masters', require('./routes/masters.routes'));
  };
  const mountPayroll = () => app.use('/api/payroll', require('./routes/payroll.routes'));
  const mountAdministration = () => app.use('/api/administration', require('./routes/administration.routes'));
  const mountAssessments = () => app.use('/api/assessments', require('./routes/assessments.routes'));

  if (domain === 'all') {
    mountIdentity(); mountCms(); mountAdmissions(); mountAcademic(); mountPayroll(); mountAdministration(); mountAssessments();
  } else {
    const mount = {
      identity: mountIdentity,
      cms: mountCms,
      admissions: mountAdmissions,
      academic: mountAcademic,
      payroll: mountPayroll,
      administration: mountAdministration,
      assessments: mountAssessments,
      // Worker is queue-only and intentionally exposes no business API.
      worker: () => {},
    }[domain];
    if (!mount) throw new Error(`SERVICE_DOMAIN tidak dikenal: ${domain}`);
    mount();
  }

  app.use('/api', notFoundApi);

  if (domain === 'all' || domain === 'identity') {
    app.use('/vendor/lucide.min.js', (req, res) => res.sendFile(path.join(NODE_MODULES, 'lucide/dist/umd/lucide.min.js')));
    app.use('/vendor/chart.umd.min.js', (req, res) => res.sendFile(path.join(NODE_MODULES, 'chart.js/dist/chart.umd.min.js')));
  }
  if (domain === 'all') {
    app.use('/uploads', express.static(env.publicUploadDir, { dotfiles: 'deny', index: false, maxAge: '7d' }));
    app.use(express.static(FRONTEND_DIR, { dotfiles: 'deny', index: false }));
    // Semua rute halaman dirender oleh router frontend; otorisasi data tetap di API.
    app.get('*', (req, res) => {
      if (path.extname(req.path)) return res.status(404).send('Not found');
      res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
