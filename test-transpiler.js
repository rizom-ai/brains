// Test Bun's transpiler API
const Bun = require('bun');

// Test if Bun has transpile capabilities
console.log('Bun.Transpiler available:', !!Bun.Transpiler);

// Try to transpile JSX
const jsxCode = `
import { hydrate } from "preact";
const Component = () => <div>Hello</div>;
hydrate(<Component />, document.body);
`;

try {
  // Check if Bun.Transpiler exists
  if (Bun.Transpiler) {
    console.log('Creating transpiler...');
    const transpiler = new Bun.Transpiler({
      loader: 'tsx',
      target: 'browser',
      jsx: {
        factory: 'preact.h',
        fragment: 'preact.Fragment',
        development: false
      }
    });
    console.log('Transpiler methods:', Object.getOwnPropertyNames(transpiler.__proto__));
    
    const result = transpiler.transformSync(jsxCode);
    console.log('Transpiled result:', result);
    
    // Also test without import
    const simpleJSX = `const Component = () => <div>Hello</div>;`;
    const simpleResult = transpiler.transformSync(simpleJSX);
    console.log('Simple JSX result:', simpleResult);
  } else {
    console.log('Bun.Transpiler not available');
  }
} catch (error) {
  console.error('Transpilation error:', error.message);
  console.error('Stack:', error.stack);
}