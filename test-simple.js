// Test simple JSX transpilation without imports
const jsx = `const Component = () => <div>Hello</div>;`;

try {
  const transpiler = new Bun.Transpiler({
    loader: 'tsx'
  });
  
  console.log('Original JSX:', jsx);
  const result = transpiler.transformSync(jsx);
  console.log('Transpiled:', result);
} catch (error) {
  console.error('Error:', error);
}