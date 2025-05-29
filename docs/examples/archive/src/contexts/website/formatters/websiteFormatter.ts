/**
 * WebsiteFormatter implementation of the FormatterInterface
 * 
 * Provides formatting capabilities for Website data objects
 * into various formats (text, markdown, JSON).
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */

import type { FormatterInterface, FormattingOptions } from '@/contexts/formatterInterface';

import type { LandingPageData, WebsiteConfig } from '../websiteStorage';

/**
 * Website data object that combines various website-related data types
 */
export interface WebsiteData {
  config?: WebsiteConfig;
  landingPage?: LandingPageData;
  buildStatus?: {
    success: boolean;
    message: string;
    output?: string;
  };
}

/**
 * Formatting options specific to website data
 */
export interface WebsiteFormattingOptions extends FormattingOptions {
  /**
   * Format to output the data in
   */
  format?: 'text' | 'markdown' | 'json';
  
  /**
   * Whether to include detailed technical information
   */
  detailed?: boolean;
  
  /**
   * Components to include in the output
   */
  include?: ('config' | 'landingPage' | 'buildStatus')[];
}

/**
 * Formatter for Website data objects
 */
export class WebsiteFormatter implements FormatterInterface<WebsiteData, string> {
  // Logger removed as it's not being used
  
  /** Singleton instance */
  private static instance: WebsiteFormatter | null = null;
  
