import type { ContentFormatter } from "@brains/types";
import {
  landingPageReferenceSchema,
  type LandingPageReferenceData,
} from "../content-schemas";
import { DefaultYamlFormatter } from "@brains/formatters";

/**
 * Formatter for landing page reference data
 * The actual page data is assembled by the adapter from referenced entities
 */
export class LandingPageFormatter
  extends DefaultYamlFormatter
  implements ContentFormatter<LandingPageReferenceData>
{
  public override format(data: LandingPageReferenceData): string {
    return `# Landing Page Configuration

\`\`\`yaml
${this.yaml.dump(data, { indent: 2, lineWidth: -1 })}
\`\`\`

This page references the following sections:
- Hero: ${data.heroId}
- Features: ${data.featuresId}
- CTA: ${data.ctaId}`;
  }

  public override parse(content: string): LandingPageReferenceData {
    const data = super.parse(content);
    return landingPageReferenceSchema.parse(data);
  }
}
