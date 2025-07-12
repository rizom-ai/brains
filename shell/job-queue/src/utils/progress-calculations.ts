/**
 * Shared progress calculation utilities
 * Used by CLI and Matrix interfaces for consistent progress reporting
 */

/**
 * Calculates ETA and processing rate for operations
 */
export interface ProgressCalculation {
  rate: number; // items per second
  eta: string; // formatted time remaining
  etaSeconds: number; // raw seconds remaining
}

/**
 * Calculate ETA and rate for a progress operation
 */
export function calculateETA(
  current: number,
  total: number,
  startTime: Date,
): ProgressCalculation | null {
  const elapsed = Date.now() - startTime.getTime();
  
  // Need at least 1 second of elapsed time for meaningful calculation
  if (elapsed < 1000 || current === 0) {
    return null;
  }

  const rate = current / (elapsed / 1000); // items per second
  
  // Avoid division by zero and ensure we have a positive rate
  if (rate <= 0) {
    return null;
  }

  const remaining = total - current;
  const etaSeconds = remaining / rate;

  // Format ETA string
  let eta: string;
  if (etaSeconds < 60) {
    eta = `${Math.round(etaSeconds)}s`;
  } else if (etaSeconds < 3600) {
    const minutes = Math.round(etaSeconds / 60);
    eta = `${minutes}m`;
  } else {
    const hours = Math.floor(etaSeconds / 3600);
    const minutes = Math.round((etaSeconds % 3600) / 60);
    eta = minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  return {
    rate,
    eta,
    etaSeconds,
  };
}

/**
 * Calculate progress percentage with protection against division by zero
 */
export function calculateProgressPercentage(current: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, (current / total) * 100));
}

/**
 * Format rate for display
 */
export function formatRate(rate: number): string {
  if (rate < 1) {
    return `${(rate * 60).toFixed(1)}/min`;
  } else if (rate < 10) {
    return `${rate.toFixed(1)}/s`;
  } else {
    return `${Math.round(rate)}/s`;
  }
}

/**
 * Format duration in a human-readable way
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  } else if (seconds < 3600) {
    const minutes = Math.round(seconds / 60);
    return `${minutes}m`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const remainingMinutes = Math.round((seconds % 3600) / 60);
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
}