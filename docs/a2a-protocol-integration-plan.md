# A2A Protocol Integration Plan for Personal Brain

## Executive Summary

This document outlines a comprehensive plan for integrating the A2A (Agent-to-Agent) protocol into the Personal Brain architecture. The A2A protocol will enable Personal Brain instances to communicate and collaborate with other agents, creating a network of interconnected knowledge systems. This integration is designed for future implementation and will be added to the roadmap after core functionality is stable.

## Overview of A2A Protocol

The Agent-to-Agent (A2A) protocol is a standardized communication framework that enables autonomous agents to:

- Discover and authenticate with other agents
- Exchange messages and data in a structured format
- Negotiate capabilities and permissions
- Collaborate on tasks and share knowledge
- Maintain secure, encrypted communication channels

### Agent Cards

A core component of the A2A protocol is the Agent Card - a JSON document that describes an agent's identity, capabilities, and how to interact with it. Agent cards are typically served at `/.well-known/agent.json` and follow a standardized format:

```json
{
  "name": "Personal Brain Agent",
  "description": "A knowledge management agent that can store, search, and reason about personal information",
  "url": "https://brain.example.com/a2a/v1",
  "version": "1.0.0",
  "capabilities": {
    "streaming": false
  },
  "skills": [
    {
      "id": "knowledge-search",
      "name": "Knowledge Search",
      "description": "Search through stored knowledge using natural language queries",
      "tags": ["search", "knowledge", "query", "nlp"],
      "examples": [
        "Find all notes about machine learning",
        "What did I learn about TypeScript last week?"
      ]
    }
  ]
}
```

## Current Architecture Analysis

### Existing Communication Infrastructure

The Personal Brain already has several communication patterns that can be leveraged:

1. **MCP Server**: Provides tool-based communication with external clients
2. **Message Bus**: Internal pub/sub system for loose coupling between components
3. **Plugin System**: Extensible architecture for adding new capabilities
4. **Entity Framework**: Standardized data model for knowledge representation

### Key Integration Points

1. **Plugin Architecture**: A2A can be implemented as a feature plugin
2. **Message Bus**: Can be extended to route inter-agent messages
3. **MCP Tools**: A2A operations can be exposed as MCP tools
4. **Entity Model**: Shared entities can be synchronized between agents
5. **WebServer Plugin**: Required to serve agent cards at well-known URLs

## Proposed Architecture

### High-Level Design

```
┌─────────────────────────────────────────────────────────┐
│                  Personal Brain Instance A               │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │              A2A Plugin                          │   │
│  │                                                  │   │
│  │  ┌─────────────────┐  ┌────────────────────┐   │   │
│  │  │ Agent Registry   │  │ Protocol Handler   │   │   │
│  │  │ • Discovery      │  │ • Message routing  │   │   │
│  │  │ • Agent cards    │  │ • JSON-RPC        │   │   │
│  │  │ • Capabilities   │  │ • Validation       │   │   │
│  │  └────────┬─────────┘  └──────────┬─────────┘   │   │
│  │           │                        │             │   │
│  │  ┌────────▼────────────────────────▼─────────┐   │   │
│  │  │          A2A Message Broker               │   │   │
│  │  │  • Local/Remote message routing           │   │   │
│  │  │  • Skill-based agent selection            │   │   │
│  │  │  • Protocol translation                   │   │   │
│  │  └────────────────────┬──────────────────────┘   │   │
│  └───────────────────────┼──────────────────────────┘   │
│                          │                              │
│  ┌───────────────────────▼──────────────────────────┐   │
│  │              WebServer Plugin                     │   │
│  │         (Serves /.well-known/agent.json)          │   │
│  └───────────────────────┬──────────────────────────┘   │
│                          │                              │
│  ┌───────────────────────▼──────────────────────────┐   │
│  │              Core Message Bus                     │   │
│  │         (Extended for A2A routing)                │   │
│  └───────────────────────┬──────────────────────────┘   │
│                          │                              │
│                 ┌────────▼────────┐                     │
│                 │  Shell Core     │                     │
│                 │  • Entities     │                     │
│                 │  • Plugins      │                     │
│                 │  • Services     │                     │
│                 └─────────────────┘                     │
└──────────────────────────┬──────────────────────────────┘
                          │
                    A2A Protocol
                          │
┌──────────────────────────▼──────────────────────────────┐
│                  Personal Brain Instance B               │
│                      (Similar structure)                 │
└─────────────────────────────────────────────────────────┘
```

### Component Design

#### 1. A2A Plugin

The A2A functionality will be implemented as a feature plugin with the following components:

