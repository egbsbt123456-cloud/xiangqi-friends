import { defineConfig } from 'tsup';
export default defineConfig({ entry: { index: 'src/index.ts', migrate: 'src/database/migrate.ts' }, format: ['esm'], platform: 'node', target: 'node24', splitting: false, clean: true, noExternal: ['@board/contracts', '@board/game-core'] });

