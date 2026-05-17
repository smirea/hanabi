import { env } from 'node:process';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const clientPort = Number(env.CLIENT_PORT ?? 3000);
if (Number.isNaN(clientPort)) throw new Error('CLIENT_PORT must be a valid number');

const apiUrl = env.VITE_API_URL ?? 'http://localhost:3001';
const allowedHosts = env.CLIENT_HOST ? [env.CLIENT_HOST] : [];

export default defineConfig({
	server: {
		port: clientPort,
		strictPort: true,
		allowedHosts,
		proxy: {
			'/api': {
				target: apiUrl,
				changeOrigin: true,
				secure: false,
				rewrite: path => path.replace(/^\/api/, ''),
			},
		},
	},
	plugins: [react()],
});