```typescript
interface A2APlugin extends Plugin {
  id: "a2a-protocol";
  version: "1.0.0";

  // Configuration
  config: {
    agentName: string; // Human-readable agent name
    agentDescription: string; // Agent description
    publicUrl: string; // Public URL for agent card
    authMethod?: "none" | "apikey" | "oauth";
    apiKey?: string; // For authentication
    discoveryMethod: "mdns" | "dht" | "registry" | "manual";
    trustedAgents: string[]; // Whitelist of agent URLs
  };

  // Core services
  services: {
    agentRegistry: AgentRegistry;
    protocolHandler: ProtocolHandler;
    messageBroker: A2AMessageBroker;
    agentCardManager: AgentCardManager;
  };
}
```

#### 2. Agent Card Manager

Manages the local agent card and discovered agent cards:

```typescript
interface A2AAgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  capabilities?: {
    streaming?: boolean;
  };
  skills: A2ASkill[];
}

interface A2ASkill {
  id: string;
  name: string;
  description: string;
  tags: string[];
  examples?: string[];
}

class AgentCardManager {
  // Generate agent card from current plugins and tools
  async generateAgentCard(): Promise<A2AAgentCard> {
    const skills = await this.generateSkillsFromTools();

    return {
      name: this.config.agentName,
      description: this.config.agentDescription,
      url: this.config.publicUrl + "/a2a/v1",
      version: this.plugin.version,
      capabilities: {
        streaming: false, // Could be true if we implement SSE
      },
      skills,
    };
  }

  // Convert MCP tools to A2A skills
  private async generateSkillsFromTools(): Promise<A2ASkill[]> {
    const tools = await this.shell.getAvailableTools();
    return tools.map((tool) => ({
      id: tool.name,
      name: this.humanizeToolName(tool.name),
      description: tool.description,
      tags: this.extractTags(tool),
      examples: tool.examples || [],
    }));
  }
}
```

#### 3. Agent Registry

Manages discovery and tracking of other agents:

```typescript
interface AgentInfo {
  agentCard: A2AAgentCard;
  endpoint: string;
  lastSeen: Date;
  trustLevel: "unknown" | "verified" | "trusted";
}

interface AgentRegistry {
  // Discovery via agent cards
  async discoverAgent(baseUrl: string): Promise<AgentInfo> {
    const response = await fetch(`${baseUrl}/.well-known/agent.json`);
    const agentCard = await response.json();

    return this.storeAgentInfo({
      agentCard,
      endpoint: agentCard.url,
      lastSeen: new Date(),
      trustLevel: "unknown"
    });
  }

  // Find agents by skill
  async findAgentsWithSkill(skillTags: string[]): Promise<AgentInfo[]> {
    const agents = await this.getAllAgents();
    return agents.filter(agent =>
      agent.agentCard.skills.some(skill =>
        skillTags.some(tag => skill.tags.includes(tag))
      )
    );
  }

  // Status tracking
  getAgentStatus(agentUrl: string): Promise<AgentStatus>;
  subscribeToAgentUpdates(agentUrl: string): AsyncIterator<AgentUpdate>;
}
```

#### 4. Protocol Handler

Handles A2A protocol specifics (JSON-RPC):

```typescript
interface ProtocolHandler {
  // Task execution following A2A spec
  async executeTask(agentUrl: string, task: A2ATask): Promise<A2ATaskResult> {
    const request = {
      jsonrpc: "2.0",
      method: "agent.tasks.create",
      params: {
        task: {
          description: task.description,
          input: task.input,
          skillId: task.skillId
        }
      },
      id: generateId()
    };

    const response = await fetch(agentUrl, {
      method: "POST",
      headers: this.getAuthHeaders(),
      body: JSON.stringify(request)
    });

    return this.processTaskResponse(response);
  }

  // Handle incoming A2A requests
  async handleIncomingRequest(request: A2ARequest): Promise<A2AResponse> {
    switch (request.method) {
      case "agent.tasks.create":
        return this.handleTaskCreate(request.params);
      case "agent.tasks.get":
        return this.handleTaskGet(request.params);
      default:
        throw new Error(`Unknown method: ${request.method}`);
    }
  }
}
```

#### 5. Message Types

A2A messages following the protocol specification:

```typescript
// A2A JSON-RPC Request
interface A2ARequest {
  jsonrpc: "2.0";
  method: string;
  params: any;
  id: string | number;
}

// A2A Task
interface A2ATask {
  description: string;
  input?: any;
  skillId?: string;
}

// A2A Task Result
interface A2ATaskResult {
  taskId: string;
  status: "pending" | "running" | "completed" | "failed";
  output?: any;
  error?: {
    code: number;
    message: string;
  };
}
```

### Integration with Existing Systems

#### 1. WebServer Plugin Requirement

The A2A plugin requires the webserver plugin to serve agent cards:

