import type { CmsConfig } from "@brains/cms-config";

export function renderCmsShellHtml(options: { cmsConfig: CmsConfig }): string {
  const cmsInitConfig = JSON.stringify({
    ...options.cmsConfig,
    load_config_file: false,
  });

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Content Manager</title>
    <script>
      window.CMS_MANUAL_INIT = true;
      window.CMS_BOOTSTRAP_CONFIG = ${cmsInitConfig};
    </script>
    <script src="https://unpkg.com/@sveltia/cms/dist/sveltia-cms.js"></script>
    <script>
      window.initCMS?.({ config: window.CMS_BOOTSTRAP_CONFIG });
    </script>
  </head>
  <body></body>
</html>
`;
}
