// 서버(3000)와 화면 개발 서버(5173)를 함께 띄운다
import { spawn } from 'node:child_process';

const run = (script) => spawn('npm', ['run', script], { stdio: 'inherit', shell: process.platform === 'win32' });
const procs = [run('dev:server'), run('dev:client')];
const stop = () => procs.forEach((p) => p.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
