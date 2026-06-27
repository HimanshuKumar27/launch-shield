const dns = require('dns').promises;

const BLOCKED_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^::1$/,
  /^0\.0\.0\.0$/,
  /^169\.254\./,     // link-local
  /\.internal$/i,
  /\.local$/i,
];

function isPrivateIp(ip) {
  if (!ip) return true;
  // IPv4 Private & Loopback Checks
  if (ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('169.254.') || ip.startsWith('192.168.')) {
    return true;
  }
  const parts = ip.split('.');
  if (parts.length === 4) {
    const first = parseInt(parts[0], 10);
    const second = parseInt(parts[1], 10);
    if (first === 172 && second >= 16 && second <= 31) {
      return true;
    }
  }
  // IPv6 Loopback / Private / Link-Local Checks
  if (ip === '::1' || ip === '0:0:0:0:0:0:0:1') {
    return true;
  }
  const ipLower = ip.toLowerCase();
  if (ipLower.startsWith('fe80:') || ipLower.startsWith('fc00:') || ipLower.startsWith('fd00:')) {
    return true;
  }
  return false;
}

async function validateUrlSecurity(url) {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { safe: false, reason: 'Only HTTP and HTTPS protocols are allowed.' };
    }

    const host = parsed.hostname;

    // 1. Basic text patterns check
    if (BLOCKED_PATTERNS.some(p => p.test(host)) || !host.includes('.')) {
      return { safe: false, reason: 'Access to local, internal, or invalid domains is blocked.' };
    }

    // 2. DNS resolution check
    let ip;
    try {
      const result = await dns.lookup(host);
      ip = result.address;
    } catch (err) {
      if (process.env.FUNCTIONS_EMULATOR === 'true') {
        console.warn(`[EMULATOR] DNS lookup failed for ${host} (${err.message}). Proceeding anyway for local testing.`);
        return { safe: true };
      }
      return { safe: false, reason: 'The domain does not exist or DNS lookup failed. Please provide a valid, active website.' };
    }

    // 3. SSRF Check on resolved IP
    if (isPrivateIp(ip)) {
      return { safe: false, reason: 'The website resolves to a private or restricted network address.' };
    }

    // 4. Reachability Check (HEAD request with GET fallback)
    try {
      const fetch = (await import('node-fetch')).default;
      let resp;
      try {
        resp = await fetch(url, {
          method: 'HEAD',
          timeout: 8000,
          headers: { 'User-Agent': 'LaunchShield-Bot/1.0 (+https://launchshield.app)' },
        });
      } catch (headErr) {
        resp = await fetch(url, {
          method: 'GET',
          timeout: 8000,
          headers: { 'User-Agent': 'LaunchShield-Bot/1.0 (+https://launchshield.app)' },
        });
      }

      if (resp.status < 200 || resp.status >= 400) {
        return { safe: false, reason: `Website is unreachable (HTTP status ${resp.status}).` };
      }
    } catch (err) {
      if (process.env.FUNCTIONS_EMULATOR === 'true') {
        console.warn(`[EMULATOR] Reachability check failed for ${url} (${err.message}). Proceeding anyway for local testing.`);
        return { safe: true };
      }
      return { safe: false, reason: 'Website is unreachable. Please make sure the URL is online and reachable.' };
    }

    return { safe: true };
  } catch (err) {
    return { safe: false, reason: 'Please provide a genuinely valid URL format.' };
  }
}

module.exports = {
  validateUrlSecurity,
  isPrivateIp
};
