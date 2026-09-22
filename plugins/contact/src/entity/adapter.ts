import {
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
  z,
} from "@brains/sdk/entities";
import {
  contactFrontmatterSchema,
  contactSubmissionSchema,
  type ContactFrontmatter,
  type ContactRequest,
} from "./schema";

/** Pure private-content codec; errors must never echo submitted personal data. */
export const contactRequestAdapter = {
  createContent(frontmatter: ContactFrontmatter, message: string): string {
    try {
      return generateMarkdownWithFrontmatter(
        contactSubmissionSchema.shape.message.parse(message),
        contactFrontmatterSchema.parse(frontmatter),
      );
    } catch {
      throw new Error("Invalid contact request");
    }
  },
  parseContent(content: string): {
    frontmatter: ContactFrontmatter;
    message: string;
  } {
    try {
      const parsed = parseMarkdownWithFrontmatter(
        content,
        z.record(z.string(), z.unknown()),
      );
      const { visibility: _visibility, ...frontmatter } = parsed.metadata;
      return {
        frontmatter: contactFrontmatterSchema.parse(frontmatter),
        message: contactSubmissionSchema.shape.message.parse(
          parsed.content.trim(),
        ),
      };
    } catch {
      throw new Error("Invalid contact request");
    }
  },
  fromMarkdown(markdown: string): Partial<ContactRequest> {
    const { frontmatter } = contactRequestAdapter.parseContent(markdown);
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
  },
};
