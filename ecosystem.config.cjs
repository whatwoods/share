/**
 * PM2 进程配置：pm2 start ecosystem.config.cjs && pm2 save
 * 环境变量从仓库根目录 .env 读取（服务启动时自动加载），也可在下方 env 中覆盖。
 */
module.exports = {
  apps: [
    {
      name: 'wangu-ops',
      cwd: __dirname,
      script: 'dist/server/index.js',
      node_args: '--disable-warning=ExperimentalWarning',
      instances: 1, // SQLite 单写者：保持单实例
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3300,
        HOST: '127.0.0.1',
      },
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      time: true,
    },
  ],
};
