import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
// HTTPS in dev so a Quest on the same Wi-Fi can open the dev server (WebXR needs a secure context).
export default defineConfig(({ command }) => ({
  base: './',
  plugins: command === 'serve' && process.env.HTTPS ? [basicSsl()] : [],
  build: { target: 'es2020' },
}));
