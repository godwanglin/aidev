module.exports = {
  apps: [
    {
      name: "aidev-gateway",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3026 -H 0.0.0.0",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "2500M",
      env: {
        NODE_ENV: "production",
        PORT: 3026,
      },
    },
  ],
};
