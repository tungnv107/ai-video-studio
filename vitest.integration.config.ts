import {defineConfig} from 'vitest/config';
import {loadEnvFile} from 'node:process';
loadEnvFile('.env');
export default defineConfig({test:{include:['tests/integration/**/*.test.ts'],testTimeout:120000,hookTimeout:60000,fileParallelism:false,maxWorkers:1}});
