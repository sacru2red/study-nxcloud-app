// @ts-check
const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin')
const { join, relative, resolve } = require('path')

const outputDir = join(__dirname, '../../dist/apps/backend')
/** dist/main.js 기준 상대 경로 — node_modules 링크 없이 generated 클라이언트 로드 */
const prismaClientExternal = relative(
  outputDir,
  resolve(__dirname, '../../prisma/generated/index.js'),
).replace(/\\/g, '/')

/**
 * @type {import('webpack').Configuration}
 */
const config = {
  output: {
    path: outputDir,
    clean: true,
    ...(process.env.NODE_ENV !== 'production' && {
      devtoolModuleFilenameTemplate: '[absolute-resource-path]',
    }),
  },
  resolve: {
    alias: {
      'prisma-client': resolve(__dirname, '../../prisma/generated/index.js'),
    },
  },
  externals: [
    ({ request }, callback) => {
      if (request === 'prisma-client') {
        callback(null, `commonjs ${prismaClientExternal}`)
        return
      }
      callback()
    },
  ],
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
      mergeExternals: true,
      // noop-transformer is required to force `transpileOnly: false` in Nx's compiler-loaders.js.
      // Without this, Nx sets transpileOnly=true which bypasses ts-patch, and nestia/typia
      // transformers configured in tsconfig.app.json plugins won't run.
      // See: @nx/webpack/src/plugins/nx-webpack-plugin/lib/compiler-loaders.js line 41
      //   `transpileOnly: !hasPlugin`
      // nestia does NOT work via Nx's transformers option (per nestia docs), only via ts-patch.
      transformers: [{ name: resolve(__dirname, '../../tools/noop-transformer') }],
    }),
  ],
}

module.exports = config
