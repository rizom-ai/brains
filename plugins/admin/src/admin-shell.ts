export function renderAdminShellHtml(
  options: { cmsConfigPath?: string } = {},
): string {
  const cmsConfigPath = options.cmsConfigPath ?? "/cms-config";

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Content Manager</title>
    <script>
      window.CMS_CONFIG_URL = ${JSON.stringify(cmsConfigPath)};
    </script>
    <script src="https://unpkg.com/@sveltia/cms/dist/sveltia-cms.js"></script>
  </head>
  <body></body>
</html>
`;
}
