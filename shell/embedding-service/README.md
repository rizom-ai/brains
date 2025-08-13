# @brains/embedding-service

Text embedding generation and vector similarity service for Personal Brain applications.

## Overview

This service generates vector embeddings for text content using Transformer.js models and provides vector similarity search capabilities. It enables semantic search and content discovery through embedding-based retrieval.

## Features

- Local embedding generation with Transformer.js
- Multiple embedding models support
- Batch embedding generation
- Vector similarity search
- Embedding caching and storage
- Dimension reduction options
- GPU acceleration support

## Installation

```bash
bun add @brains/embedding-service
```

## Usage

```typescript
import { EmbeddingService } from "@brains/embedding-service";

const embeddingService = EmbeddingService.getInstance({
  model: "Xenova/all-MiniLM-L6-v2",
  dimensions: 384,
  device: "cpu", // or "gpu"
});

// Generate embedding for text
const embedding = await embeddingService.embed(
  "Understanding vector embeddings in machine learning"
);

// Generate batch embeddings
const embeddings = await embeddingService.embedBatch([
  "First document",
  "Second document",
  "Third document",
]);

// Find similar texts
const similar = await embeddingService.findSimilar(
  "query text",
  candidateTexts,
  { topK: 5 }
);
```

## Configuration

```typescript
interface EmbeddingConfig {
  model?: string;           // Model name (default: Xenova/all-MiniLM-L6-v2)
  dimensions?: number;      // Embedding dimensions (384)
  device?: "cpu" | "gpu";   // Computation device
  cacheDir?: string;        // Model cache directory
  maxLength?: number;       // Max input length
  batchSize?: number;       // Batch processing size
  normalize?: boolean;      // Normalize vectors
}
```

## Supported Models

```typescript
// Small, fast model (384 dimensions)
const service = EmbeddingService.getInstance({
  model: "Xenova/all-MiniLM-L6-v2",
  dimensions: 384,
});

// Larger, more accurate model (768 dimensions)
const service = EmbeddingService.getInstance({
  model: "Xenova/all-mpnet-base-v2",
  dimensions: 768,
});

// Multilingual model
const service = EmbeddingService.getInstance({
  model: "Xenova/paraphrase-multilingual-MiniLM-L12-v2",
  dimensions: 384,
});
```

## Embedding Operations

### Single Text Embedding

```typescript
const text = "The quick brown fox jumps over the lazy dog";
const embedding = await embeddingService.embed(text);
// Returns Float32Array of shape [dimensions]
```

### Batch Embedding

```typescript
const texts = [
  "Document 1 content",
  "Document 2 content",
  "Document 3 content",
];

const embeddings = await embeddingService.embedBatch(texts, {
  batchSize: 32,
  showProgress: true,
});
// Returns array of Float32Arrays
```

### Chunked Text

For long documents:

```typescript
const chunks = await embeddingService.embedChunked(longText, {
  chunkSize: 512,
  overlap: 50,
  aggregation: "mean", // or "max", "first", "last"
});
```

## Similarity Search

### Cosine Similarity

```typescript
const query = "How to use TypeScript?";
const documents = [
  "TypeScript tutorial for beginners",
  "Python data science guide",
  "Advanced TypeScript patterns",
];

const results = await embeddingService.findSimilar(query, documents, {
  topK: 2,
  threshold: 0.7,
});
// Returns:
// [
//   { text: "TypeScript tutorial...", score: 0.92 },
//   { text: "Advanced TypeScript...", score: 0.85 }
// ]
```

### Vector Operations

```typescript
// Compute similarity between vectors
const similarity = embeddingService.cosineSimilarity(vec1, vec2);

// Find nearest neighbors
const neighbors = embeddingService.nearestNeighbors(
  queryVector,
  vectorDatabase,
  { k: 10, metric: "cosine" } // or "euclidean", "dot"
);
```

## Caching

### Embedding Cache

```typescript
// Enable caching
const service = EmbeddingService.getInstance({
  cache: {
    enabled: true,
    maxSize: 10000,    // Max cached embeddings
    ttl: 86400000,     // 24 hours
  },
});

// Cache is automatic
const embedding1 = await service.embed("text"); // Computed
const embedding2 = await service.embed("text"); // From cache

// Clear cache
service.clearCache();
```

### Persistent Storage

```typescript
// Save embeddings to disk
await embeddingService.save(embeddings, "/path/to/embeddings.bin");

// Load embeddings
const loaded = await embeddingService.load("/path/to/embeddings.bin");
```

## Integration with Entity Service

```typescript
// Auto-generate embeddings for entities
entityService.on("entity:created", async (entity) => {
  const embedding = await embeddingService.embed(entity.content);
  await entityService.updateEmbedding(entity.id, embedding);
});

// Semantic search
const queryEmbedding = await embeddingService.embed("search query");
const results = await entityService.vectorSearch(queryEmbedding, {
  limit: 10,
});
```

## Performance Optimization

### GPU Acceleration

```typescript
const service = EmbeddingService.getInstance({
  device: "gpu",
  quantized: true,  // Use quantized models for speed
});
```

### Batch Processing

```typescript
// Process large datasets efficiently
const processLargeDataset = async (texts: string[]) => {
  const batches = chunk(texts, 100);
  
  for (const batch of batches) {
    const embeddings = await embeddingService.embedBatch(batch);
    await saveToDatabase(embeddings);
  }
};
```

### Dimension Reduction

```typescript
// Reduce embedding dimensions for efficiency
const reduced = await embeddingService.reduceDimensions(
  embeddings,
  {
    targetDims: 128,
    method: "pca", // or "umap", "tsne"
  }
);
```

## Model Management

### Download Models

```typescript
// Pre-download models
await embeddingService.downloadModel("Xenova/all-MiniLM-L6-v2");

// List available models
const models = embeddingService.listModels();

// Get model info
const info = embeddingService.getModelInfo("Xenova/all-MiniLM-L6-v2");
// { dimensions: 384, size: "22MB", language: "en" }
```

### Switch Models

```typescript
// Change model at runtime
await embeddingService.switchModel("Xenova/all-mpnet-base-v2");
```

## Testing

```typescript
import { EmbeddingService } from "@brains/embedding-service";
import { createMockEmbedding } from "@brains/embedding-service/test";

const service = EmbeddingService.createFresh({
  model: "test-model",
});

// Mock embeddings for testing
const mockEmbed = createMockEmbedding(384);
jest.spyOn(service, "embed").mockResolvedValue(mockEmbed);

// Test similarity
const similar = await service.findSimilar("query", ["doc1", "doc2"]);
expect(similar).toHaveLength(2);
```

## Utilities

```typescript
// Text preprocessing
const preprocessed = embeddingService.preprocess(text, {
  lowercase: true,
  removeStopwords: true,
  stem: true,
});

// Token counting
const tokens = embeddingService.countTokens(text);

// Text chunking
const chunks = embeddingService.chunkText(text, {
  maxTokens: 512,
  overlap: 50,
});
```

## Exports

- `EmbeddingService` - Main service class
- `cosineSimilarity` - Similarity calculation
- `normalizeVector` - Vector normalization
- `chunkText` - Text chunking utility
- Types and interfaces

## License

MIT