  /**
   * Get the singleton instance of WebsiteFormatter
   * @returns Shared instance of WebsiteFormatter
   */
  public static getInstance(): WebsiteFormatter {
    if (!WebsiteFormatter.instance) {
      WebsiteFormatter.instance = new WebsiteFormatter();
    }
    return WebsiteFormatter.instance;
  }
  
  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    WebsiteFormatter.instance = null;
  }
  
  /**
   * Create a fresh instance (primarily for testing)
   * @returns A new WebsiteFormatter instance
   */
  public static createFresh(): WebsiteFormatter {
    return new WebsiteFormatter();
  }
  
  /**
   * Format website data
   * 
   * @param data The website data to format
   * @param options Formatting options
   * @returns Formatted string representation of the data
   */
  format(data: WebsiteData, options: WebsiteFormattingOptions = {}): string {
    if (!data) {
      return 'No website data available.';
    }
    
    const format = options.format || 'markdown';
    
    switch (format) {
    case 'text':
      return this.formatAsText(data, options);
    case 'json':
      return this.formatAsJson(data, options);
    case 'markdown':
    default:
      return this.formatAsMarkdown(data, options);
    }
  }
  
  /**
   * Format data as plain text
   */
  private formatAsText(data: WebsiteData, options: WebsiteFormattingOptions): string {
    const parts: string[] = [];
    const include = options.include || ['config', 'landingPage', 'buildStatus'];
    
    // Format website configuration
    if (data.config && include.includes('config')) {
      parts.push('WEBSITE CONFIGURATION\n' + '='.repeat(22) + '\n');
      parts.push(`Base URL: ${data.config.baseUrl}`);
      parts.push(`Astro Project Path: ${data.config.astroProjectPath}`);
      parts.push(`Deployment Type: ${data.config.deployment.type}`);
      
      if (options.detailed) {
        parts.push(`Preview Port: ${data.config.deployment.previewPort}`);
        parts.push(`Live Port: ${data.config.deployment.livePort}`);
        if (data.config.deployment.domain) {
          parts.push(`Domain: ${data.config.deployment.domain}`);
        }
      }
      
      parts.push('');
    }
    
    // Format landing page data
    if (data.landingPage && include.includes('landingPage')) {
      parts.push('LANDING PAGE\n' + '='.repeat(12) + '\n');
      parts.push(`Title: ${data.landingPage.title}`);
      parts.push(`Tagline: ${data.landingPage.tagline}`);
      
      // Profile fields are not in the LandingPageData schema
      // If we need to handle profile data, we should update the schema first
      
      parts.push('');
    }
    
    // Format build status
    if (data.buildStatus && include.includes('buildStatus')) {
      parts.push('BUILD STATUS\n' + '='.repeat(12) + '\n');
      parts.push(`Status: ${data.buildStatus.success ? 'Success' : 'Failed'}`);
      parts.push(`Message: ${data.buildStatus.message}`);
      
      if (data.buildStatus.output && options.detailed) {
        parts.push(`\nOutput:\n${data.buildStatus.output}`);
      }
    }
    
    return parts.join('\n');
  }
  
  /**
   * Format data as Markdown
   */
  private formatAsMarkdown(data: WebsiteData, options: WebsiteFormattingOptions): string {
    const parts: string[] = [];
    const include = options.include || ['config', 'landingPage', 'buildStatus'];
    
    // Format website configuration
    if (data.config && include.includes('config')) {
      parts.push('## Website Configuration\n');
      parts.push(`- **Base URL:** ${data.config.baseUrl}`);
      parts.push(`- **Astro Project Path:** ${data.config.astroProjectPath}`);
      parts.push(`- **Deployment Type:** ${data.config.deployment.type}`);
      
      if (options.detailed) {
        parts.push(`- **Preview Port:** ${data.config.deployment.previewPort}`);
        parts.push(`- **Live Port:** ${data.config.deployment.livePort}`);
        if (data.config.deployment.domain) {
          parts.push(`- **Domain:** ${data.config.deployment.domain}`);
        }
      }
      
      parts.push('');
    }
    
    // Format landing page data
    if (data.landingPage && include.includes('landingPage')) {
      parts.push('## Landing Page\n');
      parts.push(`- **Title:** ${data.landingPage.title}`);
      parts.push(`- **Tagline:** ${data.landingPage.tagline}`);
      
      // The landingPage schema doesn't have a profile property
      // Just show the base landing page data
      
      parts.push('');
    }
    
    // Format build status
    if (data.buildStatus && include.includes('buildStatus')) {
      parts.push('## Build Status\n');
      parts.push(`- **Status:** ${data.buildStatus.success ? '✅ Success' : '❌ Failed'}`);
      parts.push(`- **Message:** ${data.buildStatus.message}`);
      
      if (data.buildStatus.output && options.detailed) {
        parts.push('\n```');
        parts.push(data.buildStatus.output);
        parts.push('```');
      }
    }
    
    return parts.join('\n');
  }
  
  /**
   * Format data as JSON
   */
  private formatAsJson(data: WebsiteData, options: WebsiteFormattingOptions): string {
    const include = options.include || ['config', 'landingPage', 'buildStatus'];
    
    // Filter the data based on include options
    const filteredData: Partial<WebsiteData> = {};
    
    if (data.config && include.includes('config')) {
      filteredData.config = data.config;
    }
    
    if (data.landingPage && include.includes('landingPage')) {
      filteredData.landingPage = data.landingPage;
    }
    
    if (data.buildStatus && include.includes('buildStatus')) {
      filteredData.buildStatus = data.buildStatus;
    }
    
    return JSON.stringify(filteredData, null, options.detailed ? 2 : 0);
  }
  
  /**
   * Format only the website configuration
   * @param config Website configuration object
   * @param options Formatting options
   * @returns Formatted string representation of the configuration
   */
  formatConfig(config: WebsiteConfig, options: WebsiteFormattingOptions = {}): string {
    return this.format({ config }, options);
  }
  
  /**
   * Format only the landing page data
   * @param landingPage Landing page data object
   * @param options Formatting options
   * @returns Formatted string representation of the landing page data
   */
  formatLandingPage(landingPage: LandingPageData, options: WebsiteFormattingOptions = {}): string {
    return this.format({ landingPage }, { ...options, include: ['landingPage'] });
  }
  
  /**
   * Format only the build status
   * @param buildStatus Build status object
   * @param options Formatting options
   * @returns Formatted string representation of the build status
   */
  formatBuildStatus(buildStatus: WebsiteData['buildStatus'], options: WebsiteFormattingOptions = {}): string {
    return this.format({ buildStatus }, { ...options, include: ['buildStatus'] });
  }
}