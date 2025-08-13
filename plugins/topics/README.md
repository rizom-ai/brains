# @brains/topics

Topic modeling and categorization plugin for Personal Brain applications.

## Overview

This plugin provides automatic topic extraction, categorization, and tagging for Brain entities using NLP and machine learning techniques. It helps organize and discover related content through topic analysis.

## Features

- Automatic topic extraction from content
- Hierarchical topic categorization
- Tag suggestions and auto-tagging
- Topic clustering and relationships
- Trend analysis over time
- Related entity discovery
- Topic visualization

## Installation

```bash
bun add @brains/topics
```

## Usage

```typescript
import { TopicsPlugin } from "@brains/topics";

const plugin = new TopicsPlugin({
  autoExtract: true,
  minConfidence: 0.7,
  maxTopics: 10,
  language: "en",
});

// Register with shell
await shell.registerPlugin(plugin);

// Extract topics from entity
const topics = await plugin.extractTopics(entityId);

// Find related entities
const related = await plugin.findRelated(entityId);
```

## Configuration

```typescript
interface TopicsConfig {
  autoExtract?: boolean; // Auto-extract on entity creation
  minConfidence?: number; // Minimum topic confidence (0-1)
  maxTopics?: number; // Max topics per entity
  language?: string; // Content language
  stopWords?: string[]; // Custom stop words
  algorithms?: {
    tfidf?: boolean; // TF-IDF analysis
    lda?: boolean; // Latent Dirichlet Allocation
    nmf?: boolean; // Non-negative Matrix Factorization
  };
}
```

## Topic Extraction

### Automatic Extraction

Topics are automatically extracted when entities are created/updated:

```typescript
// On entity creation
messageBus.on("entity:created", async (event) => {
  const topics = await plugin.extractTopics(event.entity);
  await plugin.assignTopics(event.entity.id, topics);
});
```

### Manual Extraction

```typescript
// Extract topics from text
const topics = await plugin.extractFromText(
  "Machine learning is transforming software development...",
  { maxTopics: 5 },
);
// Returns: ["machine-learning", "software", "development", "ai", "technology"]

// Extract from entity
const topics = await plugin.extractTopics(entityId);
```

## Topic Management

### Create Topics

```typescript
// Create topic
const topic = await plugin.createTopic({
  name: "machine-learning",
  displayName: "Machine Learning",
  description: "ML and AI related content",
  parent: "technology", // Optional parent topic
});

// Create hierarchy
await plugin.createTopicHierarchy({
  name: "technology",
  children: [
    {
      name: "programming",
      children: ["javascript", "python", "rust"],
    },
    {
      name: "ai",
      children: ["machine-learning", "nlp", "computer-vision"],
    },
  ],
});
```

### Topic Assignment

```typescript
// Assign topics to entity
await plugin.assignTopics(entityId, ["javascript", "react"]);

// Suggest topics
const suggestions = await plugin.suggestTopics(entityId);
// Returns topics with confidence scores

// Auto-tag based on content
await plugin.autoTag(entityId, { threshold: 0.8 });
```

## Topic Analysis

### Clustering

Find topic clusters:

```typescript
const clusters = await plugin.clusterTopics({
  method: "kmeans",
  numClusters: 5,
});

// Get entities in cluster
const entities = await plugin.getClusterEntities(clusterId);
```

### Relationships

Discover topic relationships:

```typescript
// Find related topics
const related = await plugin.getRelatedTopics("javascript");
// Returns: ["typescript", "nodejs", "react", "web-development"]

// Topic co-occurrence
const cooccurrence = await plugin.getCooccurrence("javascript", "react");
// Returns frequency of topics appearing together
```

### Trends

Analyze topic trends over time:

```typescript
// Topic frequency over time
const trend = await plugin.getTopicTrend("ai", {
  from: new Date("2024-01-01"),
  to: new Date("2024-12-31"),
  interval: "month",
});

// Trending topics
const trending = await plugin.getTrendingTopics({
  period: "week",
  limit: 10,
});

// Emerging topics
const emerging = await plugin.getEmergingTopics();
```

## Entity Discovery

Find related entities by topic:

```typescript
// Find similar entities
const similar = await plugin.findSimilar(entityId, {
  limit: 10,
  minSimilarity: 0.7,
});

// Find by topics
const entities = await plugin.findByTopics(
  ["javascript", "react"],
  { operator: "AND" }, // or "OR"
);

// Topic-based recommendations
const recommendations = await plugin.recommend(entityId);
```

## Visualization

Generate topic visualizations:

```typescript
// Topic graph
const graph = await plugin.generateTopicGraph({
  format: "json", // or "dot", "svg"
  layout: "force-directed",
});

// Word cloud
const wordCloud = await plugin.generateWordCloud(entityId, {
  maxWords: 50,
  format: "svg",
});

// Topic hierarchy
const tree = await plugin.getTopicTree();
```

## Commands

Available shell commands:

```typescript
// Extract topics
shell.execute("topics:extract", { entityId });

// Find related
shell.execute("topics:related", { entityId, limit: 10 });

// Show trends
shell.execute("topics:trends", { period: "month" });

// Rebuild topic index
shell.execute("topics:rebuild");
```

## Events

```typescript
plugin.on("topics:extracted", (event) => {
  console.log(`Extracted topics for ${event.entityId}:`, event.topics);
});

plugin.on("topics:assigned", (event) => {
  console.log(`Assigned ${event.topics.length} topics`);
});

plugin.on("cluster:created", (event) => {
  console.log(`Created cluster with ${event.size} entities`);
});
```

## NLP Processing

### Text Preprocessing

```typescript
const plugin = new TopicsPlugin({
  preprocessing: {
    lowercase: true,
    removeNumbers: true,
    removePunctuation: true,
    stemming: true,
    lemmatization: false,
  },
});
```

### Custom Extractors

```typescript
plugin.registerExtractor({
  name: "custom-keywords",
  extract: async (text) => {
    // Custom extraction logic
    return extractedTopics;
  },
});
```

## Performance

- Caches topic extractions
- Batch processes entities
- Incremental index updates
- Async processing for large texts

## Testing

```typescript
import { TopicsPlugin } from "@brains/topics";
import { createTestContent } from "@brains/topics/test";

const plugin = TopicsPlugin.createFresh();

const content = createTestContent({
  topics: ["javascript", "react", "testing"],
});

const extracted = await plugin.extractFromText(content);
expect(extracted).toContain("javascript");
```

## Exports

- `TopicsPlugin` - Main plugin class
- `TopicExtractor` - Topic extraction engine
- `TopicAnalyzer` - Analysis utilities
- `TopicVisualizer` - Visualization generator
- Types and schemas

## License

MIT
