import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

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
	]
});
