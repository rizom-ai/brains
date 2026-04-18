import type { JSX } from "preact";
import type { AnswerContent } from "./schema";
import { Badge, Divider, Section } from "@brains/site-rizom";
import { ScalesDiagram } from "./scales-diagram";

export const AnswerLayout = ({
  badge,
  headline,
  subhead,
  scalesHeadline,
  scalesSubhead,
}: AnswerContent): JSX.Element => {
  return (
    <Section id="answer" className="reveal text-center py-section">
      <Badge className="mb-7">{badge}</Badge>
      <h2 className="font-display text-display-md max-w-[900px] mx-auto mb-6 mt-7">
        {headline}
      </h2>
      <p className="text-body-md md:text-body-xl text-theme-muted max-w-[640px] mx-auto">
        {subhead}
      </p>
      <Divider className="my-10 md:my-12" />
      <div className="font-display text-display-sm mb-3.5 md:mb-4">
        {scalesHeadline}
      </div>
      <ScalesDiagram />
      <p className="text-body-xs md:text-body-md text-theme-light max-w-[600px] mx-auto">
        {scalesSubhead}
      </p>
    </Section>
  );
};
