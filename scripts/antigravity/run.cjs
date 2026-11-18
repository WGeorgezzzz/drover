const fs = require('node:fs');
const { spawn } = require('node:child_process');
const net = require('node:net');

const request = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const output = fs.openSync(request.output, 'w');
const errors = fs.openSync(request.errors, 'w');
const child = spawn(request.cli, request.args, {
  cwd: request.cwd,
  windowsHide: true,
  stdio: request.pipe ? ['pipe', 'pipe', errors] : ['ignore', output, errors],
});
let socket;
let stopping = false;
function stop() {
  if (stopping || child.exitCode !== null) return;
  stopping = true;
  if (process.platform !== 'win32') { child.kill(); return; }
  const killer = spawn('conhost.exe', ['--headless', 'taskkill.exe', '/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'pipe' });
  killer.stdout.resume();
  killer.stderr.resume();
  killer.once('error', () => child.kill());
}
if (request.pipe) {
  socket = net.connect(request.pipe);
  socket.pipe(child.stdin);
  child.stdout.pipe(socket);
  socket.on('error', stop);
  socket.on('close', stop);
  child.stdin.on('error', () => {});
}
child.once('error', error => {
  fs.writeSync(errors, error.message);
  process.exitCode = 1;
});
child.once('close', code => {
  socket?.destroy();
  fs.writeFileSync(request.status, JSON.stringify({ code: code ?? 1 }));
  fs.closeSync(output);
  fs.closeSync(errors);
  process.exitCode = code ?? 1;
});
