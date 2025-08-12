module.exports = {
  root: false,
  extends: ["@brains/eslint-config"],
  parserOptions: {
    projectService: {
      allowDefaultProject: ["*.js", "*.mjs"]
    },
    tsconfigRootDir: __dirname,
  }
};
