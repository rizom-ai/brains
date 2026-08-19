import type { IEntityService } from "@brains/entity-service";
import type { Logger } from "@brains/utils/logger";
import type { BrainCharacter } from "./brain-character-schema";
import { BrainCharacterAdapter } from "./brain-character-adapter";
import { SingletonDocumentService } from "./singleton-document-service";

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
  extends SingletonDocumentService<BrainCharacter>
  implements IBrainCharacterService
{
  /**
   * Get the default character for a new brain
   */
  public static getDefaultCharacter(): BrainCharacter {
    return {
      name: "Brain",
      role: "Knowledge assistant",
      purpose:
        "Help organize, understand, and retrieve information from your knowledge base",
      values: ["clarity", "accuracy", "helpfulness"],
    };
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
    const adapter = new BrainCharacterAdapter();
    super(
      entityService,
      logger,
      "brain-character",
      defaultCharacter ?? BrainCharacterService.getDefaultCharacter(),
      "brain character is loaded at bootstrap before any user is in scope",
      {
        parse: (content) => adapter.parseCharacterBody(content),
        create: (body) => adapter.createCharacterContent(body),
      },
    );
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
