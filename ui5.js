var { reduce, forEach, isEmpty, get, find, map } = require("lodash");
var { dirname, join: pathJoin } = require("path");
var { warn } = require("console");
var { existsSync, readFileSync } = require("fs");
var findNodeModules = require('find-node-modules');
var log = require("fancy-log");
var colors = require("ansi-colors");
var ui5Parser = require("./ui5_parser");

var jsParser = {
  parse: source => {
    return require("recast").parse(source, { parser: ui5Parser });
  }
};

var traverseSource = (source, options) => {
  return require("@babel/traverse").default(jsParser.parse(source), options);
};

var fetch = require("node-fetch");
var UglifyJS = require("uglify-js");
var parseString = require("xml2js").parseString;
var crypto = require("crypto");
var { UI5Cache } = require("./cache");

var { eachDeep } = require("deepdash")(require("lodash"));

var persistCache = UI5Cache.load();

var FIVE_MINUTES = 5 * 60 * 1000;

var BASE64 = "base64";

/**
 * UI5 Library List
 */
var UI5Libraries = [
  "sap/ui/core",
  "sap/ui/layout",
  "sap/ui/unified",
  "sap/ui/table",
  "sap/ui/commons",
  "sap/ui/viz",
  "sap/ui/suite",
  "sap/ui/richtexteditor",
  "sap/ui/comp",
  "sap/m",
  "sap/f",
  "sap/gantt",
  "sap/ushell",
  "sap/tnt",
  "sap/uxap"
];

/**
 * md5 hash
 */
var md5 = s => {
  var md5 = crypto.createHash("md5");
  return md5.update(s).digest("hex");
};

var readBinary = async url => {
  var GlobalResourceCache = persistCache.get("GlobalResourceCache") || {};
  var hash = md5(url);
  var base64Content = GlobalResourceCache[hash];

  if (!base64Content) {
    var response = await fetch(url, { timeout: FIVE_MINUTES });
    var buf = await response.buffer();
    GlobalResourceCache[hash] = buf.toString(BASE64);
    persistCache.set("GlobalResourceCache", GlobalResourceCache);
    return buf;
  } else {
    return Buffer.from(base64Content, BASE64);
  }
};

var readURLFromCache = async url => {
  var GlobalResourceCache = persistCache.get("GlobalResourceCache") || {};
  var hash = md5(url);
  var urlContent = GlobalResourceCache[hash];
  if (!urlContent) {
    var response = await fetch(url, { timeout: FIVE_MINUTES });
    if (response.status == 404) {
      log.warn("[preload]", colors.yellow(`Can not fetch module: ${url}`));
    }
    urlContent = await response.text();
    GlobalResourceCache[hash] = urlContent;
    persistCache.set("GlobalResourceCache", GlobalResourceCache);
  }
  return urlContent;
};

var isUi5CoreCoreJs = (mName = "") => {
  return mName && (
    mName.startsWith("jquery.") ||
    mName.startsWith("sap-ui-") ||
    mName.startsWith("ui5loader") ||
    mName.startsWith("sap/ui/support/jQuery")
  );
};

/**
 * get the library name of a module
 * @param {string} mName
 */
var getSourceLibraryName = mName => {
  var rt;
  if (isUi5CoreCoreJs(mName)) {
    return "sap.ui.core";
  }
  forEach(UI5Libraries, libraryName => {
    if (mName.startsWith(libraryName)) {
      rt = libraryName;
    }
  });
  return rt;
};

/**
 * normalize library name sap/ui/core -> sap.ui.core
 * @param {string} lName library name
 */
