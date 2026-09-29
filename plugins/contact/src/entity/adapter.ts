import { BaseEntityAdapter } from "@brains/plugins";
import {
  contactFrontmatterSchema,
  contactRequestSchema,
  contactSubmissionSchema,
  type ContactFrontmatter,
  type ContactMetadata,
  type ContactRequest,
} from "./schema";

export class ContactRequestAdapter extends BaseEntityAdapter<
  ContactRequest,
  ContactMetadata,
  ContactFrontmatter
> {
  constructor() {
    super({
      entityType: "contact-request",
      purpose:
        "A restricted contact request for the owner. Never public knowledge or model input.",
      schema: contactRequestSchema,
      frontmatterSchema: contactFrontmatterSchema,
    });
  }

  createContent(frontmatter: ContactFrontmatter, message: string): string {
    try {
      return this.buildMarkdown(
        contactSubmissionSchema.shape.message.parse(message),
        contactFrontmatterSchema.parse(frontmatter),
      );
    } catch {
      // Persistence errors may be logged by callers. Never include submitted content.
      throw new Error("Invalid contact request");
    }
  }

  parseContent(content: string): {
    frontmatter: ContactFrontmatter;
    message: string;
  } {
    try {
      return {
        frontmatter: this.parseFrontMatter(content, contactFrontmatterSchema),
        message: contactSubmissionSchema.shape.message.parse(
          this.extractBody(content).trim(),
        ),
      };
    } catch {
      // YAML errors can echo source lines containing personal information.
      throw new Error("Invalid contact request");
    }
  }

  fromMarkdown(markdown: string): Partial<ContactRequest> {
    const { frontmatter } = this.parseContent(markdown);
    return {
      entityType: "contact-request",
      visibility: "restricted",
      content: markdown,
      metadata: {
        title: "Contact request",
        receivedAt: frontmatter.receivedAt,
        expiresAt: frontmatter.expiresAt,
        status: frontmatter.status,
        notification: frontmatter.notification,
      },
    };
  }
}

export const contactRequestAdapter: ContactRequestAdapter =
  new ContactRequestAdapter();
