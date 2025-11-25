import { createContext, h, type JSX } from "preact";
import { useContext } from "preact/hooks";
import type { ComponentChildren } from "preact";

/**
 * Props for head metadata
 */
export interface HeadProps {
  title: string;
  description?: string;
  ogImage?: string;
  ogType?: string;
  twitterCard?: string;
  canonicalUrl?: string;
}

/**
 * Context for sharing the HeadCollector during SSR
 * The collector is provided by the site builder during rendering
 */
export const HeadContext = createContext<HeadCollectorInterface | null>(null);

/**
 * Interface for HeadCollector to avoid circular dependency
 * Site builder implements this interface
 */
export interface HeadCollectorInterface {
  setHeadProps(props: HeadProps): void;
}

/**
 * Provider component that makes HeadCollector available to child components
 *
 * NOTE: Uses h() instead of JSX to ensure consistent Preact VNode creation.
 * This is necessary because Bun's JSX runtime resolution can incorrectly
 * resolve to React's runtime in monorepo contexts where react is a dependency
 * of other packages (e.g., ink in the CLI).
 */
export interface HeadProviderProps {
  headCollector: HeadCollectorInterface;
  children: ComponentChildren;
}

export function HeadProvider({
  headCollector,
  children,
}: HeadProviderProps): JSX.Element {
  return h(HeadContext.Provider, { value: headCollector }, children);
}

/**
 * Hook to access the HeadCollector from context
 */
export function useHead(): HeadCollectorInterface | null {
  return useContext(HeadContext);
}

/**
 * Head component that sets metadata during SSR
 * This component doesn't render anything, it just collects metadata
 */
export function Head(props: HeadProps): null {
  const headCollector = useHead();

  if (headCollector) {
    headCollector.setHeadProps(props);
  }

  return null;
}
