import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
import alias from '@rollup/plugin-alias';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs'; // Import fs module

const production = !process.env.ROLLUP_WATCH;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read package.json to get the version
const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'));
const cardVersion = packageJson.version;

export default {
  input: 'src/main.js',
  output: {
    file: '../custom_components/cronostar/www/cronostar_card/cronostar-card.js',
    format: 'es',
    sourcemap: false, // Disabled to prevent source map issues
    intro: `/* CronoStar Card - Bundled for Home Assistant */\nwindow.CRONOSTAR_CARD_VERSION = '${cardVersion}';`
  },
  onwarn(warning, warn) {
    // Ignora warning sourcemap
    if (warning.code === 'SOURCEMAP_ERROR') return;
    if (warning.code === 'CIRCULAR_DEPENDENCY') return;
    warn(warning);
  },
  plugins: [
    alias({
      entries: [
        { find: '@editor', replacement: path.resolve(__dirname, 'src/editor') }
      ]
    }),
    resolve({
      extensions: ['.js', '.mjs'],
      browser: true
    }),
    commonjs({ include: 'node_modules/**' }),
    production && terser({
      format: {
        comments: false,
      },
      compress: {
        drop_console: false, // Keep console.log for debugging
        drop_debugger: true,
      },
      sourceMap: false
    }),
  ].filter(Boolean),
};
