# gulp ui5 eager preload plugin

* preload standard modules (with minify)
* allow manually maintain resources & module
* generate `index.html`
* inline `library.css`

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