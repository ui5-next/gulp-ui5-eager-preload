var through2 = require("through2");
var GulpFile = require("vinyl");
var rollup = require("rollup");
var rollupNodeResolve = require("rollup-plugin-node-resolve");
var rollupCjs = require("rollup-plugin-commonjs");
var { uglify } = require("rollup-plugin-uglify");
var { readFileSync } = require("fs");
var { concat } = require("lodash");
var glob = require("glob");
var { generateIndexHtmlContent } = require("./html");
var {
  generatePreloadFile,
  isUI5StandardModule,
  findAllImportModules,
  findAllUi5StandardModules,
  findAllUi5ViewModules,
  fetchAllResource,
  resolveUI5Module,
  findAllLibraries
} = require("./ui5");

var formatUI5Module = (umdCode, mName) => `sap.ui.define(function(){
  ${umdCode}
  return this.${mName}
})
`;

var rollupTmpConfig = (mAsbPath, mName) => ({
  input: mAsbPath,
  output: {
    file: `${mName}.js`,
    format: "umd"
  },
  onwarn: function(message) {
    // do nothing
  },
  plugins: [rollupNodeResolve({ preferBuiltins: true }), rollupCjs(), uglify()]
});

var resolve = mName => {
  return require.resolve(mName);
};

var bundleModule = async mName => {
  const absPath = resolve(mName);
  const bundle = await rollup.rollup(rollupTmpConfig(absPath, mName));
  const generated = await bundle.generate({ format: "umd", name: mName });
  return formatUI5Module(generated.code, mName);
};

var defaultResourceRoot = "https://openui5.hana.ondemand.com/resources/";

module.exports = function({
  sourceDir,
  preload = false,
  outputFilePath,
  thirdpartyLibPath = ".",
  ui5ResourceRoot = defaultResourceRoot,
  projectNameSpace: projectNameSpace = "",
  additionalModules = [],
  additionalResources = [],
  theme,
  title,
  bootScript,
  bootScriptPath
}) {
  if (!ui5ResourceRoot.endsWith("/")) {
    ui5ResourceRoot = `${ui5ResourceRoot}/`;
  }
  var namepath = projectNameSpace.replace(/\./g, "/");
  var targetJSPath = thirdpartyLibPath;

  if (targetJSPath.endsWith("/") || targetJSPath.startsWith("/")) {
    throw new Error(
      `Not accept path :${thirdpartyLibPath}, please give thirdpartyLibPath like lib |_thirdparty | other/lib`
    );
  }

  return through2.obj(async function(file, encoding, cb) {
    var libs = [];

    if (preload) {
      var distinctDeps = new Set(additionalModules);

      // preload js module
      var preload_promise = new Promise((resolve, reject) => {
        glob(`${sourceDir}/**/*.js`, async(err, files) => {
          if (err) {
            reject(err);
            return;
          }
          var allDeps = files.map(f => {
            var mName = f.replace(sourceDir, namepath);
            var source = readFileSync(f, { encoding: "utf-8" });
            return concat(
              findAllImportModules(source, mName),
              findAllUi5StandardModules(source, mName)
            );
          });
          concat(...allDeps).forEach(d => {
            if (isUI5StandardModule(d)) {
              distinctDeps.add(d);
            }
          });

          resolve();
        });
      });

      // preload xml view
      var preload_project_promise = new Promise((resolve, reject) => {
        glob(`${sourceDir}/**/*.+(view|fragment).xml`, async(err, files) => {
          if (err) {
            reject(err);
          } else {
            var allDeps = await Promise.all(files.map(f => {
              var mName = f.replace(sourceDir, namepath);
              var source = readFileSync(f, { encoding: "utf-8" });
              return findAllUi5ViewModules(source, mName);
            }));
            concat(...allDeps).forEach(d => {
              if (isUI5StandardModule(d)) {
                distinctDeps.add(d);
              }
            });
            resolve();
          }
        });
      });

      // await
      await Promise.all([preload_promise, preload_project_promise]);

      // generate preload file
      var modulesPromise = resolveUI5Module(Array.from(distinctDeps), ui5ResourceRoot);

      var resourcesPromise = fetchAllResource(additionalResources, ui5ResourceRoot);

      var [modules, resources] = await Promise.all([modulesPromise, resourcesPromise]);

      libs = await findAllLibraries(Object.keys(modules));

      this.push(
        new GulpFile({
          path: "preload.js",
          contents: Buffer.from(
            generatePreloadFile(
              modules,
              resources
            )
          )
        })
      );

    }

    var packageJson = JSON.parse(file.contents.toString());
    var deps = packageJson.dependencies;
    var depsObject = {};
    if (deps) {
      try {
        await Promise.all(
          Object.keys(deps).map(async d => {
            depsObject[d] = `${thirdpartyLibPath}/${d}`;
            const code = await bundleModule(d);
            this.push(
              new GulpFile({
                path: `${targetJSPath}/${d}.js`,
                contents: Buffer.from(code)
              })
            );
          })
        );
      } catch (error) {
        cb(error);
      }
    }

    var indexHtml = generateIndexHtmlContent({
      resourceRoot: ui5ResourceRoot,
      projectNameSpace: projectNameSpace,
      theme: theme,
      title: title,
      bootScript,
      bootScriptPath,
      preload,
      inlineCssLink: libs
        .filter(lib=>lib != "sap/suite/ui")
        .map(l => `${ui5ResourceRoot}${l}/themes/${theme}/library.css`),
      resourceRoots: {
        [projectNameSpace]: ".",
        ...depsObject
      }
    });

    this.push(
      new GulpFile({
        path: outputFilePath || "index.html",
        contents: Buffer.from(indexHtml)
      })
    );

    cb();
  });
};
