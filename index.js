var through2 = require("through2");
var GulpFile = require('vinyl');
var rollup = require("rollup");
var rollupNodeResolve = require("rollup-plugin-node-resolve");
var rollupCjs = require("rollup-plugin-commonjs");
var { uglify } = require("rollup-plugin-uglify");
var { existsSync, readFileSync } = require("fs");
var { dirname, join: pathJoin } = require("path");
var { warn } = require("console");
var { concat, reduce, flatten } = require("lodash");
var glob = require("glob");
var fetch = require("node-fetch");

var replaceHtml = (content = "", packages = [], libraryRoot = ".") => {
  var r = /data-sap-ui-resourceroots='(.*?)'/g;
  var groups = r.exec(content);
  if (groups) {
    var original = JSON.parse(groups[1]);
    var packagesObject = packages.reduce(
      (p, c) => Object.assign(p, { [c]: `${libraryRoot}/${c}` }), {}
    );
    var resouceroots = Object.assign(original, packagesObject);
    var resoucerootsJson = JSON.stringify(resouceroots);
    return content.replace(r, `data-sap-ui-resourceroots='${resoucerootsJson}'`);
  } else {
    return content;
  }
};

var formatUI5Module = (umdCode, mName) => `sap.ui.define(function(){
  ${umdCode}
  return this.${mName}
})
`;

var rollupTmpConfig = (mAsbPath, mName) => ({
  input: mAsbPath,
  output: {
    file: `${mName}.js`,
    format: 'umd'
  },
  onwarn: function (message) {
    // do nothing
  },
  plugins: [rollupNodeResolve({ preferBuiltins: true }), rollupCjs(), uglify()]
});


var resolve = (mName) => {
  return require.resolve(mName);
};

var bundleModule = async (mName) => {
  const absPath = resolve(mName);
  const bundle = await rollup.rollup(rollupTmpConfig(absPath, mName));
  const generated = await bundle.generate({ format: "umd", name: mName });
  return formatUI5Module(generated.code, mName);
};

var fetchSource = async (mName, resourceRoot) => {
  try {
    var response = await fetch(`${resourceRoot}/${mName}.js`);
    return await response.text();
  } catch (error) {
    warn(`fetch ${mName} failed ${error}`);
    throw error;
  }
};

