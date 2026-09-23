import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';
import { g92Pwa } from './src/kit/pwa.ts';

export default defineConfig({
  base: '/tanky/',
  server: { port: 5174, strictPort: true },
  preview: { port: 5174, strictPort: true },
  build: { target: 'es2022', sourcemap: false },
  plugins: [
    VitePWA(
      g92Pwa('tanky', {
        name: 'Tanky – tanková bitva',
        description: 'Zamiř, vystřel a přechytrač soupeře! Tažení, souboj až pro 4 hráče, přežití a střelnice.',
      }),
    ),
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // bot balance statistics – run with `SLOW=1 npx vitest run tests/balance.slow.test.ts`
    exclude: process.env.SLOW ? [] : ['tests/**/*.slow.test.ts'],
  },
});
