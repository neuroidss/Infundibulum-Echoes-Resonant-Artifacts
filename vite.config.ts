import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      base: '/Infundibulum-Echoes-Resonant-Artifacts/', 
  server: {
    watch: {
      // Exclude the server's python virtual environment from file watching
      // to prevent "ENOSPC: System limit for number of file watchers reached".
      ignored: [
        '**/server/venv/**',
        '**/server/**',
      ],
    },
  },
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});