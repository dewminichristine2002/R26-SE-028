const os = require('os');
const { spawn } = require('child_process');

function getLocalIPv4() {
  const nets = os.networkInterfaces();
  const candidates = [];

  for (const [name, addresses] of Object.entries(nets)) {
    for (const net of addresses || []) {
      if (net.family !== 'IPv4' || net.internal) {
        continue;
      }

      const lowerName = name.toLowerCase();
      let score = 0;

      if (/wi-?fi|wlan|wireless/.test(lowerName)) score += 100;
      if (/ethernet/.test(lowerName)) score += 40;
      if (/vethernet|wsl|hyper-v|virtual|vmware|docker/.test(lowerName)) score -= 200;

      if (net.address === '172.20.10.2') score += 80;
      else if (net.address.startsWith('192.168.')) score += 50;
      else if (net.address.startsWith('10.')) score += 40;
      else if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(net.address)) score += 20;

      candidates.push({ name, address: net.address, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.address ?? null;
}

const ip = getLocalIPv4();
if (!ip) {
  console.error('Could not detect local IPv4 address. Connect to Wi-Fi and try again.');
  process.exit(1);
}

const metroPort = String(process.env.METRO_PORT || process.env.RCT_METRO_PORT || '8081');

const env = {
  ...process.env,
  REACT_NATIVE_PACKAGER_HOSTNAME: ip,
  RCT_METRO_PORT: metroPort,
};

console.log(`Using LAN host: ${ip}`);
console.log(`Metro port: ${metroPort}`);

const isWindows = process.platform === 'win32';
const expoCmd = isWindows ? 'cmd' : 'npx';
const args = isWindows
  ? ['/c', 'npx', 'expo', 'start', '--dev-client', '--lan', '--clear', '--port', metroPort]
  : ['expo', 'start', '--dev-client', '--lan', '--clear', '--port', metroPort];

const child = spawn(expoCmd, args, {
  stdio: 'inherit',
  env,
  shell: false,
});

child.on('close', (code) => {
  process.exit(code ?? 0);
});
