import type { IEmbeddingService } from "../../src/embedding-types";
import {
  MOCK_EMBEDDING_DIMENSIONS,
  createMockEmbeddingService,
} from "../../src/test/mock-embedding-service";

export const MOCK_DIMENSIONS: number = MOCK_EMBEDDING_DIMENSIONS;

export const mockEmbeddingService: IEmbeddingService =
  createMockEmbeddingService();
