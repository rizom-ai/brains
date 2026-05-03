export function printHelp(): void {
  console.log(`
AI Evaluation Runner

Usage: bun run eval [options]

Options:
  --test <ids>        Run specific test(s), comma-separated
  --filter <ids>      Alias for --test
  --tags <tags>       Filter tests by tag(s), comma-separated
  --type <type>       Filter by type: "agent" or "plugin"
  --url <url>         Run against a remote brain instance
  --token <token>     Auth token for remote instance
  --compare [name]    Compare with previous run or named baseline
  --baseline <name>   Save results as a named baseline
  --skip-llm-judge    Skip LLM quality scoring (faster)
  --parallel, -p      Run tests in parallel (default: 3 concurrent)
  --max-parallel <n>  Set max concurrent tests (default: 3)
  --verbose, -v       Show verbose output
  --build-db          Build eval database from eval-content (no tests)
  --help, -h          Show this help message

Examples:
  bun run eval                              Run all tests
  bun run eval --compare                    Compare with last run
  bun run eval --compare baseline           Compare with named baseline
  bun run eval --baseline pre-refactor      Save as named baseline
  bun run eval --parallel                   Run tests in parallel (3x faster)
  bun run eval --parallel --max-parallel 5  Run up to 5 tests at once
  bun run eval --test tool-invocation-list  Run single test
  bun run eval --filter my-test             Run single test (alias)
  bun run eval --test list,search           Run multiple tests
  bun run eval --tags core                  Run tests tagged 'core'
  bun run eval --type plugin                Run only plugin tests
  bun run eval --type agent                 Run only agent tests
  bun run eval --skip-llm-judge             Skip LLM judge for speed
  bun run eval --url http://localhost:8080  Run against remote instance
`);
}
