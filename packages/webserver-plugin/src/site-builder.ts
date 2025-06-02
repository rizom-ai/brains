import type { Logger } from "@brains/utils";
import { join } from "path";
import { existsSync } from "fs";

export interface SiteBuilderOptions {
  logger: Logger;
  astroSiteDir: string;
}

/**
 * Handles Astro site building
 */
export class SiteBuilder {
  private logger: Logger;
  private astroSiteDir: string;

  constructor(options: SiteBuilderOptions) {
    this.logger = options.logger;
    this.astroSiteDir = options.astroSiteDir;
  }

  /**
   * Install dependencies if needed
   */
  async ensureDependencies(): Promise<void> {
    const nodeModulesPath = join(this.astroSiteDir, "node_modules");

    if (!existsSync(nodeModulesPath)) {
      this.logger.info("Installing Astro site dependencies");

      const proc = Bun.spawn(["bun", "install"], {
        cwd: this.astroSiteDir,
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
  async build(): Promise<void> {
    this.logger.info("Building Astro site");

    // Ensure Astro site exists
    if (!existsSync(this.astroSiteDir)) {
      throw new Error(`Astro site not found at ${this.astroSiteDir}`);
    }

    // Check if package.json exists
    const packageJsonPath = join(this.astroSiteDir, "package.json");
    if (!existsSync(packageJsonPath)) {
      throw new Error(`No package.json found in ${this.astroSiteDir}`);
    }

    // Ensure dependencies are installed
    await this.ensureDependencies();

    // Run Astro build
    const proc = Bun.spawn(["bun", "run", "build"], {
      cwd: this.astroSiteDir,
      env: { ...process.env },
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`Astro build failed: ${stderr}`);
    }

    this.logger.info("Astro site built successfully");
  }

  /**
   * Check if a build exists
   */
  hasBuild(): boolean {
    const distDir = this.getDistDir();
    return existsSync(distDir);
  }

  /**
   * Get the dist directory path
   */
  getDistDir(): string {
    return join(this.astroSiteDir, "dist");
  }

  /**
   * Clean the build directory
   */
  async clean(): Promise<void> {
    const distDir = this.getDistDir();

    if (existsSync(distDir)) {
      this.logger.info("Cleaning build directory");

      const proc = Bun.spawn(["rm", "-rf", distDir], {
        cwd: this.astroSiteDir,
      });

      await proc.exited;
      this.logger.info("Build directory cleaned");
    }
  }

  /**
   * Run Astro dev server (for development)
   */
  async dev(): Promise<void> {
    this.logger.info("Starting Astro dev server");

    const proc = Bun.spawn(["bun", "run", "dev"], {
      cwd: this.astroSiteDir,
      env: { ...process.env },
      stdout: "inherit",
      stderr: "inherit",
    });

    // This will run until interrupted
    await proc.exited;
  }
}
