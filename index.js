var through2 = require("through2");
var GulpFile = require("vinyl");
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
  findAllLibraries,
  readURLFromCache,
  readBinary
} = require("./ui5");

var { bundleModule } = require("./thirdparty");

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
  bootScriptPath,
  offline = false
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

    var packageJson = JSON.parse(file.contents.toString());
    var thirdPartyDeps = packageJson.dependencies;
    var thirdPartyDepsObject = {};
    var thirdPartyDepsCode = {};

    if (thirdPartyDeps) {
      try {
        await Promise.all(
          Object.keys(thirdPartyDeps).map(async d => {
            const id = `${thirdpartyLibPath}/${d}`;
            thirdPartyDepsObject[d] = id;
            const code = await bundleModule(d);
            thirdPartyDepsCode[`${d}`] = code;
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


    /**
     * distinct dependencies for this project
     */
    var distinctDeps = new Set(additionalModules);

    // preload js module
    var preloadPromise = new Promise((resolve, reject) => {
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
    var preloadProjectPromise = new Promise((resolve, reject) => {
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

    if (preload) {

      // await
      await Promise.all([preloadPromise, preloadProjectPromise]);

      // generate preload file
      var modulesPromise = resolveUI5Module(Array.from(distinctDeps), ui5ResourceRoot);

      var resourcesPromise = fetchAllResource(additionalResources, ui5ResourceRoot);

      var [modules, resources] = await Promise.all([modulesPromise, resourcesPromise]);

      libs = await findAllLibraries(Object.keys(modules));

      modules = Object.assign(modules, thirdPartyDepsCode);

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

    } else {
      libs = findAllLibraries(distinctDeps);
    }

    var cssLinks = [];

    if (offline) {
      var uiCoreContent = await readURLFromCache(`${ui5ResourceRoot}sap-ui-core.js`);
      var corePreloadContent = await readURLFromCache(`${ui5ResourceRoot}sap/ui/core/library-preload.js`);

      var fonts = [
        "sap/ui/core/themes/base/fonts/SAP-icons.woff2",
        `sap/ui/core/themes/${theme}/fonts/72-Regular.woff2`,
        `sap/ui/core/themes/${theme}/fonts/72-Regular.woff`,
        `sap/ui/core/themes/${theme}/fonts/72-Regular-full.woff2`,
        `sap/ui/core/themes/${theme}/fonts/72-Regular-full.woff`,
        "sap/ui/core/themes/base/fonts/SAP-icons.woff",
        "sap/ui/core/themes/base/fonts/SAP-icons.ttf"
      ];

      var files = await Promise.all(
        concat(
          libs
            .filter(lib => lib != "sap/suite/ui")
            .map(async l => ({
              target: `resources/${l}/themes/${theme}/library.css`,
              content: Buffer.from(await readURLFromCache(`${ui5ResourceRoot}${l}/themes/${theme}/library.css`))
            })),
          // without cache
          fonts.map(async fontPath => ({ target: `resources/${fontPath}`, content: await readBinary(`${ui5ResourceRoot}${fontPath}`) }))
        )
      );


      this.push(
        new GulpFile({
          path: "resources/sap-ui-core.js",
          contents: Buffer.from(uiCoreContent)
        })
      );
      this.push(
        new GulpFile({
          path: "resources/sap/ui/core/library-preload.js",
          contents: Buffer.from(corePreloadContent)
        })
      );
      files.forEach(f => {
        this.push(
          new GulpFile({
            path: f.target,
            contents: f.content
          })
        );
      });

      cssLinks = libs
        .filter(lib => lib != "sap/suite/ui")
        .map(l => `./resources/${l}/themes/${theme}/library.css`);

    } else {

      cssLinks = libs
        .filter(lib => lib != "sap/suite/ui")
        .map(l => `${ui5ResourceRoot}${l}/themes/${theme}/library.css`);

    }


    var indexHtml = generateIndexHtmlContent({
      resourceRoot: ui5ResourceRoot,
      projectNameSpace: projectNameSpace,
      theme: theme,
      title: title,
      bootScript,
      bootScriptPath,
      preload,
      offline,
      inlineCssLink: cssLinks,
      resourceRoots: {
        [projectNameSpace]: ".",
        ...thirdPartyDepsObject
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

module.exports.componentPreload = require("./component_preload");