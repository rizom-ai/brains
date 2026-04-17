export function renderCmsShellHtml(options: { cmsConfigPath: string }): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Content Manager</title>
    <link rel="cms-config-url" href="${options.cmsConfigPath}" type="application/yaml" />
    <script src="https://unpkg.com/@sveltia/cms/dist/sveltia-cms.js"></script>
  </head>
  <body></body>
</html>
`;
}
