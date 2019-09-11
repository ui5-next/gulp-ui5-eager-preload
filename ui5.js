var { reduce, forEach, isEmpty } = require("lodash");
var { dirname, join: pathJoin } = require("path");
var { warn } = require("console");
var log = require("fancy-log");
var colors = require("ansi-colors");

var fetch = require("node-fetch");
var UglifyJS = require("uglify-js");
var parseString = require("xml2js").parseString;
var crypto = require("crypto");
var { UI5Cache } = require("./cache");

var { eachDeep } = require("deepdash")(require("lodash"));

var persistCache = UI5Cache.Load();

var FIVE_MINUTES = 5 * 60 * 1000;

var BASE64 = "base64";

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

var fetchSource = async(mName, resourceRoot = "") => {
  var url = `${resourceRoot}${mName}.js`;
  try {
    return await readURLFromCache(url);
  } catch (error) {
    warn(`fetch ${mName} failed ${error}`);
    throw error;
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
 * find Ui5 Module Name
 * @param {string} source string
 */
var findUi5ModuleName = source => {
  var mName = "";

  var mNameReg = /sap\.ui\.define\("(.*?)".*?\)/g;

  var group;

  while ((group = mNameReg.exec(source)) != undefined) {
    try {
      mName = group[1];
    } catch (error) {
      log.error(
        `can not found sap.ui.require([...]) with ${group[1]} in ${sourceName}`
      );
    }
  }

  return mName;
};

/**
 * find modules in sap.ui.define pattern
 */
var findAllUi5StandardModules = (source, sourceName) => {
  var base = dirname(sourceName);

  var deps = [];

  var reqMultiReg = /sap\.ui\.require\((\[".*?\"].*?)/g;

  var group;

  while ((group = reqMultiReg.exec(source)) != undefined) {
    try {
      deps = deps.concat(JSON.parse(group[1].replace(/'/g, '"')));
    } catch (error) {
      log.error(
        `can not parse sap.ui.require([...]) with ${group[1]} in ${sourceName}`
      );
    }
  }

  var reqSyncReg = /sap\.ui\.requireSync\("(.*?)"\)/g;

  while ((group = reqSyncReg.exec(source)) != undefined) {
    try {
      const v = group[1];
      // some require sync is formatted by string
      if (v.indexOf("+") < 0) {
        deps = deps.concat(group[1]);
      }
    } catch (error) {
      log.error(
        `can not parse sap.ui.requireSync([...]) with ${
          group[1]
        } in ${sourceName}`
      );
    }
  }

  var reqSingleReg = /sap\.ui\.require\("(.*?)"\)/g;

  while ((group = reqSingleReg.exec(source)) != undefined) {
    try {
      deps = deps.concat(group[1]);
    } catch (error) {
      log.error(
        `can not parse sap.ui.require("...") with ${group[1]} in ${sourceName}`
      );
    }
  }

  var defGroups = /sap\.ui\.define\(.*?(\[.*?\])/g.exec(source);

  if (defGroups && defGroups.length > 0) {
    var sArray = defGroups[1].replace(/'/g, '"');
    deps = deps.concat(JSON.parse(sArray));
  }

  return deps.map(d => {
    if (d.startsWith("./") || d.startsWith("../")) {
      d = pathJoin(base, d);
      // replace \ to / after join
      d = d.replace(/\\/g, "/");
    }
    return d;
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

// change recursively to iteration
var resolveUI5Module = async(sModuleNames = [], resourceRoot) => {
  var globalModuleCache = persistCache.get("GlobalModuleCache") || {};
  // this time used modules
  var modules = {};
  // without cache
  var moduleDeps = {};

  // set entry
  moduleDeps["entry"] = sModuleNames;

  for (;;) {
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
            // use cache here
            modules[mName] = source;
            if (!moduleDeps[mName]) {
              moduleDeps[mName] = findAllUi5StandardModules(source, mName);
            }
          } catch (error) {
            modules[mName] = "";
            moduleDeps[mName] = [];
          }
        })
      );
    }
  }

  persistCache.set(
    "GlobalModuleCache",
    Object.assign(globalModuleCache, modules)
  );

  return modules;
};

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
