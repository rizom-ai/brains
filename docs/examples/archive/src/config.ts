/**
 * Centralized configuration for the personal-brain application
 * Loads values from environment variables with sensible defaults
 */

import { getEnv, getEnvAsBool, getEnvAsFloat, getEnvAsInt } from '@utils/configUtils';

// Log configuration
export const logConfig = {
  // Log levels
  consoleLevel: getEnv('LOG_CONSOLE_LEVEL', getEnv('BRAIN_ENV') === 'production' ? 'error' : 'error'), // Limiting console output to errors only
  fileLevel: getEnv('LOG_FILE_LEVEL', 'debug'),

  // Log file paths
  errorLogPath: getEnv('ERROR_LOG_PATH', 'logs/error.log'),
  combinedLogPath: getEnv('COMBINED_LOG_PATH', 'logs/combined.log'),
  debugLogPath: getEnv('DEBUG_LOG_PATH', 'logs/debug.log'),
  
  // Test mode configuration - used for silencing logs during tests
  isTestMode: getEnvAsBool('TEST_MODE', process.env.NODE_ENV === 'test'),
};

// AI Model configuration
export const aiConfig = {
  // OpenAI configuration
  openAI: {
    apiKey: getEnv('OPENAI_API_KEY'),
    embeddingModel: getEnv('OPENAI_EMBEDDING_MODEL', 'text-embedding-3-small'),
    embeddingDimension: getEnvAsInt('OPENAI_EMBEDDING_DIMENSION', 1536),
    batchSize: getEnvAsInt('OPENAI_BATCH_SIZE', 10),
    chunkSize: getEnvAsInt('OPENAI_CHUNK_SIZE', 512),
    chunkOverlap: getEnvAsInt('OPENAI_CHUNK_OVERLAP', 100),

    // Fallback embedding parameters
    fallbackSeed: 0.1,
    fallbackMultiplier: 10000,
    fallbackScaleFactor: 0.8,
    fallbackOffset: 0.4,
  },

  // Anthropic configuration
  anthropic: {
    apiKey: getEnv('ANTHROPIC_API_KEY'),
    defaultModel: getEnv('ANTHROPIC_MODEL', 'claude-3-7-sonnet-20250219'),
    defaultMaxTokens: getEnvAsInt('ANTHROPIC_MAX_TOKENS', 1000),
    temperature: getEnvAsFloat('ANTHROPIC_TEMPERATURE', 0.0),
  },
};

// Text processing configuration
export const textConfig = {
  // Chunking parameters
  defaultChunkSize: getEnvAsInt('DEFAULT_CHUNK_SIZE', 512),
  defaultChunkOverlap: getEnvAsInt('DEFAULT_CHUNK_OVERLAP', 100),
  defaultChunkThreshold: getEnvAsInt('DEFAULT_CHUNK_THRESHOLD', 1000),

  // Truncation thresholds
  tagContentMaxLength: getEnvAsInt('TAG_CONTENT_MAX_LENGTH', 10000),

  // Tag extraction
  defaultMaxTags: getEnvAsInt('DEFAULT_MAX_TAGS', 7),
  defaultMaxKeywords: getEnvAsInt('DEFAULT_MAX_KEYWORDS', 10),

  // Reading time calculation
  defaultWordsPerMinute: getEnvAsInt('DEFAULT_WORDS_PER_MINUTE', 200),
};

// External API configuration
export const apiConfig = {
  // Wikipedia API configuration
  wikipedia: {
    baseUrl: getEnv('WIKIPEDIA_API_URL', 'https://en.wikipedia.org/w/api.php'),
    userAgent: getEnv('WIKIPEDIA_USER_AGENT', 'PersonalBrain/1.0 (personal use)'),
  },

  // News API configuration
  newsApi: {
    apiKey: getEnv('NEWS_API_KEY'),
    baseUrl: getEnv('NEWS_API_URL', 'https://newsapi.org/v2'),
    maxAgeHours: getEnvAsInt('NEWS_API_MAX_AGE_HOURS', 168), // 24 * 7 = 168 hours (1 week)
  },
};

// Application paths
export const pathConfig = {
  profilesPath: getEnv('PROFILES_PATH', './src/models/profiles'),
  importPath: getEnv('IMPORT_PATH', './articles'),
};

// Database configuration
export const dbConfig = {
  dbPath: getEnv('DB_PATH', './brain.db'),
};

// Server configuration
export const serverConfig = {
  mcpHttpPort: getEnvAsInt('MCP_PORT', 8080),
};

// Conversation memory configuration
export const conversationConfig = {
  // Default room ID for CLI conversations
  defaultCliRoomId: getEnv('DEFAULT_CLI_ROOM_ID', 'cli-default-room'),
};

// Semantic relevance thresholds for query processing
export const relevanceConfig = {
  // When profile relevance exceeds this threshold, consider it a profile-related query
  profileQueryThreshold: 0.6,

  // Minimum relevance to include profile information in context
  profileInclusionThreshold: 0.4,

  // Threshold to include profile information in response
  profileResponseThreshold: 0.5,

  // Coverage threshold to determine if external sources are needed
  externalSourcesThreshold: 0.6,

  // Threshold for high profile relevance in system prompt
  highProfileRelevanceThreshold: 0.7,

  // Threshold for medium profile relevance in system prompt
  mediumProfileRelevanceThreshold: 0.4,

  // Threshold for detailed profile information in the prompt
  detailedProfileThreshold: 0.5,

  // Fallback values when we can't calculate semantic relevance
  fallback: {
    // High relevance fallback for profile queries
    highRelevance: 0.9,

    // Low relevance fallback for non-profile queries
    lowRelevance: 0.2,

    // Similarity adjustment factor
    similarityScaleFactor: 0.5,
  },
};

// Website configuration
export const websiteConfig = {
  // Basic site info
  title: getEnv('WEBSITE_TITLE', 'Personal Brain'),
  description: getEnv('WEBSITE_DESCRIPTION', 'My personal website'),
  author: getEnv('WEBSITE_AUTHOR', ''),
  baseUrl: getEnv('WEBSITE_BASE_URL', 'http://localhost:4321'),

  // Project structure
  astroProjectPath: getEnv('WEBSITE_PROJECT_PATH', './src/website'),

  // Deployment settings
  deployment: {
    type: getEnv('WEBSITE_DEPLOYMENT_TYPE', 'local-dev'),
    
    // Port settings
    previewPort: getEnvAsInt('WEBSITE_PREVIEW_PORT', 4321),
    livePort: getEnvAsInt('WEBSITE_LIVE_PORT', 4322),

    // Domain settings
    domain: getEnv('WEBSITE_DOMAIN', 'example.com'),
  },
};

// Export the combined configuration
export default {
  log: logConfig,
  ai: aiConfig,
  text: textConfig,
  api: apiConfig,
  path: pathConfig,
  db: dbConfig,
  server: serverConfig,
  conversation: conversationConfig,
  relevance: relevanceConfig,
  website: websiteConfig,
};
