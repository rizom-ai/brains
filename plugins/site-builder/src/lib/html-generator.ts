import type { HelmetServerState } from "react-helmet-async";

/**
 * Generates the minimal HTML shell for the page
 * Most head content is managed by the Head component via Helmet
 */
export function createHTMLShell(
  content: string,
  helmet?: HelmetServerState,
): string {
  // Extract helmet strings if available
  const helmetContent = helmet
    ? [
        helmet.title?.toString(),
        helmet.meta?.toString(),
        helmet.link?.toString(),
        helmet.script?.toString(),
        helmet.noscript?.toString(),
        helmet.style?.toString(),
      ]
        .filter(Boolean)
        .join("\n  ")
    : "";

  return `<!DOCTYPE html>
<html lang="en" class="h-full">
<head>
  ${helmetContent}
</head>
<body class="h-full bg-white font-sans">
  <div id="root" class="min-h-screen">
    ${content}
  </div>
</body>
</html>`;
}
