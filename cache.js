var { readFileSync, writeFileSync, existsSync, writeFile } = require("fs");
var { tmpdir } = require("os");
var path = require("path");
var pkg = require("./package");

var cachePath = path.join(tmpdir(), `ui5_cache_${pkg.version}`);

class UI5Cache extends Map {

  Persist() {
    writeFileSync(cachePath, JSON.stringify([...this]), { encoding: "UTF-8" });
  }

  PersistAsync(){
    writeFile(cachePath, JSON.stringify([...this]), { encoding: "UTF-8" }, ()=>{});
  }

}

/**
 * load cache
 */
UI5Cache.Load = () => {
  try {
    if (existsSync(cachePath)) {
      var binCache = readFileSync(cachePath, { encoding: "UTF-8" });
      var binCacheObject = JSON.parse(binCache);
      return new UI5Cache(binCacheObject);
    } else {
      return new UI5Cache();
    }
  } catch (error) {
    // if some error happened
    return new UI5Cache();
  }
};

module.exports = {
  UI5Cache
};