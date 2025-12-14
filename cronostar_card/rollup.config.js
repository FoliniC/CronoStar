import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
import alias from '@rollup/plugin-alias';
import path from 'path';
import { fileURLToPath } from 'url';

const production = !process.env.ROLLUP_WATCH;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  input: 'src/main.js',
  output: {
    file: '../custom_components/cronostar/www/cronostar_card/cronostar-card.js',
    format: 'es',
    sourcemap: false, // Disabled to prevent source map issues
    intro: '/* CronoStar Card - Bundled for Home Assistant */'
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
    commonjs(),
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
