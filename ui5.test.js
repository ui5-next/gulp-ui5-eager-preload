var { findAllUi5StandardModules } = require("./ui5");
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
  expect(findAllUi5StandardModules(readFileSync("./test_resources/sap.ui.Global.js"), "sap/ui/Global")).toStrictEqual(testGlobalDependency);
});