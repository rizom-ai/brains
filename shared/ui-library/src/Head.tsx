import { createContext } from "preact";
import { useContext } from "preact/hooks";
import type { ComponentChildren, VNode } from "preact";

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
 */
export interface HeadProviderProps {
  headCollector: HeadCollectorInterface;
  children: ComponentChildren;
}

export function HeadProvider({
  headCollector,
  children,
}: HeadProviderProps): VNode {
  return (
    <HeadContext.Provider value={headCollector}>
      {children}
    </HeadContext.Provider>
  );
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
