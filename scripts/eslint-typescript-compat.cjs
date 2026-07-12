const Module = require("node:module");

const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveLegacyTypescriptForEslint(
  request,
  parent,
  isMain,
  options,
) {
  // @typescript-eslint does not support the TypeScript 7 package yet because
  // TS7 no longer exposes the classic compiler API from the root module. Lint
  // runs with this preload only, so repo builds/typechecks still use TS7 while
  // ESLint's parser stack resolves the TS6-compatible API it currently needs.
  if (request === "typescript" || request.startsWith("typescript/")) {
    return originalResolveFilename.call(
      this,
      request.replace(/^typescript/, "typescript-legacy"),
      parent,
      isMain,
      options,
    );
  }

  return originalResolveFilename.call(this, request, parent, isMain, options);
};
