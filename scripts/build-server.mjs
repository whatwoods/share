// 用 esbuild 把后端打包为单文件 ESM：dist/server/index.js
// 依赖（node_modules）保持 external，运行时从仓库根目录的 node_modules 解析。
import { build } from 'esbuild';
import { rmSync } from 'node:fs';

rmSync('dist/server', { recursive: true, force: true });

await build({
  entryPoints: ['server/src/index.ts'],
  outfile: 'dist/server/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  sourcemap: true,
  legalComments: 'none',
  logLevel: 'info',
  // 某些 CJS 依赖在 ESM 产物中需要 require / __dirname
  banner: {
    js: [
      "import { createRequire as __wgCreateRequire } from 'node:module';",
      "const require = __wgCreateRequire(import.meta.url);",
    ].join('\n'),
  },
});
