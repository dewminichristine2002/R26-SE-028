const os = require('os');
const net = require('net');
const { spawn } = require('child_process');

function ignoreClosedPipeErrors(stream) {
  if (!stream || typeof stream.on !== 'function') {
    return;
  }

  stream.on('error', (error) => {
    if (error.code === 'EPIPE' || error.code === 'EOF') {
      return;
    }

    throw error;
  });
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '0.0.0.0');
  });
}

async function findAvailablePort(preferredPort) {
  for (let port = preferredPort; port < preferredPort + 20; port += 1) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }

  throw new Error(`Could not find an available Metro port from ${preferredPort} to ${preferredPort + 19}.`);
}

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

      if (net.address.startsWith('192.168.')) score += 50;
      else if (net.address.startsWith('10.')) score += 40;
      else if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(net.address)) score += 20;

      candidates.push({ name, address: net.address, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.address ?? null;
}

async function main() {
  ignoreClosedPipeErrors(process.stdout);
  ignoreClosedPipeErrors(process.stderr);

  const ip = getLocalIPv4();
  if (!ip) {
    console.error('Could not detect local IPv4 address. Connect to Wi-Fi and try again.');
    process.exit(1);
  }

  const preferredPort = Number.parseInt(process.env.METRO_PORT || process.env.RCT_METRO_PORT || '8081', 10);
  if (!Number.isInteger(preferredPort) || preferredPort < 1 || preferredPort > 65535) {
    console.error('METRO_PORT/RCT_METRO_PORT must be a valid TCP port.');
    process.exit(1);
  }

  const metroPort = String(await findAvailablePort(preferredPort));

  const env = {
    ...process.env,
    REACT_NATIVE_PACKAGER_HOSTNAME: ip,
    RCT_METRO_PORT: metroPort,
  };

  console.log(`Using LAN host: ${ip}`);
  console.log(`Metro port: ${metroPort}`);
  if (metroPort !== String(preferredPort)) {
    console.log(`Port ${preferredPort} is already in use, so Metro will start on ${metroPort}.`);
  }

  const expoCli = require.resolve('expo/bin/cli');
  const child = spawn(
    process.execPath,
    [expoCli, 'start', '--dev-client', '--lan', '--clear', '--port', metroPort],
    {
      stdio: 'inherit',
      env,
      shell: false,
    },
  );

  child.on('error', (error) => {
    console.error(`Failed to start Expo: ${error.message}`);
    process.exit(1);
  });

  child.on('close', (code) => {
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
