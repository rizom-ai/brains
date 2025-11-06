import { createContext } from "preact";
import { useContext } from "preact/hooks";
import type { HeadCollector, HeadProps } from "./head-collector";
import type { ComponentChildren } from "preact";

/**
 * Context for sharing the HeadCollector during SSR
 */
export const HeadContext = createContext<HeadCollector | null>(null);

/**
 * Provider component that makes HeadCollector available to child components
 */
export interface HeadProviderProps {
  headCollector: HeadCollector;
  children: ComponentChildren;
}

export function HeadProvider({
  headCollector,
  children,
}: HeadProviderProps): JSX.Element {
  return (
    <HeadContext.Provider value={headCollector}>
      {children}
    </HeadContext.Provider>
  );
}

/**
 * Hook to access the HeadCollector from context
 */
export function useHead(): HeadCollector | null {
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
