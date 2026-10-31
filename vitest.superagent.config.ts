import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', include: ['server/modules/superagent/tests/**/*.spec.ts'], pool: 'forks', maxWorkers: 1 } });
