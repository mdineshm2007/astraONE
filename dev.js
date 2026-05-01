import { spawn } from 'child_process';
import { platform } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isWindows = platform() === 'win32';

// Use absolute paths to binaries to avoid shell path issues with '&'
const vitePath = path.resolve(__dirname, 'node_modules/vite/bin/vite.js');
const tsxPath = path.resolve(__dirname, 'node_modules/tsx/dist/cli.mjs');

console.log(`Starting services in: ${__dirname}`);

// Start Vite frontend
const viteProcess = spawn('node', [vitePath], { 
    stdio: 'inherit',
    cwd: __dirname
});

// Start Express backend with watch mode so it auto-restarts on changes
const serverProcess = spawn('node', [tsxPath, 'watch', 'server.ts'], { 
    stdio: 'inherit',
    cwd: __dirname
});

// Handle termination to clean up both processes
const cleanup = () => {
    console.log('\nShutting down...');
    viteProcess.kill();
    serverProcess.kill();
    process.exit();
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
