import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import pkg from './package.json'

export default defineConfig({
	plugins: [
		sveltekit(),
		{
			name: 'override-sveltekit-output',
			enforce: 'post',
			configResolved(config) {
				if (!config.build.ssr && config.build.rollupOptions.output && !Array.isArray(config.build.rollupOptions.output)) {
					config.build.rollupOptions.output.entryFileNames = '_app/immutable/[name].js';
					config.build.rollupOptions.output.chunkFileNames = '_app/immutable/[name].js';
					config.build.rollupOptions.output.assetFileNames = '_app/immutable/[name].[ext]';
				}
			}
		}
	],
	define: {
		__APP_VERSION__: JSON.stringify(pkg.version),
	},
	build: {
		// Piano soundfont is ~1.2MB, this is expected
		chunkSizeWarningLimit: 1500
	},
	server: {
		allowedHosts: [
			'eddie-greetingless-unrepulsively.ngrok-free.dev'
		]
	}
});
