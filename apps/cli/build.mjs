import { build } from 'esbuild'
await build({ entryPoints: ['src/main.ts'], outfile: 'dist/main.mjs', bundle: true, platform: 'node', format: 'esm', target: 'node24', packages: 'external', tsconfig: '../../tsconfig.json', banner: { js: '#!/usr/bin/env node' } })