var normalizeLibraryName = (lName = "") => lName.replace(/\//g, ".");

var normalizeModuleName = (mName = "") => {
  if (isUi5CoreCoreJs(mName)) {
    return mName;
  } else {
    return mName.replace(/\\/g, "/").replace(/\./g, "/");
  }
};

var formatNodeModulesPath = mName => {
  var nmPath = findNodeModules({ relative: false });
  var libraryName = getSourceLibraryName(mName);
  if (nmPath && libraryName) {
    return pathJoin(nmPath[0], "@openui5", normalizeLibraryName(libraryName), "src", `${mName}.js`);
  } else {
    return "";
  }
};

/**
 * read file from path
 *
 * @param {string} u path
 */
var readFile = u => readFileSync(u, { encoding: "UTF-8" });

var fetchSource = async(mName, resourceRoot = "") => {

  var url = formatNodeModulesPath(mName);

  if (existsSync(url)) {
    // prefer read file from local node modules
    return readFile(url);
  } else {
    url = `${resourceRoot}${mName}.js`;
    try {
      return await readURLFromCache(url);
    } catch (error) {
      warn(`fetch ${mName} failed ${error}`);
      throw error;
    }
  }

};

var fetchAllResource = async(resourceList = [], resourceRoot = "") => {
  var rt = {};

  await Promise.all(
    resourceList.map(async r => {
      var url = `${resourceRoot}${r}`;
      try {
        rt[r] = await readURLFromCache(url);
        return rt[r];
      } catch (error) {
        warn(`fetch ${r} failed ${error}`);
        throw error;
      }
    })
  );

  return rt;
};

/**
 * find Ui5 Module Name from source code
 *
 * @param {string} source string
 */
var findUi5ModuleName = source => {
  var mName = "";

  traverseSource(source, {
    CallExpression({ node }) {
      const nodeGet = path => get(node, path);
      const callArguments = nodeGet("arguments");
      if (callArguments) {
        // with arguments

        // sap.ui.define
        if (
          nodeGet("callee.object.object.name") == "sap" &&
          nodeGet("callee.object.property.name") == "ui" &&
          (nodeGet("callee.property.name") == "define" || nodeGet("callee.property.name") == "predefine")
        ) {
          // find name
          var literal = find(callArguments, arg => (arg.type == "Literal" || arg.type == "StringLiteral"));
          mName = literal.value;
        }
      }
    }
  });

  return mName;
};

/**
 * find modules in sap.ui.define pattern
 */
var findAllUi5StandardModules = (source, sourceName = "") => {
  var base = dirname(sourceName);
  var deps = [];
  var addDependency = dependency => { if (dependency) {deps = deps.concat(dependency);} };

  traverseSource(source, {
    CallExpression({ node }) {
      const nodeGet = path => get(node, path);
      const callArguments = nodeGet("arguments");
      if (callArguments) {// with arguments)

        // sap.ui.define
        if (
          nodeGet("callee.object.object.name") == "sap" &&
          nodeGet("callee.object.property.name") == "ui" &&
          (nodeGet("callee.property.name") == "define" || nodeGet("callee.property.name") == "predefine")
        ) {
          // find []
          var arrayExpression = find(nodeGet("arguments"), arg => arg.type == "ArrayExpression");
          if (arrayExpression && arrayExpression.elements) {
            addDependency(map(arrayExpression.elements, ele => ele.value));
          }
        }

        // sap.ui.require
        if (
          nodeGet("callee.object.object.name") == "sap" &&
          nodeGet("callee.object.property.name") == "ui" &&
          nodeGet("callee.property.name") == "require"
        ) {
          // var JSONModel = sap.ui.require("sap/ui/model/json/JSONModel");
          if (callArguments.length == 1 && (callArguments[0].type == "Literal" || callArguments[0].type == "StringLiteral")) {
            addDependency(callArguments[0].value);
          } else {
            // sap.ui.require(['sap/ui/model/json/JSONModel', 'sap/ui/core/UIComponent'], function(JSONModel,UIComponent) {});
            var e2 = find(nodeGet("arguments"), arg => arg.type == "ArrayExpression");
            if (e2 && e2.elements) {
              addDependency(map(e2.elements, ele => ele.value));
            }
          }
        }

        // sap.ui.requireSync
        if (
          nodeGet("callee.object.object.name") == "sap" &&
          nodeGet("callee.object.property.name") == "ui" &&
          nodeGet("callee.property.name") == "requireSync"
        ) {
          // var JSONModel = sap.ui.requireSync("sap/ui/model/json/JSONModel");
          if (callArguments.length == 1 && (callArguments[0].type == "Literal" || callArguments[0].type == "StringLiteral")) {
            addDependency(callArguments[0].value);
          } else {
            // sap.ui.requireSync(['sap/ui/model/json/JSONModel', 'sap/ui/core/UIComponent'], function(JSONModel,UIComponent) {});
            var e3 = find(nodeGet("arguments"), arg => arg.type == "ArrayExpression");
            if (e3 && e3.elements) {
              addDependency(map(e3.elements, ele => ele.value));
            }
          }
        }
        // jQuery.sap.require
        if (
          nodeGet("callee.object.object.name") == "jQuery" &&
          nodeGet("callee.object.property.name") == "ui" &&
          nodeGet("callee.property.name") == "require"
        ) {
          if (callArguments.length == 1 && (callArguments[0].type == "Literal" || callArguments[0].type == "StringLiteral")) {
            addDependency(callArguments[0].value);
          }
        }


        // sap.ui.lazyRequire
        if (
          nodeGet("callee.object.object.name") == "sap" &&
          nodeGet("callee.object.property.name") == "ui" &&
          nodeGet("callee.property.name") == "lazyRequire"
        ) {
          if (callArguments.length == 1 && (callArguments[0].type == "Literal" || callArguments[0].type == "StringLiteral")) {
            addDependency(callArguments[0].value);
          } else {
            var e4 = find(nodeGet("arguments"), arg => arg.type == "ArrayExpression");
            if (e4 && e4.elements) {
              addDependency(map(e4.elements, ele => ele.value));
            }
          }
        }
      }
    }
  });

  return map(deps, d => {
    if (d.startsWith("./") || d.startsWith("../")) {
      d = pathJoin(base, d);
      d = d.replace(/\\/g, "/");// replace \ to / after join
    }
    return normalizeModuleName(d);
  });

};

var findAllUi5ViewModules = async(source, sourceName) => {
  try {
    return await new Promise((resolve, reject) => {
      var ds = new Set();
      parseString(source, { xmlns: true }, function(err, result) {
        if (err) {
          reject(err);
        } else {
          eachDeep(result, value => {
            if (value && value.$ns) {
              var mName = `${value.$ns.uri}.${value.$ns.local}`.replace(
                /\./g,
                "/"
              );
              ds.add(mName);
            }
          });
          resolve(Array.from(ds));
        }
      });
    });
  } catch (error) {
    warn(`parse ${sourceName} modules failed: ${error}`);
    return [];
  }
};

var findAllImportModules = (source, sourceName = "") => {
  var base = dirname(sourceName);
  var rt = [];
  var addImportedModules = (m) => {
    if (m.startsWith("./") || m.startsWith("../")) {
      // relative module
      rt = rt.concat(pathJoin(base, m).replace(/\\/g, "/"));
    } else {
      rt = rt.concat(m);
    }
  };

  traverseSource(source, {
    ImportDeclaration: ({ node }) => {
      const nodeGet = path => get(node, path);
      const importedModuleName = nodeGet("source.value");
      if (importedModuleName) {
        addImportedModules(importedModuleName);
      }
    }
  });

  return rt;
};

// change recursively to iteration
var resolveUI5Module = async(sModuleNames = [], resourceRoot) => {
  var globalModuleCache = persistCache.get("GlobalModuleCache") || {};
  // this time used modules
  var modules = {};
  // without cache
  var moduleDeps = {};

  // set entry
  moduleDeps["entry"] = sModuleNames;

  for (; ;) {
    var needToBeLoad = new Set();

    forEach(moduleDeps, dep => {
      forEach(dep, d => {
        if (modules[d] == undefined) {
          needToBeLoad.add(d);
        }
      });
    });

    if (isEmpty(needToBeLoad)) {
      // no more dependencies need to be analyzed
      // break from this loop
      break;
    } else {
      await Promise.all(
        Array.from(needToBeLoad).map(async mName => {
          try {

            var source = "";

            try {
              source = await fetchSource(mName, resourceRoot);
            } catch (error) {
              // retry once
              source = await fetchSource(mName, resourceRoot);
            }

            modules[mName] = source;
            var sourceHash = md5(source);

            // use cache here
            if (globalModuleCache[sourceHash]) {
              moduleDeps[mName] = globalModuleCache[sourceHash];
            }

            // not found dependency from cache
            if (!moduleDeps[mName]) {
              moduleDeps[mName] = findAllUi5StandardModules(source, mName);
              globalModuleCache[sourceHash] = moduleDeps[mName];
            }

          } catch (error) {
            modules[mName] = "";
            moduleDeps[mName] = [];
          }
        })
      );
    }
  }

  persistCache.set("GlobalModuleCache", globalModuleCache);

  return modules;
};



/**
 * find out all ui5 libraries
 * @param {string[]} modules name
 *
 * @returns {string[]} lib names
 */
var findAllLibraries = (modules = []) => {
  var rt = new Set();
  forEach(modules, m => {
    forEach(UI5Libraries, l => {
      if (m.startsWith(l)) {
        rt.add(l);
      }
    });
  });
  return Array.from(rt);
};


var isUI5StandardModule = sModuleName => {
  var rt = false;
  UI5Libraries.forEach(packageName => {
    if (sModuleName && sModuleName.startsWith(packageName)) {
      rt = true;
    }
  });
  return rt;
};

/**
 * temporary in memory uglify cache
 */
var TmpUglifyNameCache = {};

/**
 * To generate preload file content
 * @param {*} cache object
 * @param {*} resources list
 */
var generatePreloadFile = (cache = {}, resources = {}) => {
  var modules = reduce(
    cache,
    (pre, moduleSource, moduleName) => {
      // ignore core modules, will be load on bootstrap
      if (!moduleName.startsWith("sap/ui/core")) {
        var sourceHash = md5(moduleSource);
        var compressed = TmpUglifyNameCache[sourceHash];
        if (!compressed) {
          compressed = UglifyJS.minify(moduleSource).code;
        }
        pre[`${moduleName}.js`] = compressed;
        TmpUglifyNameCache[sourceHash] = compressed;
      }
      return pre;
    },
    {}
  );

  forEach(resources, (content, resourceName) => {
    modules[resourceName] = content;
  });

  return `sap.ui.require.preload(${JSON.stringify(modules)})`;
};

module.exports = {
  fetchAllResource,
  generatePreloadFile,
  fetchSource,
  findAllUi5ViewModules,
  isUI5StandardModule,
  findAllImportModules,
  findAllUi5StandardModules,
  findUi5ModuleName,
  resolveUI5Module,
  findAllLibraries,
  readURLFromCache,
  readBinary,
  persistCache
};
