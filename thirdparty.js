var rollup = require("rollup");
var rollupNodeResolve = require("@rollup/plugin-node-resolve");
var rollupCjs = require("@rollup/plugin-commonjs");
var rollupJson = require("@rollup/plugin-json");
var rollupReplace = require("@rollup/plugin-replace");
var { uglify } = require("rollup-plugin-uglify");
var log = require('fancy-log');
var colors = require('ansi-colors');


var libInMemoryCache = {};

var formatUI5Module = (umdCode, mName) => `sap.ui.define("${mName}", function(){
  ${umdCode}
  return window["${mName}"] || this["${mName}"]
})
`;

var rollupTmpConfig = (mAsbPath, mName, minify = false) => {
  const plugins = [
    rollupNodeResolve({ preferBuiltins: true }),
    rollupCjs(),
    rollupJson(),
    rollupReplace({
      'process.env.NODE_ENV': JSON.stringify("production")
    })
  ];

  if (minify) {
    plugins.push(uglify());
  }

  return {
    input: mAsbPath,
    output: {
      file: `${mName}.js`,
      format: "umd",
      exports: 'named'
    },
    onwarn: function(message) {
      log.warn(`[bundle][${mName}]`, colors.yellow(message));
    },
    plugins
  };
};

var resolve = mName => {
  return require.resolve(mName);
};

/**
 * bundle thirdparty library
 * @param {string} mName module name
 */
var bundleModule = async(mName, minify = false) => {
  const mCacheName = `${mName}${minify ? "minify" : ""}`;
  // if not found cache
  if (!libInMemoryCache[mCacheName]) {
    const absPath = resolve(mName);
    const bundle = await rollup.rollup(rollupTmpConfig(absPath, mName, minify));
    const generated = await bundle.generate({ format: "umd", name: mName });
    libInMemoryCache[mCacheName] = formatUI5Module(generated.output[0].code, mName);
  }
  return libInMemoryCache[mCacheName];
};

module.exports = { bundleModule };