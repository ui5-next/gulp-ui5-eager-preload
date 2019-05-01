var { reduce, forEach, isEmpty } = require("lodash");
var { dirname, join: pathJoin } = require("path");
var { readFileSync, writeFileSync, existsSync } = require("fs");
var { tmpdir } = require("os");
var { warn } = require("console");
var fetch = require("node-fetch");
var UglifyJS = require("uglify-js");
var parseString = require('xml2js').parseString;

var { eachDeep } = require('deepdash')(require('lodash'));

var md5 = s => {
  var crypto = require("crypto");
  var md5 = crypto.createHash("md5");
  return md5.update(s).digest("hex");
};

var readURLFromCache = async url => {
  var encoding = "utf-8";
  var location = pathJoin(tmpdir(), md5(url));
  if (existsSync(location)) {
    return readFileSync(location, { encoding });
  } else {
    var response = await fetch(url);
    var content = await response.text();
    writeFileSync(location, content, { encoding });
    return await content;
  }
};

var fetchSource = async (mName, resourceRoot = "") => {
  var url = `${resourceRoot}${mName}.js`;
  try {
    return await readURLFromCache(url);
  } catch (error) {
    warn(`fetch ${mName} failed ${error}`);
    throw error;
  }
};

var fetchAllResource = async (resourceList = [], resourceRoot = "") => {
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
 * find modules in sap.ui.define parttern
 */
var findAllUi5StandardModules = (source, sourceName) => {
  var base = dirname(sourceName);
  var groups = /sap\.ui\.define\(.*?(\[.*?\])/g.exec(source);
  if (groups && groups.length > 0) {
    var sArray = groups[1].replace(/'/g, '"');
    const dependencies = JSON.parse(sArray);

    return dependencies.map(d => {
      if (d.startsWith("./") || d.startsWith("../")) {
        d = pathJoin(base, d);
        // replace \ to / after join
        d = d.replace(/\\/g, "/");
      }
      return d;
    });
  }
  return [];
};

var findAllUi5ViewModules = async (source, sourceName) => {
  try {
    return await new Promise((resolve, reject) => {
      var ds = new Set();
      parseString(source, { xmlns: true }, function (err, result) {
        if (err) {
          reject(err);
        } else {
          eachDeep(result, (value) => {
            if (value && value.$ns) {
              var mName = `${value.$ns.uri}.${value.$ns.local}`.replace(/\./g, "/");
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
  var matchedTexts = source.match(/import.*?["|'](.*?)["|']/g);
  if (matchedTexts) {
    rt = matchedTexts.map(t => {
      var importName = /import.*?["|'](.*?)["|']/g.exec(t)[1];
      if (importName.startsWith("./")) {
        importName = pathJoin(base, importName).replace(/\\/g, "/");
      }
      return importName;
    });
  }
  return rt;
};

// change rescursive to iteration
var resolveUI5Module = async (sModuleNames = [], resourceRoot) => {
  var moduleCache = {};
  var moduleDeps = {};
  moduleDeps["entry"] = sModuleNames;
  for (; ;) {
    var needToBeLoad = new Set();
    forEach(moduleDeps, dep => {
      forEach(dep, d => {
        if (moduleCache[d] == undefined) {
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
            var source = await fetchSource(mName, resourceRoot);
          // use cache here
            moduleCache[mName] = source;
            moduleDeps[mName] = findAllUi5StandardModules(source, mName);
          } catch (error) {
            moduleCache[mName] = "";
            moduleDeps[mName] = [];
          }
        })
      );
    }
  }
  return moduleCache;
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

var generatePreloadFile = (cache = {}, resources = {}) => {
  var modules = reduce(
    cache,
    (pre, moduleSource, moduleName) => {
      // ignore core modules, will be load on bootstrap
      if (!moduleName.startsWith("sap/ui/core")) {
        pre[`${moduleName}.js`] = UglifyJS.minify(moduleSource).code;
      }
      return pre;
    }, {}
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
  resolveUI5Module,
  findAllLibraries
};