```typescript
// In A2A plugin registration
async register(context: PluginContext): Promise<PluginCapabilities> {
  // Check for webserver plugin
  const webServer = context.getPlugin('webserver');
  if (!webServer) {
    throw new Error('A2A plugin requires webserver plugin for agent card serving');
  }

  // Register agent card endpoint
  webServer.registerRoute({
    method: 'GET',
    path: '/.well-known/agent.json',
    handler: async () => {
      const agentCard = await this.agentCardManager.generateAgentCard();
      return { json: agentCard };
    }
  });

  // Register A2A endpoint
  webServer.registerRoute({
    method: 'POST',
    path: '/a2a/v1',
    handler: async (request) => {
      return await this.protocolHandler.handleIncomingRequest(request.body);
    }
  });
}
```

#### 2. Message Bus Extension

The existing MessageBus will be extended to handle A2A routing:

```typescript
// Extended message bus for A2A
class ExtendedMessageBus extends MessageBus {
  private a2aBroker?: A2AMessageBroker;

  async publish(message: Message): Promise<MessageResponse | null> {
    // Check if this should be routed to an external agent
    if (message.type.startsWith("a2a:") && message.targetAgent) {
      return this.a2aBroker.routeToAgent(message);
    }

    // Otherwise use normal routing
    return super.publish(message);
  }
}
```

#### 3. MCP Tool Integration

A2A operations will be exposed as MCP tools:

```typescript
const a2aTools: PluginTool[] = [
  {
    name: "a2a:discover_agent",
    description: "Discover an agent by URL and retrieve its agent card",
    inputSchema: {
      url: z.string().url(),
    },
    handler: async (input) => {
      const agentInfo = await agentRegistry.discoverAgent(input.url);
      return agentInfo.agentCard;
    },
  },
  {
    name: "a2a:find_agents_by_skill",
    description: "Find agents that have specific skills",
    inputSchema: {
      tags: z.array(z.string()),
      matchAll: z.boolean().optional(),
    },
    handler: async (input) => {
      return await agentRegistry.findAgentsWithSkill(input.tags);
    },
  },
  {
    name: "a2a:execute_remote_task",
    description: "Execute a task on a remote agent",
    inputSchema: {
      agentUrl: z.string().url(),
      task: z.object({
        description: z.string(),
        skillId: z.string().optional(),
        input: z.any().optional(),
      }),
    },
    handler: async (input) => {
      return await protocolHandler.executeTask(input.agentUrl, input.task);
    },
  },
];
```

#### 4. Entity Storage for Agent Cards

Store discovered agent cards as entities:

```typescript
// Register agent-card entity type
const agentCardSchema = baseEntitySchema.extend({
  entityType: z.literal("agent-card"),
  agentUrl: z.string().url(),
  agentCard: z.object({
    name: z.string(),
    description: z.string(),
    url: z.string(),
    version: z.string(),
    capabilities: z
      .object({
        streaming: z.boolean().optional(),
      })
      .optional(),
    skills: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        tags: z.array(z.string()),
        examples: z.array(z.string()).optional(),
      }),
    ),
  }),
  trustLevel: z.enum(["unknown", "verified", "trusted"]),
  lastSeen: z.string().datetime(),
});

// Adapter for markdown storage
class AgentCardAdapter implements EntityAdapter<AgentCard> {
  toMarkdown(entity: AgentCard): string {
    return `---
agentUrl: ${entity.agentUrl}
name: ${entity.agentCard.name}
trustLevel: ${entity.trustLevel}
lastSeen: ${entity.lastSeen}
skills: ${entity.agentCard.skills.map((s) => s.id).join(", ")}
---

# ${entity.agentCard.name}

${entity.agentCard.description}

## Skills

${entity.agentCard.skills
  .map(
    (skill) => `
### ${skill.name}
- **ID**: ${skill.id}
- **Tags**: ${skill.tags.join(", ")}
- **Description**: ${skill.description}
${skill.examples ? `- **Examples**:\n${skill.examples.map((e) => `  - ${e}`).join("\n")}` : ""}
`,
  )
  .join("\n")}

## Connection Details
- **Endpoint**: ${entity.agentCard.url}
- **Version**: ${entity.agentCard.version}
- **Last Seen**: ${entity.lastSeen}
- **Trust Level**: ${entity.trustLevel}
`;
  }
}
```

## Implementation Phases

### Phase 1: Foundation (2-3 months)

1. **Core Protocol Implementation**
   - A2A JSON-RPC message handling
   - Agent card generation and serving
   - Basic protocol handler
   - WebServer plugin integration

2. **Plugin Scaffold**
   - Create a2a-protocol package
   - Basic plugin structure
   - Configuration management
   - Dependency on webserver plugin

3. **Local Testing Infrastructure**
   - Mock agent network
   - Protocol testing framework
   - Agent card validation

### Phase 2: Agent Discovery (1-2 months)

