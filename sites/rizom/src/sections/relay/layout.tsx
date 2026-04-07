import type { JSX } from "preact";
import { ProductCard } from "../../components/ProductCard";

export const RelayLayout = (): JSX.Element => (
  <ProductCard
    variant="relay"
    label="Relay"
    badge="Coming Soon"
    headline="Shared intelligence that outlasts any individual"
    description="When your brain joins a team, Relay connects them. It maps who knows what, tracks expertise as it evolves, and ensures that when someone leaves, their knowledge stays. The team's collective intelligence grows with every contribution."
    tags={["Knowledge Maps", "Predictive Intel", "Meeting Memory"]}
    canvasId="relayCanvas"
  />
);
