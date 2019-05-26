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
  readBinary,
  persistCache
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

    // await analyze project modules
    await Promise.all([preloadPromise, preloadProjectPromise]);

    if (preload) {

      // generate preload file
      var modules = await resolveUI5Module(Array.from(distinctDeps), ui5ResourceRoot);

      libs = await findAllLibraries(Object.keys(modules));

      additionalResources = additionalResources.concat(libs.map(l => `${l}/messagebundle_zh_CN.properties`));
      additionalResources = additionalResources.concat(libs.map(l => `${l}/messagebundle_en.properties`));
      additionalResources = additionalResources.concat(libs.map(l => `${l}/messagebundle.properties`));
      additionalResources = additionalResources.concat(libs.map(l => `${l}/messagebundle_en_US.properties`));
      additionalResources = additionalResources.concat(libs.map(l => `${l}/messagebundle_en_UK.properties`));

      var resources = await fetchAllResource(additionalResources, ui5ResourceRoot);

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

      var offlineFiles = [
        `sap/ui/core/themes/${theme}/fonts/72-Regular.woff2`,
        `sap/ui/core/themes/${theme}/fonts/72-Regular.woff`,
        `sap/ui/core/themes/${theme}/fonts/72-Regular-full.woff2`,
        `sap/ui/core/themes/${theme}/fonts/72-Regular-full.woff`,
        `sap/ui/core/themes/${theme}/fonts/72-Bold.woff2`,
        `sap/ui/core/themes/${theme}/fonts/72-Bold.woff`,
        `sap/ui/core/themes/${theme}/fonts/72-Bold-full.woff2`,
        `sap/ui/core/themes/${theme}/fonts/72-Bold-full.woff`,
        "sap/ui/core/themes/base/fonts/SAP-icons.woff2",
        "sap/ui/core/themes/base/fonts/SAP-icons.woff",
        "sap/ui/core/themes/base/fonts/SAP-icons.ttf",
        "sap/ui/core/cldr/zh_CN.json"
      ];

      var files = await Promise.all(
        concat(
          libs.map(async l => ({
            target: `resources/${l}/themes/${theme}/library.css`,
            content: Buffer.from(await readURLFromCache(`${ui5ResourceRoot}${l}/themes/${theme}/library.css`))
          })),
          libs.map(async l => ({
            target: `resources/${l}/themes/${theme}/library-parameters.json`,
            content: Buffer.from(await readURLFromCache(`${ui5ResourceRoot}${l}/themes/${theme}/library-parameters.json`))
          })),
          offlineFiles.map(async fontPath => ({ target: `resources/${fontPath}`, content: await readBinary(`${ui5ResourceRoot}${fontPath}`) }))
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
      cssLinks = libs.map(l => `./resources/${l}/themes/${theme}/library.css`);
    } else {
      cssLinks = libs.map(l => `${ui5ResourceRoot}${l}/themes/${theme}/library.css`);
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

    persistCache.Persist();

    cb();
  });
};

module.exports.componentPreload = require("./component_preload");