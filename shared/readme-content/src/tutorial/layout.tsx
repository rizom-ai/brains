import type { JSX } from "preact";
import type { TutorialContent } from "./schema";
import { markdownToHtml } from "@brains/utils";

export const TutorialLayout = ({ markdown }: TutorialContent): JSX.Element => {
  const htmlContent = markdownToHtml(markdown);

  return (
    <section className="tutorial-section flex-grow">
      <div className="container mx-auto px-4 max-w-4xl py-12">
        <div
          className="prose prose-lg max-w-none prose-headings:text-theme prose-p:text-theme-muted prose-a:text-brand prose-strong:text-theme prose-code:text-brand prose-pre:bg-surface-secondary prose-li:text-theme-muted"
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
      </div>
    </section>
  );
};
