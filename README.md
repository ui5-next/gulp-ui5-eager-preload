# gulp ui5 eager preload plugin

* preload standard modules (with uglify, only preload `imported` modules).
* allow manually maintain resources & module.
* generate `index.html`, inline `library.css` avoid xhr block request.
* local file & url based cache.

in standard `openui5 workthrough` demo

* totally downloaded file size will reduce `%50` or more (depends on the usage rate for single standard library).
* first screen time dropped from 1500ms to 300ms (with cache).
* reduce the number of requests.

## to do

* support preload from `xml fragment`
* document

## sample

```js

eagerPreload({
  ui5ResourceRoot: "https://openui5.hana.ondemand.com/resources",
  preload: true,
  sourceDir: join(__dirname, "./src"),
  thirdpartyLibPath: "_thridparty",
  projectNameSpace: namespace,
  addtionalResources: [
    "sap/m/messagebundle_zh_CN.properties",
    "sap/ui/core/messagebundle_zh_CN.properties"
  ],
  title: "UI5 Project",
  theme: "sap_belize",
  bootScriptPath: "./index.js",
  addtionalModules: ["sap/m/routing/Router", "sap/ui/thirdparty/datajs"]
})

```
