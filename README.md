# gulp ui5 eager preload plugin

[![npm version](https://badge.fury.io/js/gulp-ui5-eager-preload.svg)](https://www.npmjs.com/package/gulp-ui5-eager-preload)

Please use this module by [The ultimate generator for UI5](https://github.com/ui5-next/ui5g)

## features

* preload standard modules (with `uglify`, only preload used modules).
* allow manually maintain resources & module.
* generate `index.html`, inline `library.css` avoid xhr block request.
* local file & url based cache.
* enable use thirdparty library from `node_modules`

in standard `openui5 workthrough` demo

* totally downloaded file size will reduce `%50` or more (depends on the usage rate for single standard library).
* first screen time dropped from 1500ms to 300ms (with cache).
* reduce the number of requests.

## sample configuration

```js

eagerPreload({
  // Current Project Title
  title: "UI5 Project",
  // theme
  theme: "sap_belize",
  // standard library resource root
  ui5ResourceRoot: "https://openui5.hana.ondemand.com/resources",
  // enable preload logic
  preload: true,
  sourceDir: join(__dirname, "./src"),
  // thirdparty library output library
  thirdpartyLibPath: "_thirdparty",
  // project namespace
  projectNameSpace: namespace,
  // additionalResources
  additionalResources: [
    "sap/m/messagebundle_zh_CN.properties",
    "sap/ui/core/messagebundle_zh_CN.properties"
  ],
  // boot script
  bootScriptPath: "./index.js",
  // additionalModules 
  // sometimes ui5 will dynamic load resource
  // just use devtools find them and add them to here
  additionalModules: ["sap/m/routing/Router", "sap/ui/thirdparty/datajs"]
})

```
