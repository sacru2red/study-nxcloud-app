// @ts-check
const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin')
const { join, resolve } = require('path')

module.exports = {
  output: {
    path: join(__dirname, '../../dist/apps/backend'),
    clean: true,
    ...(process.env.NODE_ENV !== 'production' && {
      devtoolModuleFilenameTemplate: '[absolute-resource-path]',
    }),
  },
  resolve: {
    // Prisma 7.x generated client의 package.json exports/imports 필드가
    // webpack enhanced-resolve와 호환되지 않아 "Can't resolve './module'" 에러 발생.
    // exportsFields/importsFields를 비워두어 webpack이 package.json exports 필드를
    // 무시하고 classic Node.js 모듈 해석을 사용하도록 강제한다.
    exportsFields: [],
    importsFields: [],
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
