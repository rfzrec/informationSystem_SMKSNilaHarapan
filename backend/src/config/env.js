const path = require('path');

function required(name) {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`Environment variable ${name} wajib diisi`);
  return value;
}

const rootDir = path.resolve(__dirname, '../../..');

const env = {
  rootDir,
  nodeEnv: process.env.NODE_ENV || 'development',
  serviceDomain: process.env.SERVICE_DOMAIN || 'all',
  enableScheduler: process.env.ENABLE_SCHEDULER === 'true',
  internalServiceToken: process.env.INTERNAL_SERVICE_TOKEN || '',
  qrServiceUrl: process.env.QR_SERVICE_URL || '',
  port: Number(required('APP_PORT')),
  db: {
    host: required('DB_HOST'),
    port: Number(required('DB_PORT')),
    user: required('DB_USER'),
    password: required('DB_PASSWORD'),
    database: required('DB_NAME'),
  },
  sessionSecret: required('SESSION_SECRET'),
  sessionMaxAgeMs: Number(process.env.SESSION_MAX_AGE_MS || 2 * 60 * 60 * 1000),
  cookieSecure: process.env.COOKIE_SECURE || 'auto',
  trustProxy: process.env.TRUST_PROXY || '1',
  privateStorageDir: path.resolve(rootDir, required('PRIVATE_STORAGE_DIR')),
  publicUploadDir: path.resolve(rootDir, required('PUBLIC_UPLOAD_DIR')),
  appBaseUrl: required('APP_BASE_URL'),
  emailProvider: process.env.RESEND_API_KEY ? 'resend' : '',
  email: {
    apiKey: process.env.RESEND_API_KEY || '',
    from: process.env.RESEND_FROM || 'SMKS Nila Harapan <onboarding@resend.dev>',
    redirectTo: process.env.EMAIL_REDIRECT_TO || '',
  },
  rateLimit: {
    login: Number(process.env.RATE_LIMIT_LOGIN || 20),
    register: Number(process.env.RATE_LIMIT_REGISTER || 10),
    forgot: Number(process.env.RATE_LIMIT_FORGOT || 5),
  },
};

env.isProduction = env.nodeEnv === 'production';
env.isTest = env.nodeEnv === 'test';

module.exports = env;
