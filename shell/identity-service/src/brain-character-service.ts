import type { IEntityService } from "@brains/entity-service";
import { SingletonEntityService } from "@brains/entity-service";
import type { Logger } from "@brains/utils";
import type { BrainCharacter } from "./brain-character-schema";
import { BrainCharacterAdapter } from "./brain-character-adapter";

/**
 * Interface for consuming the brain's character data
 * Use this in consumers instead of the concrete class
 */
export interface IBrainCharacterService {
  getCharacter(): BrainCharacter;
}

/**
 * Brain Character Service
 * Caches and provides the brain's character (role, purpose, values)
 */
export class BrainCharacterService
  extends SingletonEntityService<BrainCharacter>
  implements IBrainCharacterService
{
  private static instance: BrainCharacterService | null = null;
  private adapter = new BrainCharacterAdapter();

  /**
   * Get the default character for a new brain
   */
  public static getDefaultCharacter(): BrainCharacter {
    return {
      name: "Personal Brain",
      role: "Personal knowledge assistant",
      purpose:
        "Help organize, understand, and retrieve information from your personal knowledge base",
      values: ["clarity", "accuracy", "helpfulness"],
    };
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(
    entityService: IEntityService,
    logger: Logger,
    defaultCharacter?: BrainCharacter,
  ): BrainCharacterService {
    BrainCharacterService.instance ??= new BrainCharacterService(
      entityService,
      logger,
      defaultCharacter,
    );
    return BrainCharacterService.instance;
  }

  /**
   * Reset the singleton instance (for testing)
   */
  public static resetInstance(): void {
    BrainCharacterService.instance = null;
  }

  /**
   * Create a fresh instance without affecting singleton
   */
  public static createFresh(
    entityService: IEntityService,
    logger: Logger,
    defaultCharacter?: BrainCharacter,
  ): BrainCharacterService {
    return new BrainCharacterService(entityService, logger, defaultCharacter);
  }

  /**
   * Private constructor to enforce factory methods
   */
  private constructor(
    entityService: IEntityService,
    logger: Logger,
    defaultCharacter?: BrainCharacter,
  ) {
    super(
      entityService,
      logger,
      "brain-character",
      defaultCharacter ?? BrainCharacterService.getDefaultCharacter(),
    );
  }

  protected parseBody(content: string): BrainCharacter {
    return this.adapter.parseCharacterBody(content);
  }

  protected createContent(body: BrainCharacter): string {
    return this.adapter.createCharacterContent(body);
  }

  /**
   * Get the character data (from cache or default)
   */
  public getCharacter(): BrainCharacter {
    return this.get();
  }

  /**
   * Get the raw character content (markdown)
   */
  public getCharacterContent(): string {
    return this.getContent();
  }
}
