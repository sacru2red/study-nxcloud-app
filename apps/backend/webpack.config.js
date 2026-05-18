// @ts-check
const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin')
const { join, resolve } = require('path')

/**
 * @type {import('webpack').Configuration}
 */
const prismaGenerated = resolve(__dirname, '../../prisma/generated')

const config = {
  output: {
    path: join(__dirname, '../../dist/apps/backend'),
    clean: true,
    ...(process.env.NODE_ENV !== 'production' && {
      devtoolModuleFilenameTemplate: '[absolute-resource-path]',
    }),
  },
  resolve: {
    // Node target: avoid package.json "browser" → default.js (uses #imports webpack can't resolve)
    mainFields: ['module', 'main'],
    conditionNames: ['node', 'require', 'import', 'default'],
    importsFields: ['imports'],
    alias: {
      'prisma-client': join(prismaGenerated, 'index.js'),
      '#main-entry-point': join(prismaGenerated, 'index.js'),
      '#wasm-compiler-loader': join(prismaGenerated, 'wasm-worker-loader.mjs'),
    },
  },
  module: {
    rules: [
      {
        test: /\.wasm$/,
        type: 'asset/resource',
      },
    ],
  },
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      assets: ['./src/assets'],
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: true,
      sourceMap: true,
      useTsconfigPaths: false,
      // noop-transformer is required to force `transpileOnly: false` in Nx's compiler-loaders.js.
      // Without this, Nx sets transpileOnly=true which bypasses ts-patch, and nestia/typia
      // transformers configured in tsconfig.app.json plugins won't run.
      // See: @nx/webpack/src/plugins/nx-webpack-plugin/lib/compiler-loaders.js line 41
      //   `transpileOnly: !hasPlugin`
      // nestia does NOT work via Nx's transformers option (per nestia docs), only via ts-patch.
      transformers: [{ name: resolve(__dirname, '../../tools/noop-transformer') }],
    }),
    // Nx source-map-loader breaks Prisma generated CJS (resolves phantom './module').
    {
      apply(compiler) {
        compiler.hooks.afterEnvironment.tap('PrismaBundleFix', () => {
          const rules = compiler.options.module.rules
          for (const rule of rules) {
            if (
              rule &&
              typeof rule === 'object' &&
              rule.loader &&
              String(rule.loader).includes('source-map-loader')
            ) {
              rule.exclude = [].concat(rule.exclude ?? [], prismaGenerated)
            }
          }
          compiler.options.module.rules.unshift({
            test: /\.js$/,
            include: prismaGenerated,
            type: 'javascript/auto',
            parser: { commonjs: true },
          })
        })
      },
    },
  ],
}

module.exports = config