var findAllUi5StandardModules = (source, sourceName) => {
  var base = dirname(sourceName);
  var groups = /sap\.ui\.define\(.*?(\[.*?\])/g.exec(source);
  if (groups && groups.length > 0) {
    var sArray = groups[1].replace(/'/g, "\"");
    const dependencies = JSON.parse(sArray);

    return dependencies.map(d => {
      if (d.startsWith("./") || d.startsWith("../")) {
        d = pathJoin(base, d);
      }
      return d;
    });

  }
  return [];
};

var findAllImportModules = (source, sourceName = "") => {

  var base = dirname(sourceName);
  var rt = [];
  var matchedTexts = source.match(/import.*?["|'](.*?)["|']/g);
  if (matchedTexts) {
    rt = matchedTexts.map(t => {
      var importName = /import.*?["|'](.*?)["|']/g.exec(t)[1];
      if (importName.startsWith("./")) {
        importName = pathJoin(base, importName);
      }
      return importName;
    });
  }
  return rt;

};

var moduleCache = {

};

var moduleDeps = {

};

var resolveUI5Module = async (sModuleNames = [""], resouceRoot) => {
  var depsList = await Promise.all(
    sModuleNames.map(
      async mName => {
        if (!moduleDeps[mName]) {
          try {
            var source = await fetchSource(mName, resouceRoot);
            moduleCache[mName] = source;
            moduleDeps[mName] = await resolveUI5Module(
              flatten(findAllUi5StandardModules(source, mName)),
              resouceRoot
            );
          } catch (error) {
            moduleDeps[mName] = [];
          }
        }
        return moduleDeps[mName];
      }
    )
  );
  return depsList;
};

var generatePreloadFile = (cache = {}) => {
  var modules = reduce(cache, (pre, cur, value) => {
    pre[`${value}.js`] = cur;
    return pre;
  }, {});
  var preloadObject = {
    version: "2.0",
    modules
  };
  return `jQuery.sap.registerPreloadedModules(${JSON.stringify(preloadObject)})`;
};

var UI5Libraries = [
  "sap/ui/core",
  "sap/ui/layout",
  "sap/ui/unified",
  "sap/ui/table",
  "sap/ui/viz",
  "sap/ui/suite",
  "sap/ui/richtexteditor",
  "sap/ui/comp",
  "sap/m",
  "sap/f",
  "sap/suite/ui",
  "sap/gantt",
  "sap/ushell",
  "sap/tnt",
  "sap/uxap"
];

var isUI5StandardModule = (sModuleName) => {
  var rt = false;
  UI5Libraries.forEach(packageName => {
    if (sModuleName.startsWith(packageName)) {
      rt = true;
    }
  });
  return rt;
};

var preloadFileExt = ["js", "xml", "json", "properties"];

var defaultResourceRoot = "https://openui5.hana.ondemand.com/resources/";

module.exports = function (
  {
    indexTemplateAbsPath,
    outputFilePath,
    thirdpartyLibPath = ".",
    ui5ResourceRoot = defaultResourceRoot,
    projectNameSpce = ""
  }
) {
  var sourceDir = dirname(indexTemplateAbsPath);
  var namepath = projectNameSpce.replace(/\./g, "/");
  var targetJSPath = thirdpartyLibPath;

  if (targetJSPath.endsWith("/") || targetJSPath.startsWith("/")) {
    throw new Error(`Not accept path :${thirdpartyLibPath}, please give thirdpartyLibPath like lib |_thirdparty | other/lib`);
  }

  return through2.obj(async function (file, encoding, cb) {

    await new Promise((res, rej) => {
      glob(`${sourceDir}/**/*.js`, async (err, files) => {
        if (err) {
          rej(err);
          return;
        }
        var distinctDeps = new Set(["sap/m/routing/Router"]);
        var allDeps = files.map(f => {
          var mName = f.replace(sourceDir, namepath);
          var source = readFileSync(f, { encoding: "utf-8" });
          moduleDeps[mName] = concat(findAllImportModules(source, mName), findAllUi5StandardModules(source, mName));
          return moduleDeps[mName];
        });
        concat(...allDeps).forEach(d => {
          if (isUI5StandardModule(d)) {
            distinctDeps.add(d);
          }
        });
        await resolveUI5Module(Array.from(distinctDeps), ui5ResourceRoot);
        res(generatePreloadFile(moduleCache));
        this.push(new GulpFile({
          path: "preload.js",
          contents: Buffer.from(generatePreloadFile(moduleCache))
        }));
      });
    });

    var packageJson = JSON.parse(file.contents.toString());
    var deps = packageJson.dependencies;
    if (deps) {
      try {
        await Promise
          .all(
            Object.keys(deps).map(async d => {
              const code = await bundleModule(d);
              this.push(new GulpFile({ path: `${targetJSPath}/${d}.js`, contents: Buffer.from(code) }));
            })
          );
      } catch (error) {
        cb(error);
      }
    }
    if (indexTemplateAbsPath) {

      if (existsSync(indexTemplateAbsPath)) {

        var indexHtml = replaceHtml(
          readFileSync(indexTemplateAbsPath, { encoding: "utf-8" }),
          Object.keys(deps || {}),
          targetJSPath
        );

        this.push(new GulpFile({
          path: outputFilePath || "index.html",
          contents: Buffer.from(indexHtml)
        }));


      } else {
        warn(`${indexTemplateAbsPath} not exist, so gulp-copy-ui5-thirdparty-library wont replace the template`);
      }

    }

    cb();

  });
};