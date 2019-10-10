"use strict";

var __importDefault = (this && this.__importDefault) || function (mod) {
  return (mod && mod.__esModule) ? mod : { "default": mod };
};

Object.defineProperty(exports, "__esModule", { value: true });

var _babel_options_1 = __importDefault(require("recast/parsers/_babel_options"));

exports.parser = function () {
  try {
    return require("@babel/parser");
  }
  catch (e) {
    return require("babylon");
  }
}();

function parse(source, options) {
  var babelOptions = _babel_options_1.default(options);
  babelOptions.plugins.push("typescript", "jsx", "classProperties");
  return exports.parser.parse(source, babelOptions);
}

exports.parse = parse;;