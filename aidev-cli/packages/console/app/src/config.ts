/**
 * Application-wide constants and configuration
 */
export const config = {
  // Base URL
  baseUrl: "https://aidev_cli.ai",

  // GitHub
  github: {
    repoUrl: "https://github.com/anomalyco/aidev-cli",
    starsFormatted: {
      compact: "195K",
      full: "195,000",
    },
  },

  // Social links
  social: {
    twitter: "https://x.com/aidev-cli",
    discord: "https://discord.gg/aidev-cli",
  },

  // Static stats (used on landing page)
  stats: {
    contributors: "950",
    commits: "13,000",
    monthlyUsers: "16M",
  },
} as const
