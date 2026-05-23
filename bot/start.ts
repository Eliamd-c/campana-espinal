import { spawn } from 'child_process';
import * as path from 'path';

console.log('🚀 Iniciando Sistema de Mensajería WhatsApp Distribuido...');

const socketProcess = spawn('npx', ['tsx', path.join(__dirname, 'socket.ts')], { stdio: 'inherit', shell: true });
const workerProcess = spawn('npx', ['tsx', path.join(__dirname, 'worker.ts')], { stdio: 'inherit', shell: true });

socketProcess.on('close', (code) => {
    console.log(`❌ Socket Manager finalizado con código ${code}`);
    process.exit(code || 0);
});

workerProcess.on('close', (code) => {
    console.log(`❌ Worker finalizado con código ${code}`);
    process.exit(code || 0);
});

process.on('SIGINT', () => {
    console.log('🛑 Deteniendo procesos...');
    socketProcess.kill('SIGINT');
    workerProcess.kill('SIGINT');
    process.exit(0);
});
