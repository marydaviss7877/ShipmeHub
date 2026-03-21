/**
 * ShippersHub API Service
 * Proxies all calls to https://api.shippershub.com
 * Token is cached in memory and refreshed automatically
 */
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const BASE_URL = 'https://api.shippershub.com/api';

// Directory to save generated label PDFs
const LABELS_DIR = path.join(__dirname, '../uploads/labels');
fs.mkdirSync(LABELS_DIR, { recursive: true });

// In-memory token cache
let _cachedToken = null;
let _tokenExpiry  = null;

// ── Low-level request helper (JSON responses) ─────────────────
function apiRequest(method, path, data = null, token = null) {
  return new Promise((resolve, reject) => {
    const body   = data ? JSON.stringify(data) : null;
    const url    = new URL(`${BASE_URL}${path}`);
    const options = {
      hostname: url.hostname,
      port:     443,
      path:     url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body  ? { 'Content-Length': Buffer.byteLength(body) } : {})
      }
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          console.log(`[ShippersHub] ${method} ${path} → status:${res.statusCode}`, JSON.stringify(json).slice(0, 400));
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            const msg = json.message || json.error || json.data?.message
                      || json.msg || `ShippersHub API error ${res.statusCode}`;
            reject(new Error(msg));
          }
        } catch {
          reject(new Error(`Invalid JSON response from ShippersHub: ${raw.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ── Binary request helper (for label PDF responses) ───────────
function apiRequestBinary(method, urlPath, data = null, token = null) {
  return new Promise((resolve, reject) => {
    const body   = data ? JSON.stringify(data) : null;
    const url    = new URL(`${BASE_URL}${urlPath}`);
    const options = {
      hostname: url.hostname,
      port:     443,
      path:     url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body  ? { 'Content-Length': Buffer.byteLength(body) } : {})
      }
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on('end', () => {
        const buffer      = Buffer.concat(chunks);
        const contentType = res.headers['content-type'] || '';
        resolve({ buffer, contentType, statusCode: res.statusCode, headers: res.headers });
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ── Auth ──────────────────────────────────────────────────────
async function getToken() {
  if (_cachedToken && _tokenExpiry && Date.now() < _tokenExpiry - 10 * 60 * 1000) {
    return _cachedToken;
  }

  const email    = process.env.SHIPPERSHUB_EMAIL;
  const password = process.env.SHIPPERSHUB_PASSWORD;

  if (!email || !password) {
    throw new Error('SHIPPERSHUB_EMAIL and SHIPPERSHUB_PASSWORD must be set in .env');
  }

  const res = await apiRequest('POST', '/auth/login', { email, password });
  _cachedToken = res.data?.token;
  _tokenExpiry = Date.now() + 23 * 60 * 60 * 1000;

  if (!_cachedToken) throw new Error('ShippersHub login failed — no token in response');
  return _cachedToken;
}

// ── Carriers ──────────────────────────────────────────────────
async function getMyCarriers() {
  const token = await getToken();
  const res   = await apiRequest('GET', '/user/get_my_carriers', null, token);
  return res.data || [];
}

// ── Vendors ───────────────────────────────────────────────────
async function getMyVendors(carrierId) {
  const token = await getToken();
  const res   = await apiRequest('GET', `/user/get_my_vendors/${carrierId}`, null, token);
  return res.data || [];
}

// ── Label Generation ──────────────────────────────────────────
// ShippersHub returns the raw PDF binary directly (not JSON).
// We save it to disk, then fetch the most recent label record to get the tracking ID.
async function createSingleLabel(labelData) {
  const token = await getToken();
  console.log('[ShippersHub] createSingleLabel payload:', JSON.stringify(labelData, null, 2));

  const { buffer, contentType, statusCode } = await apiRequestBinary('POST', '/single_label/generate', labelData, token);

  if (statusCode < 200 || statusCode >= 300) {
    // Try to parse error as JSON
    try {
      const errJson = JSON.parse(buffer.toString());
      const msg = errJson.message || errJson.error || errJson.msg || `ShippersHub error ${statusCode}`;
      throw new Error(msg);
    } catch {
      throw new Error(`ShippersHub label generation failed (HTTP ${statusCode})`);
    }
  }

  const isPdf = contentType.includes('pdf') || buffer.slice(0, 4).toString('ascii') === '%PDF';

  if (isPdf) {
    // Save PDF to disk
    const filename    = `label-${Date.now()}-${Math.round(Math.random() * 1e6)}.pdf`;
    const localPath   = path.join(LABELS_DIR, filename);
    fs.writeFileSync(localPath, buffer);
    console.log(`[ShippersHub] PDF saved → ${localPath}`);

    // Fetch the most recent ShippersHub label record to get tracking ID
    let trackingID = '';
    let labelId    = null;
    let awsPath    = null;
    let awsKey     = null;
    try {
      const recent = await getRecentLabels(1, 1);
      const latest = recent?.data?.[0];
      if (latest) {
        trackingID = latest.trackingID || latest.trackingId || '';
        labelId    = latest._id || null;
        awsPath    = latest.awsPath || null;
        awsKey     = latest.awsKey  || null;
      }
    } catch (e) {
      console.warn('[ShippersHub] Could not fetch tracking ID after label generation:', e.message);
    }

    return {
      _id:        labelId,
      trackingID,
      // Prefer S3 URL if available, fall back to our local copy
      awsPath:    awsPath  || `/api/labels/pdf/${filename}`,
      awsKey:     awsKey   || filename,
      localPdf:   localPath,
    };
  }

  // Unexpected: response was not a PDF — try parsing as JSON
  try {
    const json = JSON.parse(buffer.toString());
    console.log('[ShippersHub] createSingleLabel JSON response:', JSON.stringify(json).slice(0, 400));
    return json.data || json;
  } catch {
    throw new Error(`Unexpected non-PDF response from ShippersHub label generation`);
  }
}

// ── Recent Labels ─────────────────────────────────────────────
async function getRecentLabels(page = 1, limit = 10) {
  const token = await getToken();
  const res   = await apiRequest('GET', `/single_label/?page=${page}&limit=${limit}`, null, token);
  return res;
}

// Invalidate cached token (e.g. after auth failure)
function clearToken() {
  _cachedToken = null;
  _tokenExpiry  = null;
}

module.exports = { getToken, getMyCarriers, getMyVendors, createSingleLabel, getRecentLabels, clearToken };
