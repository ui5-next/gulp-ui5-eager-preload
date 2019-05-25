var generateIndexHtmlContent = ({
  bootScriptPath = "",
  bootScript = "",
  resourceRoot = "https://openui5.hana.ondemand.com/resources/",
  theme = "sap_belize",
  projectNameSpace = "",
  preload = false,
  title = "UI5 Application",
  inlineCssLink = [],
  inlineJsSrc = [],
  offline = false,
  resourceRoots = { projectNameSpace: "." }
}) => {

  var sapUiCodeLink = `${resourceRoot}sap-ui-core.js`;

  if (!resourceRoot.endsWith("/")) {
    resourceRoot = `${resourceRoot}/`;
  }

  if (offline) {
    sapUiCodeLink = "./resources/sap-ui-core.js";
  }

  if (preload) {
    inlineJsSrc.push("./preload.js");
    inlineJsSrc.push("./Component-preload.js");
  }

  var jsSrcs = inlineJsSrc.map(l => `<script src="${l}"></script>`).join("\n");

  var cssLinks = inlineCssLink
    .map(l => `<link rel="stylesheet" href="${l}">`)
    .join("\n");

  var sBootScript = "";

  if (bootScriptPath) {
    sBootScript = `<script src="${bootScriptPath}"></script>`;
  } else if (bootScript) {
    sBootScript = `<script>${bootScript}</script>`;
  }

  return `<!DOCTYPE html>
  <html>
  
  <head>
      <meta http-equiv="X-UA-Compatible" content="IE=edge">
      <meta charset="utf-8">
      <title>
          ${title}
      </title>
      <script 
          id="sap-ui-bootstrap" 
          src="${sapUiCodeLink}" 
          data-sap-ui-theme="${theme}"
          data-sap-ui-compatVersion="edge" 
          data-sap-ui-resourceroots='${JSON.stringify(resourceRoots)}'
      >
      </script>
      ${jsSrcs}
  </head>

  ${cssLinks}
  
  <body class="sapUiBody" id="content">
      ${sBootScript}
  </body>
  
  </html>`;
};

module.exports = { generateIndexHtmlContent };
