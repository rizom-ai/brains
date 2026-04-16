export function renderCmsShellHtml(options: { cmsConfigYaml: string }): string {
  const cmsConfigDataUrl = `data:text/yaml;charset=utf-8,${encodeURIComponent(
    options.cmsConfigYaml,
  )}`;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Content Manager</title>
    <script>
      window.CMS_CONFIG_URL = ${JSON.stringify(cmsConfigDataUrl)};
    </script>
    <script src="https://unpkg.com/@sveltia/cms/dist/sveltia-cms.js"></script>
  </head>
  <body></body>
</html>
`;
}
