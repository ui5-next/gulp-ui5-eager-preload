var rollup = require("rollup");
var rollupNodeResolve = require("rollup-plugin-node-resolve");
var rollupCjs = require("rollup-plugin-commonjs");
var { uglify } = require("rollup-plugin-uglify");
var log = require('fancy-log');
var colors = require('ansi-colors');

var rollupReplace = require("rollup-plugin-replace");

var libInMemoryCache = {};

var formatUI5Module = (umdCode, mName) => `sap.ui.define(function(){
  ${umdCode}
  return window["${mName}"] || this["${mName}"]
})
`;

var rollupTmpConfig = (mAsbPath, mName) => ({
  input: mAsbPath,
  output: {
    file: `${mName}.js`,
    format: "umd",
    exports: 'named'
  },
  onwarn: function(message) {
    log.warn(`[bundle-thirdparty][${mName}]`, colors.yellow(message));
  },
  plugins: [
    rollupNodeResolve({ preferBuiltins: true }),
    rollupCjs(),
    uglify(),
    rollupReplace({
      'process.env.NODE_ENV': JSON.stringify("production")
    })
  ]
});

var resolve = mName => {
  return require.resolve(mName);
};

/**
 * bundle thirdparty library
 * @param {string} mName module name
 */
var bundleModule = async mName => {
  // if not found cache
  if (!libInMemoryCache[mName]) {
    const absPath = resolve(mName);
    const bundle = await rollup.rollup(rollupTmpConfig(absPath, mName));
    const generated = await bundle.generate({ format: "umd", name: mName });
    libInMemoryCache[mName] = formatUI5Module(generated.output[0].code, mName);
  }
  return libInMemoryCache[mName];
};

module.exports = { bundleModule };