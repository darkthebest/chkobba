import { babel } from '@rollup/plugin-babel';
import { nodeResolve } from '@rollup/plugin-node-resolve';

const extensions = ['.ts', '.js'];

/**
 * Nakama runs JavaScript modules in goja, which only supports ES5 syntax, so
 * everything (including the workspace's @chkobba/rules sources) is compiled by
 * Babel down to ES5 and bundled into one plain script with a global InitModule.
 */
export default {
  input: './src/main.ts',
  external: ['nakama-runtime'],
  plugins: [
    nodeResolve({ extensions }),
    babel({
      extensions,
      babelHelpers: 'bundled',
      babelrc: false,
      configFile: false,
      presets: [
        ['@babel/preset-env', { targets: { ie: '11' } }],
        '@babel/preset-typescript',
      ],
    }),
  ],
  output: {
    file: 'build/index.js',
    format: 'es',
  },
};
