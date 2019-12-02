var PluginError = require("plugin-error");
var log = require("fancy-log");
var colors = require("ansi-colors");
var through = require("through2");
var path = require("path");
var { findAllUi5StandardModules, findUi5ModuleName } = require("../ui5");
var { sortBy } = require("lodash");

var { Graph } = require("graphlib");

const formatLibraryPreloadFile = modules => {
  const oGraph = new Graph({ directed: true });

  Object.entries(modules).forEach(([, mSrc]) => {
    const mName = findUi5ModuleName(mSrc);
    oGraph.setNode(mName, mSrc);
  });

  Object.entries(modules).forEach(([, mSrc]) => {
    const mName = findUi5ModuleName(mSrc);
    const aDeps = findAllUi5StandardModules(mSrc);
    aDeps.forEach(sDep => {
      if (oGraph.hasNode(sDep)) {
        oGraph.setEdge(mName, sDep);
      }
    });
  });

  var rt = [];

  for (; ;) {

    const aSort = sortBy(
      oGraph.nodes().map(sNode => ({
        iDepCount: oGraph
          .nodeEdges(sNode)
          .filter(e => e.v == sNode).length,
        sNode
      })),
      o => o.iDepCount
    );

    aSort
      .filter(o => o.iDepCount <= 1)
      .forEach(oNode => {
        rt = rt.concat(oGraph.node(oNode.sNode));
        oGraph.removeNode(oNode.sNode);
      });

    if (oGraph.nodeCount() == 0) {
      break;
    }

  }

  return rt.join("\r\n");
};

module.exports = function(options) {
  options = options || {};
  options.isLibrary = !!options.isLibrary;
  options.fileName =
    options.fileName ||
    (options.isLibrary ? "library-preload.js" : "Component-preload.js");

  if (typeof options.base !== "string") {
    throw new PluginError("gulp-ui5-preload", "`base` parameter required");
  }

  var firstFile;
  var preloadModules = {};

  function collectFileContentsFromStream(file, enc, done) {
    // ignore empty files
    if (file.isNull()) {
      done();
      return;
    }
    // we don't do streams (yet)
    if (file.isStream()) {
      this.emit(
        "error",
        new PluginError(
          "gulp-ui5-preload",
          "File Content streams not yet supported"
        )
      );
      done();
      return;
    }
    if (!firstFile && file) {
      firstFile = file;
    }

    try {
      var resolvedPath =
        (options.namespace
          ? options.namespace.split(".").join("/") + "/"
          : "") +
        path
          .relative(path.resolve(options.base), file.path)
          .replace(/\\/g, "/");
      preloadModules[resolvedPath] = file.contents.toString();
    } catch (err) {
      this.emit("error", new PluginError("gulp-ui5-preload", err));
      done();
      return;
    }
    done();
  }

  function pushCombinedFileToStream(done) {
    if (!firstFile) {
      done();
      log.error(
        "gulp-ui5-preload",
        colors.red(
          "WARNING: No files were passed to gulp-ui5-preload. Wrong path?. Skipping emit of Component-preload.js..."
        )
      );
      return;
    }

    // remove logger

    var contents = "";

    var suffix = ".Component-preload";

    if (options.isLibrary) {
      contents = formatLibraryPreloadFile(preloadModules);
    } else {
      contents = `sap.ui.require.preload(${JSON.stringify(preloadModules)}, "${options.namespace + suffix}")`;

    }

    var preloadFile = firstFile.clone({ contents: false });
    preloadFile.contents = Buffer.from(contents, "UTF-8");
    preloadFile.path = path.join(firstFile.base, options.fileName);

    this.push(preloadFile);
    done();
  }

  return through.obj(collectFileContentsFromStream, pushCombinedFileToStream);
};
