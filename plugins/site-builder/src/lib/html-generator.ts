/**
 * Generates the HTML shell for the page
 * Head content is provided as a string from the head collector
 */
export function createHTMLShell(content: string, headContent?: string): string {
  // Default head content if none provided
  const defaultHead = `
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Personal Brain</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <link rel="icon" type="image/png" href="/favicon.png">
    <link rel="stylesheet" href="/styles/main.css">`;

  return `<!DOCTYPE html>
<html lang="en" class="h-full" data-theme="dark">
<head>
    ${headContent ?? defaultHead}
</head>
<body class="h-full font-sans">
  <div id="root" class="min-h-screen">
    ${content}
  </div>
</body>
</html>`;
}
