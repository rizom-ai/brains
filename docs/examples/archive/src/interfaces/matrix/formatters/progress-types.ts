/**
 * Types for progress tracking in Matrix interface
 */

/**
 * Progress step for multi-step operations
 * Used to track and display progress through longer operations
 */
export interface ProgressStep {
  /**
   * Display label for the step
   */
  label: string;
  
  /**
   * Whether the step is complete
   */
  complete: boolean;
  
  /**
   * Whether the step is in progress (current step)
   */
  active: boolean;
  
  /**
   * Index of this step (0-based)
   */
  index: number;
}

/**
 * Progress tracking data
 */
export interface ProgressData {
  /**
   * Array of steps in the operation
   */
  steps: ProgressStep[];
  
  /**
   * Index of the current step (0-based)
   */
  currentStep: number;
  
  /**
   * Total number of steps
   */
  totalSteps: number;
  
  /**
   * Optional error message if progress encountered an error
   */
  error?: string;
  
  /**
   * Overall progress status ('in_progress', 'complete', 'error')
   */
  status: 'in_progress' | 'complete' | 'error';
  
  /**
   * Operation title (e.g., "Generating Landing Page")
   */
  title: string;
}