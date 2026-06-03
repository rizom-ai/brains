export function renderCmsShellHtml(options: {
  cmsConfigPath: string;
  authTokenEndpoint?: string;
}): string {
  const cmsScript =
    '<script src="https://unpkg.com/@sveltia/cms/dist/sveltia-cms.js"></script>';
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
        const response = await fetch(${scriptLiteral(authTokenEndpoint)}, { method: 'POST' });
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
        script.src = 'https://unpkg.com/@sveltia/cms/dist/sveltia-cms.js';
        document.head.appendChild(script);
      } catch (error) {
        showError(error instanceof Error ? error.message : String(error));
      }
    })();
  `;
}

function scriptLiteral(value: string): string {
  return JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}
