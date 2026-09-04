const stage = process.env.SST_STAGE || "dev"

export default {
  url: stage === "production" ? "https://aidev-cli.ai" : `https://${stage}.aidev-cli.ai`,
  console: stage === "production" ? "https://aidev-cli.ai/auth" : `https://${stage}.aidev-cli.ai/auth`,
  email: "help@anoma.ly",
  socialCard: "https://social-cards.sst.dev",
  github: "https://github.com/anomalyco/aidev-cli",
  discord: "https://aidev-cli.ai/discord",
  headerLinks: [
    { name: "app.header.home", url: "/" },
    { name: "app.header.docs", url: "/docs/" },
  ],
}
