import * as https from 'https';

export interface CrateInfo {
  name: string;
  description?: string;
  repositoryUrl?: string;
  documentationUrl?: string;
  homepageUrl?: string;
  latestVersion?: string;
  cratesIoUrl: string;
  docsRsUrl: string;
}

interface CacheEntry {
  data: CrateInfo;
  timestamp: number;
}

// Only allow valid Cargo crate name characters (letters, digits, hyphens, underscores).
const CRATE_NAME_RE = /^[a-zA-Z0-9_-]+$/;
// Only allow http/https URLs sourced from the crates.io API response.
const SAFE_URL_RE = /^https?:\/\//i;

const resultCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<CrateInfo>>();

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          // crates.io requires a descriptive User-Agent (https://crates.io/policies).
          'User-Agent': 'cargo-toml-lens-vscode/0.1.0 (vscode-extension)',
          'Accept': 'application/json',
        },
      },
      (res) => {
        if (res.statusCode === undefined || res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode ?? 'unknown'} for ${url}`));
          return;
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => { body += chunk; });
        res.on('end', () => resolve(body));
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.setTimeout(10_000, () => {
      req.destroy(new Error('Request timed out'));
    });
  });
}

async function doFetch(crateName: string): Promise<CrateInfo> {
  const url = `https://crates.io/api/v1/crates/${encodeURIComponent(crateName)}`;
  const body = await httpsGet(url);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let json: any;
  try {
    json = JSON.parse(body);
  } catch {
    throw new Error(`Invalid JSON response for crate "${crateName}"`);
  }

  const c = json?.crate;
  if (!c) {
    throw new Error(`No crate data returned for "${crateName}"`);
  }

  // Validate external URLs before storing them.
  const repoUrl: string | undefined =
    typeof c.repository === 'string' && SAFE_URL_RE.test(c.repository)
      ? c.repository
      : undefined;

  const docUrl: string | undefined =
    typeof c.documentation === 'string' && SAFE_URL_RE.test(c.documentation)
      ? c.documentation
      : undefined;

  const homeUrl: string | undefined =
    typeof c.homepage === 'string' && SAFE_URL_RE.test(c.homepage)
      ? c.homepage
      : undefined;

  const info: CrateInfo = {
    name: crateName,
    description: typeof c.description === 'string' ? c.description : undefined,
    repositoryUrl: repoUrl,
    documentationUrl: docUrl,
    homepageUrl: homeUrl,
    latestVersion: typeof c.newest_version === 'string' ? c.newest_version : undefined,
    cratesIoUrl: `https://crates.io/crates/${encodeURIComponent(crateName)}`,
    docsRsUrl: `https://docs.rs/${encodeURIComponent(crateName)}`,
  };

  resultCache.set(crateName, { data: info, timestamp: Date.now() });
  return info;
}

/**
 * Fetch metadata for a crate from the crates.io API.
 * Results are cached for one hour; concurrent requests for the same crate are coalesced.
 */
export function fetchCrateInfo(crateName: string): Promise<CrateInfo> {
  if (!CRATE_NAME_RE.test(crateName)) {
    return Promise.reject(new Error(`Invalid crate name: "${crateName}"`));
  }

  const cached = resultCache.get(crateName);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return Promise.resolve(cached.data);
  }

  // Coalesce concurrent requests for the same crate.
  const existing = inFlight.get(crateName);
  if (existing) {
    return existing;
  }

  const promise = doFetch(crateName).finally(() => {
    inFlight.delete(crateName);
  });
  inFlight.set(crateName, promise);
  return promise;
}

/** Evict all cached crate info (e.g. after a user-initiated refresh). */
export function clearCache(): void {
  resultCache.clear();
}
