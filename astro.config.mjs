import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  output: 'static',
  integrations: [tailwind()],
  // TODO: Set site and base to match your GitHub Pages URL
  // site: 'https://YOUR_USERNAME.github.io',
  // base: '/RunBase',
});
