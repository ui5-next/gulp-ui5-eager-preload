var generateIndexHtmlContent = ({
  bootScriptPath = "",
  bootScript = "",
  resourceRoot = "https://openui5.hana.ondemand.com/resources/",
  theme = "sap_belize",
  projectNameSpace = "",
  preload = false,
  title = "UI5 Application",
  inlineCssLink = [],
  resourceRoots = { projectNameSpace: "." }
}) => {
  if (!resourceRoot.endsWith("/")) {
    resourceRoot = `${resourceRoot}/`;
  }
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
          src="${resourceRoot}sap-ui-core.js" 
          data-sap-ui-theme="${theme}"
          data-sap-ui-compatVersion="edge" 
          data-sap-ui-resourceroots='${JSON.stringify(resourceRoots)}'
      >
      </script>
      ${preload ? '<script src="./preload.js"></script>' : ""}
      ${preload ? '<script src="./Component-preload.js"></script>' : ""}
  </head>

  ${cssLinks}
  
  <body class="sapUiBody" id="content">
      ${sBootScript}
  </body>
  
  </html>`;
};

module.exports = { generateIndexHtmlContent };
