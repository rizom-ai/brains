import type {
  BaseDataSourceContext,
  DataSource,
  DataSourceSchema,
} from "@brains/plugins";
import { fetchAnchorProfileData } from "./helpers";

interface ProfileSchema<T> {
  parse(data: unknown): T;
}

export interface ProfileAboutDataSourceOptions<T extends object> {
  id: string;
  name: string;
  description: string;
  /** The site's profile schema the anchor profile is parsed with. */
  schema: ProfileSchema<T>;
}

/** A site's about page data: the anchor profile, as `{ profile }`. */
export class ProfileAboutDataSource<T extends object> implements DataSource {
  public readonly id: string;
  public readonly name: string;
  public readonly description: string;
  private readonly schema: ProfileSchema<T>;

  constructor(options: ProfileAboutDataSourceOptions<T>) {
    this.id = options.id;
    this.name = options.name;
    this.description = options.description;
    this.schema = options.schema;
  }

  async fetch<R>(
    _query: unknown,
    outputSchema: DataSourceSchema<R>,
    context: BaseDataSourceContext,
  ): Promise<R> {
    const profile = await fetchAnchorProfileData(
      context.entityService,
      this.schema,
    );
    return outputSchema.parse({ profile });
  }
}
