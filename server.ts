import path from 'node:path';
import express from 'express';
import dotenv from 'dotenv';
import { createApp } from './server/app.js';
import { Store } from './server/store.js';
import { createPersistence } from './server/persistence.js';

dotenv.config();

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const isProduction = process.env.NODE_ENV === 'production';

async function main() {
  if (isProduction && process.env.OTP_DEV_ECHO === 'true') {
    console.warn('[CONFIG] OTP_DEV_ECHO is ignored in production.');
  }

  const store = new Store(createPersistence());
  // Demo accounts use the passcode "password", so they are off by default in production.
  const seedDemo = process.env.SEED_DEMO_DATA ? process.env.SEED_DEMO_DATA === 'true' : !isProduction;
  await store.load({ seedDemo });

  const app = createApp(store, {
    isProduction,
    devEchoOtp: process.env.OTP_DEV_ECHO === 'true',
    allowReset: !isProduction && process.env.ALLOW_DEMO_RESET !== 'false',
    seedDemo,
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, { index: false }));
    app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MedSafe running on http://localhost:${PORT} (${isProduction ? 'production' : 'development'})`);
  });
}

main().catch(err => {
  console.error('Failed to start MedSafe:', err);
  process.exit(1);
});
