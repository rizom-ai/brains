import type { JSX } from "preact";
import { ProductCard } from "../../components/ProductCard";

export const RangerLayout = (): JSX.Element => (
  <ProductCard
    variant="ranger"
    label="Ranger"
    badge="Coming Soon"
    headline="The right expert, found by what they actually know"
    description="Ranger reads across every brain in the network. When work comes in, it scores every brain for fit — not by job titles, but by what each brain has been thinking about. It assembles teams from complementary knowledge. The right people, matched by substance."
    tags={[
      "Match Scoring",
      "Team Assembly",
      "Gap Detection",
      "Cross-Brain Search",
    ]}
    canvasId="rangerCanvas"
  />
);
