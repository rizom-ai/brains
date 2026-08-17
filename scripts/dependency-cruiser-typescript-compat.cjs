/* eslint-disable @typescript-eslint/explicit-function-return-type */
const Module = require("node:module");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");

const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveTypeScriptForDependencyCruiser(
  request,
  parent,
  isMain,
  options,
) {
  const mappedRequest =
    request === "typescript" || request.startsWith("typescript/")
      ? request.replace(/^typescript/, "typescript-legacy")
      : request;
  return originalResolveFilename.call(
    this,
    mappedRequest,
    parent,
    isMain,
    options,
  );
};

// dependency-cruiser checks the compiler version through createRequire(), then
// loads the compiler through ESM import(). Cover both resolution paths so it
// sees one coherent TypeScript 6 compiler while repo builds continue using TS7.
Module.register(
  pathToFileURL(join(__dirname, "dependency-cruiser-typescript-loader.mjs"))
    .href,
);