1. **Agent Card Management**
   - Dynamic skill generation from MCP tools
   - Agent card caching
   - Version management
   - Capability updates

2. **Discovery Mechanisms**
   - Manual agent discovery via URL
   - Agent card fetching and validation
   - Trust level assignment
   - Agent status monitoring

### Phase 3: Core Features (2-3 months)

1. **Task Execution**
   - Remote task creation
   - Task status tracking
   - Result retrieval
   - Error handling

2. **Skill-Based Routing**
   - Analyze tasks to extract required skills
   - Find agents with matching capabilities
   - Intelligent agent selection
   - Fallback mechanisms

3. **Entity Storage**
   - Store agent cards as entities
   - Search and filter agents
   - Track interaction history
   - Trust management

### Phase 4: Advanced Features (2-3 months)

1. **Authentication**
   - API key support
   - OAuth integration
   - Mutual authentication
   - Token management

2. **Streaming Support**
   - Server-Sent Events (SSE)
   - Real-time task updates
   - Progress notifications
   - Event subscriptions

3. **Performance Optimization**
   - Connection pooling
   - Agent card caching
   - Request batching
   - Circuit breakers

### Phase 5: Ecosystem Integration (Ongoing)

1. **Registry Integration**
   - Connect to A2A registries
   - Publish agent cards
   - Discover other agents
   - Reputation systems

2. **Advanced Discovery**
   - mDNS for local discovery
   - DHT for distributed discovery
   - Semantic skill matching
   - Multi-hop queries

## Security Considerations

### Authentication and Authorization

1. **API Key Authentication**
   - Secure key storage
   - Key rotation
   - Rate limiting
   - Access logging

2. **OAuth Support**
   - OAuth 2.0 flow
   - Token management
   - Refresh handling
   - Scope management

### Data Protection

1. **HTTPS Only**
   - Enforce TLS 1.3+
   - Certificate validation
   - HSTS headers
   - Secure cookies

2. **Input Validation**
   - JSON-RPC validation
   - Task input sanitization
   - Size limits
   - Type checking

## Testing Strategy

### Unit Testing

1. **Agent Card Generation**
   - Dynamic skill creation
   - Version management
   - Capability updates
   - JSON validation

2. **Protocol Handling**
   - JSON-RPC parsing
   - Method routing
   - Error responses
   - Authentication

### Integration Testing

1. **Agent Discovery**
   - Card fetching
   - Trust assignment
   - Error scenarios
   - Timeout handling

2. **Task Execution**
   - Remote execution
   - Status tracking
   - Result retrieval
   - Failure recovery

### End-to-End Testing

1. **Multi-Agent Scenarios**
   - Agent discovery
   - Task delegation
   - Result aggregation
   - Error propagation

2. **Performance Testing**
   - Concurrent requests
   - Large payloads
   - Network latency
   - Resource usage

## Success Metrics

### Technical Metrics

1. **Performance**
   - Agent discovery < 1 second
   - Task creation < 200ms
   - Agent card generation < 50ms
   - Memory usage < 50MB

2. **Reliability**
   - 99.9% uptime for agent card serving
   - Graceful error handling
   - Automatic recovery
   - Circuit breaker effectiveness

### Adoption Metrics

1. **Usage**
   - Number of discovered agents
   - Tasks executed per day
   - Success rate
   - Agent interactions

2. **Ecosystem**
   - Compatible agents discovered
   - Skills utilized
   - Error rates
   - User feedback

## Future Enhancements

### Advanced Agent Cards

1. **Dynamic Capabilities**
   - Real-time skill updates
   - Load-based availability
   - Performance metrics
   - Cost information

2. **Rich Metadata**
   - Supported languages
   - Geographic location
   - Specialized domains
   - Certification info

### Protocol Extensions

1. **Batch Operations**
   - Multiple task execution
   - Bulk queries
   - Transaction support
   - Atomicity guarantees

2. **Event Streaming**
   - WebSocket support
   - Real-time collaboration
   - State synchronization
   - Distributed events

## Conclusion

The A2A protocol integration represents a significant evolution of the Personal Brain architecture, transforming it from an isolated knowledge management system into a node in a larger network of intelligent agents. By following the official A2A specification and leveraging agent cards for discovery and capability advertisement, Personal Brain instances can seamlessly interact with the broader A2A ecosystem.

The integration builds on existing infrastructure (plugins, message bus, entity storage) while adding new capabilities through the A2A plugin and required webserver plugin. The phased approach ensures stable implementation while gradually expanding functionality.

This integration enables exciting use cases:

- Distributed knowledge queries across multiple brains
- Specialized agent collaboration
- Task delegation to expert agents
- Federated learning and knowledge sharing
- Building personal agent networks

The A2A protocol support should be implemented after core Personal Brain functionality is stable and the webserver plugin is available, positioning it for the second major version of the system.
