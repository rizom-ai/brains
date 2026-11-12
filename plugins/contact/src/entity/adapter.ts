import {
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
  parseTypedFrontmatter,
} from "@brains/sdk/internal/entity-runtime";
import { z } from "@brains/utils/zod";
import {
  contactFrontmatterSchema,
  contactSubmissionSchema,
  type ContactFrontmatter,
  type ContactRequest,
} from "./schema";

const frontmatterRecordSchema = z.record(z.string(), z.unknown());

/**
 * How a contact request's document is written and read: who wrote in and
 * the request's state in its header, the message as its body. What the
 * contact target and the declared type write and read with; errors never
 * carry submitted content.
 */
export const contactRequestAdapter: {
  createContent(frontmatter: ContactFrontmatter, message: string): string;
  parseContent(content: string): {
    frontmatter: ContactFrontmatter;
    message: string;
  };
  fromMarkdown(markdown: string): Partial<ContactRequest>;
} = Object.freeze({
  createContent(frontmatter: ContactFrontmatter, message: string): string {
    try {
      return generateMarkdownWithFrontmatter(
        contactSubmissionSchema.shape.message.parse(message),
        contactFrontmatterSchema.parse(frontmatter),
      );
    } catch {
      // Persistence errors may be logged by callers. Never include submitted content.
      throw new Error("Invalid contact request");
    }
  },

  parseContent(content: string): {
    frontmatter: ContactFrontmatter;
    message: string;
  } {
    try {
      return {
        frontmatter: parseTypedFrontmatter(
          "contact-request",
          content,
          contactFrontmatterSchema,
        ),
        message: contactSubmissionSchema.shape.message.parse(
          parseMarkdownWithFrontmatter(
            content,
            frontmatterRecordSchema,
          ).content.trim(),
        ),
      };
    } catch {
      // YAML errors can echo source lines containing personal information.
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
        status: frontmatter.status,
        notification: frontmatter.notification,
      },
    };
  },
});
