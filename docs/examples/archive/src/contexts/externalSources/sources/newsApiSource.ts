/**
 * NewsAPI external knowledge source implementation
 * Requires a NewsAPI key from https://newsapi.org/
 */
import { EmbeddingService } from '@/resources/ai/embedding';
import { getEnv } from '@/utils/configUtils';
import logger from '@/utils/logger';
import { isDefined } from '@/utils/safeAccessUtils';

import type { ExternalSearchOptions, ExternalSourceInterface, ExternalSourceResult } from './externalSourceInterface';

// Define interfaces for NewsAPI response structures
interface NewsApiSourceInfo {
  id: string | null;
  name: string | null;
}

interface NewsApiArticle {
  source: NewsApiSourceInfo;
  author: string | null;
  title: string;
  description: string | null;
  url: string;
  urlToImage: string | null;
  publishedAt: string;
  content: string | null;
}

interface NewsApiResponse {
  status: string;
  totalResults?: number;
  articles?: NewsApiArticle[];
  message?: string;
  code?: string;
}

/**
 * Configuration options for NewsApiSource
 */
export interface NewsApiSourceOptions {
  /**
   * Required NewsAPI key
   */
  apiKey?: string;
  
  /**
   * Optional embedding service for semantic search
   */
  embeddingService?: EmbeddingService;
  
  /**
   * Maximum age of news articles in hours (defaults to 1 week)
   */
  maxAgeHours?: number;
}

export class NewsApiSource implements ExternalSourceInterface {
  readonly name = 'NewsAPI';
  private embeddingService: EmbeddingService | null = null;
  private apiKey: string;
  private baseUrl = 'https://newsapi.org/v2';
  private maxAgeHours = 24 * 7; // 1 week by default
  
  // Singleton instance
  private static instance: NewsApiSource | null = null;
  
