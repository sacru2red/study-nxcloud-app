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
    // Prisma 7.x generated client has package.json exports/imports that are incompatible
    // with webpack enhanced-resolve. Mark prisma/generated as external to skip bundling.
    // Node.js runtime will resolve it via require() at runtime.
    {
      apply(compiler) {
        const originalExternals = compiler.options.externals;
        compiler.options.externals = [
          ...(Array.isArray(originalExternals) ? originalExternals : originalExternals ? [originalExternals] : []),
          function({ request }, callback) {
            if (request && request.includes('prisma/generated')) {
              return callback(null, `commonjs ${request}`);
            }
            callback();
          },
        ];
      },
    },
  ],
}
