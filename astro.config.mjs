import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import markdoc from '@astrojs/markdoc';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import { mkdirSync, writeFileSync } from 'node:fs';

// Custom keystatic integration for Cloud mode with static output
const keystatic = () => {
  return {
    name: 'keystatic',
    hooks: {
      'astro:config:setup': ({ injectRoute, updateConfig, config }) => {
        // Server config for keystatic dev mode
        updateConfig({
          server: config.server.host ? {} : {
            host: '127.0.0.1'
          },
          vite: {
            plugins: [{
              name: 'keystatic',
              resolveId(id) {
                if (id === 'virtual:keystatic-config') {
                  return this.resolve('./keystatic.config', './a');
                }
                return null;
              }
            }],
            optimizeDeps: {
              entries: ['keystatic.config.*', '.astro/keystatic-imports.js']
            }
          }
        });

        // Create keystatic-imports file
        const dotAstroDir = new URL('./.astro/', config.root);
        mkdirSync(dotAstroDir, { recursive: true });
        writeFileSync(
          new URL('keystatic-imports.js', dotAstroDir),
          `import "@keystatic/astro/ui";\nimport "@keystatic/core/ui";\n`
        );
      }
    }
  };
};

// https://astro.build/config
export default defineConfig({
  site: process.env.SITE_URL ?? 'http://localhost:4321',
  output: 'static',
  integrations: [react(), markdoc(), keystatic(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