  /**
   * Get singleton instance of NewsApiSource
   * 
   * Following Component Interface Standardization pattern:
   * - No parameters to getInstance (configuration handled elsewhere)
   * - Auto-initialization of dependencies using standard patterns
   * 
   * @returns The shared NewsApiSource instance
   */
  public static getInstance(): NewsApiSource {
    if (!NewsApiSource.instance) {
      // For the singleton, we read from the environment variable
      const apiKey = getEnv('NEWSAPI_KEY', '');
      NewsApiSource.instance = NewsApiSource.createFresh({ apiKey });
    }
    return NewsApiSource.instance;
  }
  
  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    NewsApiSource.instance = null;
  }
  
  /**
   * Create a fresh instance (primarily for testing)
   * Following Component Interface Standardization pattern with:
   * - Options object parameter for configuration
   * - Auto-initialization of required dependencies
   * 
   * @param options Configuration options
   * @returns A new NewsApiSource instance
   */
  public static createFresh(options: NewsApiSourceOptions = {}): NewsApiSource {
    // Auto-initialize embedding service if not provided
    const embeddingService = options.embeddingService || EmbeddingService.getInstance();
    
    // Resolve API key
    const apiKey = options.apiKey || '';
    
    // Get maxAgeHours with default
    const maxAgeHours = options.maxAgeHours || 24 * 7; // 1 week default
    
    return new NewsApiSource({
      apiKey,
      embeddingService,
      maxAgeHours,
    });
  }

  /**
   * Create a new NewsApiSource with explicit dependencies
   * Private constructor to ensure use of factory methods.
   * 
   * @param options Configuration options
   */
  private constructor(options: NewsApiSourceOptions) {
    this.apiKey = options.apiKey || '';
    this.maxAgeHours = options.maxAgeHours || 24 * 7;
    this.embeddingService = options.embeddingService || null;
    
    if (!this.apiKey) {
      logger.warn('NewsAPI source initialized without API key');
    }
    
    if (this.embeddingService) {
      logger.debug('NewsAPI source initialized with embedding service');
    } else {
      logger.debug('NewsAPI source initialized without embedding service');
    }
  }

  /**
   * Search NewsAPI for recent information related to the query
   */
  async search(options: ExternalSearchOptions): Promise<ExternalSourceResult[]> {
    const { query, limit = 5, addEmbeddings = false } = options;
    
    if (!this.apiKey) {
      logger.warn('NewsAPI key not provided, cannot search');
      return [];
    }
    
    logger.info(`Searching NewsAPI for: "${query}"`);
    
    try {
      // First search for everything with the query
      const searchResults = await this.searchEverything(query, limit);
      
      if (searchResults.length === 0) {
        logger.info('No NewsAPI results found');
        return [];
      }
      
      // Process the results
      const results: ExternalSourceResult[] = [];
      
      for (const article of searchResults) {
        const content = this.formatArticleContent(article);
        
        const sourceName = isDefined(article.source) && article.source.name 
          ? article.source.name
          : 'Unknown Source';
        
        const result: ExternalSourceResult = {
          content,
          title: article.title,
          url: article.url,
          source: `${this.name} - ${sourceName}`,
          sourceType: 'news',
          timestamp: new Date(article.publishedAt),
          confidence: this.calculateConfidence(article, query),
        };
        
        // Add embeddings if requested and available
        if (addEmbeddings && this.embeddingService) {
          try {
            result.embedding = await this.embeddingService.getEmbedding(content);
          } catch (embeddingError) {
            logger.error('Error generating embedding for news content:', embeddingError);
          }
        }
        
        results.push(result);
      }
      
      return results;
    } catch (error) {
      logger.error('Error searching NewsAPI:', error);
      return [];
    }
  }

  /**
   * Check if the NewsAPI is accessible
   */
  async checkAvailability(): Promise<boolean> {
    if (!this.apiKey) {
      return false;
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/top-headlines?country=us&pageSize=1`, {
        headers: {
          'X-Api-Key': this.apiKey,
        },
      });
      
      const data = await response.json() as NewsApiResponse;
      return data.status === 'ok';
    } catch (error) {
      logger.error('NewsAPI not available:', error);
      return false;
    }
  }

  /**
   * Get metadata about the NewsAPI source
   */
  async getSourceMetadata(): Promise<Record<string, unknown>> {
    return {
      name: this.name,
      type: 'news',
      limitPerDay: 100, // Free plan has 100 requests per day
      requiresAuthentication: true,
      hasApiKey: !!this.apiKey,
      supportsEmbeddings: !!this.embeddingService,
      maxArticleAge: `${this.maxAgeHours} hours`,
      lastUpdated: new Date(),
    };
  }

  /**
   * Search NewsAPI "everything" endpoint
   */
  private async searchEverything(query: string, limit: number): Promise<NewsApiArticle[]> {
    // Calculate date range (last maxAgeHours)
    const fromDate = new Date();
    fromDate.setHours(fromDate.getHours() - this.maxAgeHours);
    
    const searchUrl = new URL(`${this.baseUrl}/everything`);
    searchUrl.searchParams.append('q', query);
    searchUrl.searchParams.append('from', fromDate.toISOString().split('T')[0]);
    searchUrl.searchParams.append('sortBy', 'relevancy');
    searchUrl.searchParams.append('language', 'en');
    searchUrl.searchParams.append('pageSize', limit.toString());
    
    try {
      const response = await fetch(searchUrl, {
        headers: {
          'X-Api-Key': this.apiKey,
        },
      });
      
      if (!response.ok) {
        throw new Error(`NewsAPI responded with ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json() as NewsApiResponse;
      
      if (data.status !== 'ok') {
        logger.error(`NewsAPI error: ${data.message || 'Unknown error'}`);
        return [];
      }
      
      return data.articles || [];
    } catch (error) {
      logger.error('Error in NewsAPI search:', error);
      return [];
    }
  }

  /**
   * Format article content for consistent presentation
   */
  private formatArticleContent(article: NewsApiArticle): string {
    const publishedDate = new Date(article.publishedAt).toLocaleString();
    
    let content = '';
    
    // Access optional fields with null-coalescing
    if (article.author) {
      content += `By ${article.author}\n`;
    }
    
    content += `Published: ${publishedDate}\n\n`;
    
    if (article.description) {
      content += `${article.description}\n\n`;
    }
    
    if (article.content) {
      // Remove the truncation indicator from NewsAPI
      const cleanContent = article.content.replace(/\[\+\d+ chars\]$/, '');
      content += cleanContent;
    }
    
    return content.trim();
  }

  /**
   * Calculate a confidence score for the result
   */
  private calculateConfidence(article: NewsApiArticle, query: string): number {
    // Base confidence starts at 0.5
    let confidence = 0.5;
    
    // Content length factor (longer content might be more informative)
    const contentLength = (article.content || '').length;
    confidence += Math.min(contentLength / 2000, 0.2); // Max 0.2 bonus for length
    
    // Recency factor (more recent articles get higher confidence)
    const publishDate = new Date(article.publishedAt);
    const ageInHours = (Date.now() - publishDate.getTime()) / (1000 * 60 * 60);
    const recencyScore = Math.max(0, 0.2 * (1 - (ageInHours / this.maxAgeHours)));
    confidence += recencyScore; // Max 0.2 bonus for very recent articles
    
    // Title relevance (simple heuristic - title contains query words)
    const queryWords = query.toLowerCase().split(/\s+/);
    const titleWords = article.title.toLowerCase();
    let titleMatchCount = 0;
    
    queryWords.forEach(word => {
      if (word.length > 3 && titleWords.includes(word)) {
        titleMatchCount++;
      }
    });
    
    const queryWordCount = Math.max(1, queryWords.length); // Prevent division by zero
    confidence += Math.min(titleMatchCount / queryWordCount, 0.1); // Max 0.1 bonus
    
    // Cap at 0.95 to leave room for semantic ranking
    return Math.min(confidence, 0.95);
  }
}