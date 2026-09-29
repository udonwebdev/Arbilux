module.exports = {
  apps: [
    {
      name: 'arbilux-core',
      script: 'node_modules/tsx/dist/cli.mjs',
      args: 'src/scanner.ts',
      cwd: './bot',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
