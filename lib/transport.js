const http = require('node:http');
const https = require('node:https');
const tls = require('node:tls');

// Factory certificates shipped by ihcsdk. These controllers have no per-host
// DNS name. Check the exact leaf before the agent may send SOAP credentials.
const factoryPins = new Set([
  'FD:13:2D:C9:05:72:80:C9:0B:20:67:F2:2C:22:50:6B:3C:F8:84:9E:FD:D8:B9:38:B3:ED:06:57:B6:4E:F9:A4',
  '3B:8E:2E:AC:30:AD:CA:E5:15:4D:F2:92:1A:C3:D5:19:AC:C7:3A:B7:63:D4:13:4B:5E:9B:DD:FA:17:1B:1A:7A'
]);
class IhcAgent extends https.Agent {
  createConnection(options, done) {
    const socket = tls.connect({ ...options, rejectUnauthorized: false, ciphers: 'DEFAULT:!DH' });
    const failed = e => done(e);
    socket.once('error', failed);
    socket.once('secureConnect', () => {
      socket.removeListener('error', failed);
      const cert = socket.getPeerCertificate();
      if (!factoryPins.has(cert.fingerprint256) &&
          (!socket.authorized || tls.checkServerIdentity(options.host, cert))) {
        socket.destroy();
        done(Error('Ukendt certifikat på IHC-controlleren'));
      } else done(null, socket);
    });
  }
}
const agent = new IhcAgent({ keepAlive: true });
function post(url, headers, body) {
  return new Promise((resolve, reject) => {
    const secure = url.startsWith('https://');
    const req = (secure ? https : http).request(url, {
      method: 'POST', headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
      agent: secure ? agent : undefined, signal: AbortSignal.timeout(30000)
    }, res => {
      const chunks = [];
      let bytes = 0;
      res.on('error', reject);
      res.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 32 * 1024 * 1024) req.destroy(Error('IHC-svaret var for stort'));
        else chunks.push(chunk);
      });
      res.on('end', () => resolve({ status: res.statusCode, cookies: res.headers['set-cookie'] || [], text: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.end(body);
  });
}
module.exports = { post };
