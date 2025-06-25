// Test Bun.build for in-memory JSX transpilation
const jsx = `
import { hydrate } from "preact";
const Component = () => <div>Hello</div>;
hydrate(<Component />, document.body);
`;

// Write to temp file
const fs = require('fs');
const path = require('path');
const tempFile = path.join(__dirname, 'temp-jsx.tsx');

fs.writeFileSync(tempFile, jsx);

async function testBuild() {
  try {
    const result = await Bun.build({
      entrypoints: [tempFile],
      target: 'browser',
      format: 'esm',
      jsx: {
        factory: 'preact.h',
        fragment: 'preact.Fragment'
      },
      write: false // Don't write to disk, keep in memory
    });

    if (result.success) {
      const output = await result.outputs[0].text();
      console.log('Built result:', output);
    } else {
      console.error('Build failed:', result.logs);
    }
  } catch (error) {
    console.error('Build error:', error);
  } finally {
    // Clean up temp file
    try {
      fs.unlinkSync(tempFile);
    } catch {}
  }
}

testBuild();