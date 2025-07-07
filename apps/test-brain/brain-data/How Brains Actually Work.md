Rizom brains are deployable knowledge processing units that combine intelligent data ingestion, schema-driven transformation, and multi-protocol distribution. Each brain operates as an autonomous system that can be deployed wherever you need knowledge processing capabilities.

Understanding the architecture: brains function as self-contained knowledge engines with three core operational modes.

## Capture: Multi-source data ingestion and git-based storage

- **Git-native architecture** - All knowledge is stored as markdown files in git repositories, providing version control, branching, and distributed synchronization
- **Markdown-first content model** - Structured content using markdown with frontmatter metadata, ensuring human-readable and version-controllable knowledge storage
- **API-first ingestion** - RESTful endpoints for document upload, webhook integrations, and real-time data streaming that automatically convert to markdown format
- **Browser extension integration** - Client-side JavaScript that captures web content and converts it to structured markdown with preserved metadata
- **Platform connectors** - Native integrations with Slack, Discord, and other communication platforms that store conversations and insights as markdown documents

## Remix: Schema-driven transformation and AI-powered generation

- **Zod schema validation** - TypeScript-first schema definitions that ensure consistent data structures and type safety across all transformations
- **LLM integration** - Connects to various language models (OpenAI, Anthropic, local models) with schema-constrained outputs for reliable content generation
- **Structured data transformation** - Zod schemas define input and output formats, enabling predictable transformation of markdown content into various structured formats
- **Type-safe operations** - All data processing operations are validated against schemas, preventing runtime errors and ensuring data integrity
- **Schema-guided generation** - Language models generate content that conforms to predefined schemas, guaranteeing consistent output structure regardless of input variability

## Share: Multi-protocol distribution and agent communication

- **Embedded HTTP server** - Each brain exposes its own web interface and API endpoints for direct access and integration
- **MCP (Model Context Protocol) server** - Provides standardized interface for AI tools and assistants to query and interact with brain knowledge
- **ACP (Agent Communication Protocol)** - Enables brain-to-brain communication and coordination for distributed knowledge sharing and collaborative processing
- **Git-based synchronization** - Brains can sync knowledge through git operations, enabling distributed deployment with eventual consistency
- **Granular permissions** - Role-based access control with fine-grained permissions for different knowledge domains and output types

**Technical architecture: Each brain operates as a git-backed knowledge repository with its own processing engine and multi-protocol interfaces. The git foundation enables distributed deployment, version control, and brain-to-brain synchronization through standard git operations, while ACP facilitates intelligent agent coordination.**
