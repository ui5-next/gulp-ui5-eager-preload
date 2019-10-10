var { findAllUi5StandardModules, findUi5ModuleName, findAllImportModules } = require("./ui5");
var { readFileSync } = require("fs");

const testDialogDependency = [
  'sap/m/Bar',
  'sap/m/InstanceManager',
  'sap/m/AssociativeOverflowToolbar',
  'sap/m/ToolbarSpacer',
  'sap/m/Title',
  'sap/m/library',
  'sap/ui/core/Control',
  'sap/ui/core/IconPool',
  'sap/ui/core/Popup',
  'sap/ui/core/delegate/ScrollEnablement',
  'sap/ui/core/RenderManager',
  'sap/ui/core/InvisibleText',
  'sap/ui/core/ResizeHandler',
  'sap/ui/Device',
  'sap/ui/base/ManagedObject',
  'sap/ui/core/library',
  'sap/m/TitlePropagationSupport',
  'sap/m/DialogRenderer',
  'sap/base/Log',
  'sap/ui/thirdparty/jquery',
  'sap/ui/core/Core',
  'sap/ui/core/Configuration',
  'sap/ui/dom/jquery/control',
  'sap/ui/dom/jquery/Focusable'
];


test('should find sap.ui.define modules (compressed)', () => {
  expect(findAllUi5StandardModules(readFileSync("./test_resources/sap.m.Dialog.js"), "sap/m/Dialog")).toStrictEqual(testDialogDependency);
});

test('should find sap.ui.define modules', () => {
  expect(findAllUi5StandardModules(readFileSync("./test_resources/sap.m.Dialog.2.js"), "sap/m/Dialog")).toStrictEqual(testDialogDependency);
});

const testGlobalDependency = [
  'sap/ui/base/Object',
  'sap/ui/VersionInfo',
  'sap/base/Log',
  'sap/base/assert',
  'sap/base/util/ObjectPath'
];

test('should find sap.ui.require modules', () => {
  expect(findAllUi5StandardModules(readFileSync("./test_resources/sap.ui.Global.js"), "sap/ui/Global").sort()).toStrictEqual(testGlobalDependency.sort());
});

test('should find tsx files modules (empty but without errors)', () => {
  expect(findAllUi5StandardModules(readFileSync("./test_resources/ProductRating.tsx"), "test/ProductRating").sort()).toStrictEqual([].sort());
});

test('should find ui5 module name', () => {
  expect(
    findUi5ModuleName(
      readFileSync("./test_resources/ui5.wt.ts.model.formatter.js")
    )
  ).toBe("ui5/wt/ts/model/formatter");
});

test("should find es6 imported sources", () => {
  const expected = [ 'sap/ui/core/UIComponent',
    'sap/ui/model/json/JSONModel',
    'sap/ui/Device',
    'ui5/wt/ts/fragments/HelloDialog',
    'ui5/wt/ts/manifest',
    'sap/m/Dialog',
    'sap/ui/model/BindingMode',
    'sap/ui/core/mvc/View',
    'sap/ui/core/mvc/Controller'
  ] .sort();
  expect(
    findAllImportModules(readFileSync("./test_resources/Component.ts"), "ui5/wt/ts/Component").sort()
  ).toStrictEqual(expected);
});