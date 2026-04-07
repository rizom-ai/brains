import type { JSX } from "preact";
import { ProductCard } from "../../components/ProductCard";

export const RoverLayout = (): JSX.Element => (
  <ProductCard
    variant="rover"
    label="Rover"
    badge="Early Access"
    headline="Your knowledge, your agent, your voice"
    description="Rover is where it starts. Capture what you know — notes, links, ideas — and your brain turns it into blog posts, presentations, and social content. In your voice. It's the agent that represents you to the world."
    tags={["AI Blogging", "Social Publishing", "Slide Decks", "Chat Interface"]}
    canvasId="roverCanvas"
  />
);
