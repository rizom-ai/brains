import type { Logger } from "@brains/utils";
import { toYaml } from "@brains/utils";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import { writeFile, rm } from "fs/promises";
import { fileURLToPath } from "url";
import { copyDirectory } from "./utils/file-utils";
import type {
  StaticSiteBuilder,
  StaticSiteBuilderOptions,
  StaticSiteBuilderFactory,
} from "./static-site-builder";

/**
 * Astro implementation of StaticSiteBuilder
 */
export class AstroBuilder implements StaticSiteBuilder {
  private logger: Logger;
  private workingDir: string;
  private outputDir: string;
  private templateDir: string;

  constructor(options: StaticSiteBuilderOptions) {
    this.logger = options.logger;
    this.workingDir = options.workingDir;
    this.outputDir = options.outputDir;

    // Resolve template directory
    const templateUrl = import.meta.resolve(
      "@brains/webserver-template/package.json",
    );
    const templatePath = fileURLToPath(templateUrl);
    this.templateDir = join(templatePath, "..");

    this.logger.debug(`Template directory resolved to: ${this.templateDir}`);
  }

  /**
   * Prepare the working directory with Astro template
   */
  async prepare(): Promise<void> {
    this.logger.debug("Preparing Astro working directory");

    // Clean existing working directory if it exists
    if (existsSync(this.workingDir)) {
      this.logger.debug("Cleaning existing working directory");
      await rm(this.workingDir, { recursive: true, force: true });
    }

    // Ensure working directory exists
    mkdirSync(this.workingDir, { recursive: true });

    // Copy template to working directory
    await copyDirectory(this.templateDir, this.workingDir);
    this.logger.debug("Copied Astro template to working directory");
  }

  /**
   * Generate content configuration for Astro
   */
  async generateContentConfig(schemas: Map<string, unknown>): Promise<void> {
    this.logger.debug("Generating Astro content configuration");

    // Generate content collections config
    const configContent = this.generateContentConfigFile(schemas);
    const configPath = join(
      this.workingDir,
      "src",
      "content",
      "config.generated.ts",
    );

    // Ensure directory exists
    const configDir = join(this.workingDir, "src", "content");
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    await writeFile(configPath, configContent);
    this.logger.debug("Generated content configuration");
  }

  /**
   * Write content files for Astro
   */
  async writeContentFile(
    collection: string,
    filename: string,
    content: unknown,
  ): Promise<void> {
    const contentDir = join(this.workingDir, "src", "content", collection);

    // Ensure directory exists
    if (!existsSync(contentDir)) {
      mkdirSync(contentDir, { recursive: true });
    }

    const filePath = join(contentDir, filename);
    const yamlContent = toYaml(content);

    await writeFile(filePath, yamlContent);
    this.logger.debug(`Wrote content file: ${filePath}`);
  }

  /**
   * Install dependencies if needed
   */
  async ensureDependencies(
    onProgress?: (message: string) => void,
  ): Promise<void> {
    const nodeModulesPath = join(this.workingDir, "node_modules");

    if (!existsSync(nodeModulesPath)) {
      this.logger.info("Installing Astro site dependencies");
      onProgress?.("Installing dependencies...");

      const proc = Bun.spawn(["bun", "install"], {
        cwd: this.workingDir,
        env: { ...process.env },
        stdout: "pipe",
        stderr: "pipe",
      });

      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text();
        throw new Error(`Failed to install dependencies: ${stderr}`);
      }

      this.logger.info("Dependencies installed successfully");
    }
  }

  /**
   * Build the Astro site
   */
  async build(onProgress?: (message: string) => void): Promise<void> {
    this.logger.info("Building Astro site");

    // Ensure Astro site exists
    if (!existsSync(this.workingDir)) {
      throw new Error(`Astro site not found at ${this.workingDir}`);
    }

    // Check if package.json exists
    const packageJsonPath = join(this.workingDir, "package.json");
    if (!existsSync(packageJsonPath)) {
      throw new Error(`No package.json found in ${this.workingDir}`);
    }

    // Ensure dependencies are installed
    await this.ensureDependencies(onProgress);

    onProgress?.("Building Astro site...");

    // Run Astro build
    const proc = Bun.spawn(["bun", "run", "build"], {
      cwd: this.workingDir,
      env: { ...process.env },
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`Astro build failed: ${stderr}`);
    }

    // Copy dist to output directory
    const distDir = join(this.workingDir, "dist");
    if (existsSync(this.outputDir)) {
      await rm(this.outputDir, { recursive: true });
    }
    await copyDirectory(distDir, this.outputDir);

    this.logger.info("Astro site built successfully");
  }

  /**
   * Check if a build exists
   */
  hasBuild(): boolean {
    return existsSync(this.outputDir);
  }

  /**
   * Clean the build directory
   */
  async clean(): Promise<void> {
    if (existsSync(this.outputDir)) {
      this.logger.info("Cleaning build directory");
      await rm(this.outputDir, { recursive: true });
    }

    if (existsSync(this.workingDir)) {
      this.logger.info("Cleaning working directory");
      await rm(this.workingDir, { recursive: true });
    }
  }

  /**
   * Generate content config file for Astro
   */
  private generateContentConfigFile(schemas: Map<string, unknown>): string {
    // This is a simplified version - in real implementation,
    // we'd convert Zod schemas to Astro collection schemas
    let config = `// Generated by site-builder
import { defineCollection, z } from 'astro:content';

`;

    // Add collection definitions
    for (const [collection, _schema] of schemas) {
      config += `const ${collection}Collection = defineCollection({
  type: 'data',
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    // TODO: Convert actual schema
  }),
});

`;
    }

    // Export collections
    config += `export const collections = {\n`;
    for (const [collection] of schemas) {
      config += `  '${collection}': ${collection}Collection,\n`;
    }
    config += `};\n`;

    return config;
  }
}

/**
 * Factory function for creating AstroBuilder instances
 */
export const createAstroBuilder: StaticSiteBuilderFactory = (options) => {
  return new AstroBuilder(options);
};
