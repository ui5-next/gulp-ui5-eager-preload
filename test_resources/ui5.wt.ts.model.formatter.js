sap.ui.define("ui5/wt/ts/model/formatter", [], function () {
  var _default = {};

  var createFormatter = function createFormatter(oView) {
    return {
      statusText: function statusText(sStatus) {
        var oResourceBundle = oView.getModel("i18n").getResourceBundle();

        switch (sStatus) {
          case "A":
            return oResourceBundle.getText("invoiceStatusA");

          case "B":
            return oResourceBundle.getText("invoiceStatusB");

          case "C":
            return oResourceBundle.getText("invoiceStatusC");

          default:
            return oResourceBundle.getText("invoiceStatusA");
        }
      }
    };
  };

  _default.createFormatter = createFormatter;
  return _default;
})
