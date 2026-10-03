import tls from 'node:tls';
import https from 'node:https';
import { X509Certificate } from 'node:crypto';

/**
 * HTTPS GET for servers that send an incomplete certificate chain (Air4Thai
 * sends its Let's Encrypt certificate with the wrong intermediate).
 *
 * Browsers fix this by downloading the missing issuer from the address in the
 * certificate's "Authority Information Access" field; Node does not. We do the
 * same: read the server certificate (connection closed before any request),
 * follow its CA Issuers links until reaching an issuer Node already trusts,
 * then make the real request with normal, full verification — hostname and
 * chain up to a trusted root. Verification is never switched off.
 */
const chains = new Map<string, string[]>();
const MAX_HOPS = 3;

async function peerCertificate(host: string): Promise<tls.DetailedPeerCertificate> {
  return new Promise((resolve, reject) => {
    // Only reads the certificate; no data is sent or trusted on this connection.
    const s = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: false, timeout: 15_000 }, () => {
      const c = s.getPeerCertificate(true);
      s.end();
      resolve(c);
    });
    s.on('error', reject);
    s.on('timeout', () => s.destroy(new Error(`TLS timeout ${host}`)));
  });
}

const trustedSubjects = new Set(tls.rootCertificates.map((pem) => new X509Certificate(pem).subject));

/** Issuer certificates (PEM) missing from `host`'s chain, found through AIA links. */
export async function missingIssuers(host: string): Promise<string[]> {
  const cached = chains.get(host);
  if (cached) return cached;
  const peer = await peerCertificate(host);
  const out: string[] = [];
  let url = peer.infoAccess?.['CA Issuers - URI']?.[0];
  for (let hop = 0; hop < MAX_HOPS && url && /^https?:\/\//.test(url); hop++) {
    const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw new Error(`AIA ${url} → HTTP ${r.status}`);
    const cert = new X509Certificate(Buffer.from(await r.arrayBuffer()));
    out.push(cert.toString());
    if (trustedSubjects.has(cert.issuer)) break;
    url = /CA Issuers - URI:(\S+)/.exec(cert.infoAccess ?? '')?.[1];
  }
  chains.set(host, out);
  return out;
}

/** GET a URL as text with full TLS verification, completing the chain through AIA when needed. */
export async function getTextWithAia(url: string, headers: Record<string, string>, timeoutMs = 30_000): Promise<{ status: number; text: string }> {
  const { hostname } = new URL(url);
  const extra = await missingIssuers(hostname);
  return new Promise((resolve, reject) => {
    const req = https.get(url, { ca: [...tls.rootCertificates, ...extra], headers, timeout: timeoutMs }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (d: string) => (body += d));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, text: body }));
    });
    req.on('timeout', () => req.destroy(new Error(`timeout ${hostname}`)));
    req.on('error', reject);
  });
}
