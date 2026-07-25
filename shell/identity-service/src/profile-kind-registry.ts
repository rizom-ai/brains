import type { FrontmatterSchema } from "@brains/entity-service";
import { z } from "@brains/utils/zod";

export const profileCategorySchema: z.ZodEnum<{
  person: "person";
  team: "team";
  organization: "organization";
}> = z.enum(["person", "team", "organization"]);

export type ProfileCategory = z.infer<typeof profileCategorySchema>;

export interface ProfileKindLabels {
  singular: string;
  plural: string;
}

export interface ProfileKindDefinition {
  kind: string;
  category: ProfileCategory;
  fields: FrontmatterSchema;
  labels: ProfileKindLabels;
}

export interface ResolvedProfileKind {
  kind: string;
  category: ProfileCategory;
  labels: ProfileKindLabels;
}

export type ResolvedProfileSelection = ResolvedProfileKind | null;

interface RegisteredProfileKind {
  pluginId: string;
  definition: ProfileKindDefinition;
}

const profileKindMetadataSchema = z.object({
  kind: z.string().trim().min(1),
  category: profileCategorySchema,
  labels: z.object({
    singular: z.string().trim().min(1),
    plural: z.string().trim().min(1),
  }),
});

function validateFields(fields: unknown): asserts fields is FrontmatterSchema {
  if (
    typeof fields !== "object" ||
    fields === null ||
    !("shape" in fields) ||
    !("safeParse" in fields) ||
    typeof fields.safeParse !== "function"
  ) {
    throw new Error("Profile kind fields must be a Zod object schema");
  }
}

export interface IProfileKindRegistry {
  register(pluginId: string, definition: ProfileKindDefinition): void;
  unregisterPlugin(pluginId: string): void;
  finalize(): ResolvedProfileSelection;
  getResolved(): ResolvedProfileSelection;
  getSelectedDefinition(): ProfileKindDefinition | undefined;
  isFinalized(): boolean;
}

/** App-scoped catalog and immutable selected profile-kind resolution. */
export class ProfileKindRegistry implements IProfileKindRegistry {
  private readonly selectedKind: string | undefined;
  private readonly registrations = new Map<string, RegisteredProfileKind[]>();
  private finalized = false;
  private resolved: ResolvedProfileSelection = null;
  private selectedDefinition: ProfileKindDefinition | undefined;

  public constructor(selectedKind?: string) {
    const normalized = selectedKind?.trim();
    this.selectedKind = normalized === "" ? undefined : normalized;
  }

  public register(pluginId: string, definition: ProfileKindDefinition): void {
    if (this.finalized) {
      throw new Error("Profile kind registration is closed");
    }

    const metadata = profileKindMetadataSchema.parse(definition);
    validateFields(definition.fields);
    const normalizedDefinition: ProfileKindDefinition = Object.freeze({
      ...definition,
      kind: metadata.kind,
      category: metadata.category,
      labels: Object.freeze({ ...metadata.labels }),
    });
    const registrations = this.registrations.get(metadata.kind) ?? [];
    registrations.push({ pluginId, definition: normalizedDefinition });
    this.registrations.set(metadata.kind, registrations);
  }

  public unregisterPlugin(pluginId: string): void {
    for (const [kind, registrations] of this.registrations) {
      const remaining = registrations.filter(
        (registration) => registration.pluginId !== pluginId,
      );
      if (remaining.length === 0) {
        this.registrations.delete(kind);
      } else {
        this.registrations.set(kind, remaining);
      }
    }
  }

  public finalize(): ResolvedProfileSelection {
    if (this.finalized) return this.resolved;

    const collisions = [...this.registrations.entries()]
      .filter(([, registrations]) => registrations.length > 1)
      .sort(([left], [right]) => left.localeCompare(right));
    const collision = collisions[0];
    if (collision) {
      const [kind, registrations] = collision;
      const pluginIds = registrations
        .map((registration) => registration.pluginId)
        .sort()
        .join(", ");
      throw new Error(
        `Profile kind "${kind}" is registered by multiple plugins: ${pluginIds}`,
      );
    }

    if (!this.selectedKind) {
      this.finalized = true;
      this.resolved = null;
      return null;
    }

    const selected = this.registrations.get(this.selectedKind)?.[0];
    if (!selected) {
      throw new Error(
        `Selected profile kind "${this.selectedKind}" is not registered`,
      );
    }

    this.selectedDefinition = selected.definition;
    this.resolved = Object.freeze({
      kind: selected.definition.kind,
      category: selected.definition.category,
      labels: Object.freeze({ ...selected.definition.labels }),
    });
    this.finalized = true;
    return this.resolved;
  }

  public getResolved(): ResolvedProfileSelection {
    this.assertFinalized();
    return this.resolved;
  }

  public getSelectedDefinition(): ProfileKindDefinition | undefined {
    this.assertFinalized();
    return this.selectedDefinition;
  }

  public isFinalized(): boolean {
    return this.finalized;
  }

  private assertFinalized(): void {
    if (!this.finalized) {
      throw new Error("Profile kind selection has not been finalized");
    }
  }
}
