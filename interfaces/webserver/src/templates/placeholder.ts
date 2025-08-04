/**
 * Placeholder HTML template for when the site hasn't been built yet
 */
export const placeholderHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Personal Brain - Not Built Yet</title>
    <style>
        body {
            font-family: system-ui, -apple-system, sans-serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
            padding: 2rem;
            background-color: #f5f5f5;
        }
        .container {
            background: white;
            padding: 2rem;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        h1 {
            color: #333;
            margin-bottom: 1rem;
        }
        .status {
            background-color: #fffbeb;
            border: 1px solid #fbbf24;
            color: #92400e;
            padding: 1rem;
            border-radius: 4px;
            margin: 1rem 0;
        }
        .instructions {
            background-color: #f0f9ff;
            border: 1px solid #3b82f6;
            color: #1e40af;
            padding: 1rem;
            border-radius: 4px;
            margin: 1rem 0;
        }
        code {
            background-color: #f3f4f6;
            padding: 0.2rem 0.4rem;
            border-radius: 3px;
            font-family: monospace;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🧠 Personal Brain</h1>
        
        <div class="status">
            <strong>⚠️ Site Not Built Yet</strong>
            <p>The Personal Brain website hasn't been built yet. This is a placeholder page.</p>
        </div>
        
        <div class="instructions">
            <strong>To build your site:</strong>
            <p>Run the build command to generate your Personal Brain website:</p>
            <p><code>brain build:site</code></p>
        </div>
        
        <p>Once built, this page will be replaced with your actual Personal Brain website.</p>
    </div>
</body>
</html>`;
