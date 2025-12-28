import type { JSX } from "preact";

interface AnimatedWaveDividerProps {
  mirror?: boolean;
}

/**
 * Animated wave divider with flowing line animation
 * Used as a decorative section separator (different from ui-library's WavyDivider which is a filled footer transition)
 */
export const AnimatedWaveDivider = ({
  mirror = false,
}: AnimatedWaveDividerProps): JSX.Element => {
  return (
    <div
      className={`w-full h-16 md:h-20 bg-theme overflow-hidden relative ${mirror ? "rotate-180" : ""}`}
    >
      <style>{`
        @keyframes wave-flow-1 {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes wave-flow-2 {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .wave-1 {
          animation: wave-flow-1 20s linear infinite;
        }
        .wave-2 {
          animation: wave-flow-2 15s linear infinite;
        }
      `}</style>
      <svg
        preserveAspectRatio="none"
        width="200%"
        height="100%"
        viewBox="0 0 2478 135"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="block absolute inset-0"
      >
        <path
          d="M2477.03 82.242C2465.39 45.1146 2464.4 22 2450.89 22C2421.16 22 2396.88 133.994 2363.33 134C2332.66 134.006 2317.81 40.2337 2285.74 40.27C2256.59 40.3003 2238.29 117.868 2204.46 117.91C2173.44 117.946 2153.16 52.8235 2119.18 52.884C2088.16 52.9385 2074.46 107.246 2042.31 107.252C2012.97 107.258 1996.58 61.9978 1964.04 62.016C1934.23 62.0342 1919.48 100.052 1885.77 100.076C1855.25 100.094 1838.44 68.9316 1804.69 68.974C1774.3 69.0103 1761.14 94.3292 1726.42 94.42C1694.35 94.4987 1676.45 72.9708 1642.55 73.11C1612.23 73.2311 1601.87 90.5686 1568.48 90.726C1537.57 90.8714 1522.82 76.1379 1487.4 76.156C1455.45 76.1742 1444.63 88.1766 1409.13 88.334C1375.89 88.4794 1363.16 78.0636 1326.66 78.112C1295.25 78.1544 1287.58 85.8875 1252.59 86.16C1219.7 86.4144 1210.63 79.7107 1174.31 79.6381C1139.75 79.5654 1132.43 85.609 1096.04 85.7301C1059.73 85.8512 1052.8 79.8803 1016.37 80.0741C982.157 80.2557 969.546 85.615 935.295 85.0761C925.759 84.9247 917.468 84.3615 910.657 83.6833C901.705 82.787 891.43 82.2481 880.804 82.2481H4.49255e-05"
          className="stroke-accent wave-1"
          strokeWidth="2"
          strokeMiterlimit="10"
          fill="none"
        />
      </svg>
      <svg
        preserveAspectRatio="none"
        width="200%"
        height="100%"
        viewBox="0 0 2478 135"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="block absolute inset-0"
      >
        <path
          opacity="0.15"
          d="M2477.03 61.242C2465.39 24.1146 2464.4 1 2450.89 1C2421.16 1 2396.88 112.994 2363.33 113C2332.66 113.006 2317.81 19.2337 2285.74 19.27C2256.59 19.3003 2238.29 96.8676 2204.46 96.91C2173.44 96.9464 2153.16 31.8235 2119.18 31.884C2085.21 31.9446 2067.68 88 2040.39 88C2017.16 88 1997.74 40.9978 1965.2 41.016C1935.39 41.0342 1919.48 79.0518 1885.77 79.076C1855.25 79.0942 1838.44 47.9316 1804.69 47.974C1774.3 48.0103 1761.14 73.3292 1726.42 73.42C1694.35 73.4987 1676.45 51.9708 1642.55 52.11C1612.23 52.2311 1601.87 69.5686 1568.48 69.726C1537.57 69.8714 1522.82 55.1379 1487.4 55.156C1455.45 55.1742 1444.63 67.1766 1409.13 67.334C1375.89 67.4794 1363.16 57.0636 1326.66 57.112C1295.25 57.1544 1287.58 64.8875 1252.59 65.16C1219.7 65.4144 1210.63 58.7107 1174.31 58.6381C1139.75 58.5654 1132.43 64.609 1096.04 64.7301C1059.73 64.8512 1052.8 58.8803 1016.37 59.0741C982.157 59.2557 969.546 64.615 935.295 64.0761C925.759 63.9247 917.468 63.3615 910.657 62.6833C901.705 61.787 891.43 61.2481 880.804 61.2481H0"
          className="stroke-accent wave-2"
          strokeWidth="2"
          strokeMiterlimit="10"
          fill="none"
        />
      </svg>
    </div>
  );
};
