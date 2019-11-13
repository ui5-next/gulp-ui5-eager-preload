var loadingSpinnerCode = `
<style>
    @keyframes spinner-line-fade-more{0%,100%{opacity:0}1%{opacity:1}}@keyframes spinner-line-fade-quick{0%,100%,39%{opacity:.25}40%{opacity:1}}@keyframes spinner-line-fade-default{0%,100%{opacity:.22}1%{opacity:1}}@keyframes spinner-line-shrink{0%,100%,25%{transform:scale(.5);opacity:.25}26%{transform:scale(1);opacity:1}}
</style>
<script>
  var __assign=this&&this.__assign||function(){return(__assign=Object.assign||function(t){for(var e,n=1,s=arguments.length;n<s;n++)for(var i in e=arguments[n])Object.prototype.hasOwnProperty.call(e,i)&&(t[i]=e[i]);return t}).apply(this,arguments)},defaults={lines:12,length:7,width:5,radius:10,scale:1,corners:1,color:"#000",fadeColor:"transparent",animation:"spinner-line-fade-default",rotate:0,direction:1,speed:1,zIndex:2e9,className:"spinner",top:"50%",left:"50%",shadow:"0 0 1px transparent",position:"absolute"},Spinner=function(){function t(t){void 0===t&&(t={}),this.opts=__assign(__assign({},defaults),t)}return t.prototype.spin=function(t){return this.stop(),this.el=document.createElement("div"),this.el.className=this.opts.className,this.el.setAttribute("role","progressbar"),css(this.el,{position:this.opts.position,width:0,zIndex:this.opts.zIndex,left:this.opts.left,top:this.opts.top,transform:"scale("+this.opts.scale+")"}),t&&t.insertBefore(this.el,t.firstChild||null),drawLines(this.el,this.opts),this},t.prototype.stop=function(){return this.el&&("undefined"!=typeof requestAnimationFrame?cancelAnimationFrame(this.animateId):clearTimeout(this.animateId),this.el.parentNode&&this.el.parentNode.removeChild(this.el),this.el=void 0),this},t}();function css(t,e){for(var n in e)t.style[n]=e[n];return t}function getColor(t,e){return"string"==typeof t?t:t[e%t.length]}function drawLines(t,e){var n=Math.round(e.corners*e.width*500)/1e3+"px",s="none";!0===e.shadow?s="0 2px 4px #000":"string"==typeof e.shadow&&(s=e.shadow);for(var i=parseBoxShadow(s),o=0;o<e.lines;o++){var r=~~(360/e.lines*o+e.rotate),a=css(document.createElement("div"),{position:"absolute",top:-e.width/2+"px",width:e.length+e.width+"px",height:e.width+"px",background:getColor(e.fadeColor,o),borderRadius:n,transformOrigin:"left",transform:"rotate("+r+"deg) translateX("+e.radius+"px)"}),d=o*e.direction/e.lines/e.speed;d-=1/e.speed;var h=css(document.createElement("div"),{width:"100%",height:"100%",background:getColor(e.color,o),borderRadius:n,boxShadow:normalizeShadow(i,r),animation:1/e.speed+"s linear "+d+"s infinite "+e.animation});a.appendChild(h),t.appendChild(a)}}function parseBoxShadow(t){for(var e=/^\s*([a-zA-Z]+\s+)?(-?\d+(\.\d+)?)([a-zA-Z]*)\s+(-?\d+(\.\d+)?)([a-zA-Z]*)(.*)$/,n=[],s=0,i=t.split(",");s<i.length;s++){var o=i[s].match(e);if(null!==o){var r=+o[2],a=+o[5],d=o[4],h=o[7];0!==r||d||(d=h),0!==a||h||(h=d),d===h&&n.push({prefix:o[1]||"",x:r,y:a,xUnits:d,yUnits:h,end:o[8]})}}return n}function normalizeShadow(t,e){for(var n=[],s=0,i=t;s<i.length;s++){var o=i[s],r=convertOffset(o.x,o.y,e);n.push(o.prefix+r[0]+o.xUnits+" "+r[1]+o.yUnits+o.end)}return n.join(", ")}function convertOffset(t,e,n){var s=n*Math.PI/180,i=Math.sin(s),o=Math.cos(s);return[Math.round(1e3*(t*o+e*i))/1e3,Math.round(1e3*(-t*i+e*o))/1e3]}

  var loadingSpinner = new Spinner().spin();
  document.getElementById('content').appendChild(loadingSpinner.el)
</script>
`;

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
  withLoadingSpinner = false,
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
      <title>${title}</title>
  </head>

  <body class="sapUiBody" id="content"></body>

${withLoadingSpinner ? loadingSpinnerCode : ""}
<script
  id="sap-ui-bootstrap"
  src="${sapUiCodeLink}"
  data-sap-ui-theme="${theme}"
  data-sap-ui-compatVersion="edge"
  data-sap-ui-resourceroots='${JSON.stringify(resourceRoots)}'
>
</script>
${sBootScript}
${jsSrcs}
${cssLinks}
</html>`;
};

module.exports = { generateIndexHtmlContent };
