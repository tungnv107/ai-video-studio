import path from 'node:path';
export const config = {
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  storageDriver: process.env.STORAGE_DRIVER || 'local',
  storageDir: path.resolve(process.env.STORAGE_LOCAL_DIR || './data/storage'),
  renderDir: path.resolve(process.env.RENDER_TMP_DIR || './data/render'),
  providerHosts: (process.env.PROVIDER_ALLOWED_HOSTS || 'api.openai.com,api.dev.runwayml.com,api.elevenlabs.io,api.search.brave.com').split(',').map(x=>x.trim()),
  cookieName: 'studio_session',
  sessionDays: 14,
};
