import { serializeForScript } from "./script-literal";

// Pin the Sveltia CMS build. This script receives a GitHub write token in the
// browser, so an unpinned `@latest` would be both a stability and supply-chain
// risk. Bump deliberately. Keep in sync with @brains/cms-config.
const SVELTIA_CMS_SRC =
  "https://unpkg.com/@sveltia/cms@0.165.1/dist/sveltia-cms.js";

export function renderCmsShellHtml(options: {
  cmsConfigPath: string;
  authTokenEndpoint?: string;
}): string {
  const cmsScript = `<script src="${SVELTIA_CMS_SRC}"></script>`;
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Content Manager</title>
    <link rel="cms-config-url" href="${options.cmsConfigPath}" type="application/yaml" />
    ${
      options.authTokenEndpoint
        ? `<script>${renderCmsAuthBootstrapScript(options.authTokenEndpoint)}</script>`
        : cmsScript
    }
  </head>
  <body></body>
</html>
`;
}

function renderCmsAuthBootstrapScript(authTokenEndpoint: string): string {
  return `
    (async () => {
      function showError(message) {
        document.body.textContent = message;
      }

      try {
        const response = await fetch(${serializeForScript(authTokenEndpoint)}, { method: 'POST' });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || response.statusText || 'CMS authorization failed');
        }
        if (!payload.token) {
          throw new Error('CMS token response omitted token');
        }

        localStorage.setItem('sveltia-cms.user', JSON.stringify({
          backendName: 'github',
          token: payload.token,
        }));

        const script = document.createElement('script');
        script.src = ${serializeForScript(SVELTIA_CMS_SRC)};
        document.head.appendChild(script);
      } catch (error) {
        showError(error instanceof Error ? error.message : String(error));
      }
    })();
  `;
}
