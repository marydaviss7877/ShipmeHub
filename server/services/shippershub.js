/**
 * ShippersHub API Service
 * Proxies all calls to https://api.shippershub.com
 * Token is cached in memory and refreshed automatically.
 * Credentials are read from the active ShippersHubAccount in the DB,
 * falling back to SHIPPERSHUB_EMAIL / SHIPPERSHUB_PASSWORD env vars.
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

// ── Credential resolution ─────────────────────────────────────
async function getCredentials() {
  try {
    const ShippersHubAccount = require('../models/ShippersHubAccount');
    const active = await ShippersHubAccount.findOne({ isActive: true });
    if (active) {
      return { email: active.email, password: active.getPassword() };
    }
  } catch (_) {
    // DB not ready yet or model not found — fall through to env vars
  }

  const email    = process.env.SHIPPERSHUB_EMAIL;
  const password = process.env.SHIPPERSHUB_PASSWORD;
  if (!email || !password) {
    throw new Error('No active ShippersHub account configured. Add one in Settings or set SHIPPERSHUB_EMAIL / SHIPPERSHUB_PASSWORD in .env');
  }
  return { email, password };
}

// ── Auth ──────────────────────────────────────────────────────
async function getToken() {
  if (_cachedToken && _tokenExpiry && Date.now() < _tokenExpiry - 10 * 60 * 1000) {
    return _cachedToken;
  }

  const { email, password } = await getCredentials();

  const res = await apiRequest('POST', '/auth/login', { email, password });
  _cachedToken = res.data?.token;
  _tokenExpiry = Date.now() + 23 * 60 * 60 * 1000;

  if (!_cachedToken) throw new Error('ShippersHub login failed — no token in response');
  return _cachedToken;
}

// ── Test credentials without affecting the cached token ───────
async function testCredentials(email, password) {
  const res = await apiRequest('POST', '/auth/login', { email, password });
  const token = res.data?.token;
  if (!token) throw new Error('Login succeeded but no token returned');
  return true;
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
  // Do not log the full labelData — it contains PII (sender/recipient names and addresses)

  const { buffer, contentType, statusCode } = await apiRequestBinary('POST', '/single_label/generate', labelData, token);

  if (statusCode < 200 || statusCode >= 300) {
    const rawBody = buffer.toString().slice(0, 1000);
    console.error(`[ShippersHub] /single_label/generate returned HTTP ${statusCode}:`, rawBody);

    // If token expired/invalid, clear cache so next attempt re-authenticates
    if (statusCode === 401 || statusCode === 403) {
      clearToken();
    }

    let msg = `ShippersHub label generation failed (HTTP ${statusCode})`;
    try {
      const errJson = JSON.parse(rawBody);
      msg = errJson.message || errJson.error || errJson.msg
          || errJson.data?.message || errJson.errors?.[0]?.message
          || msg;
    } catch {
      // Response was not JSON; keep generic message
    }
    throw new Error(msg);
  }

  const isPdf = contentType.includes('pdf') || buffer.slice(0, 4).toString('ascii') === '%PDF';

  if (isPdf) {
    const filename  = `label-${Date.now()}-${Math.round(Math.random() * 1e6)}.pdf`;
    const localPath = path.join(LABELS_DIR, filename);
    fs.writeFileSync(localPath, buffer);

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
      awsPath:    awsPath  || `/api/labels/pdf/${filename}`,
      awsKey:     awsKey   || filename,
      localPdf:   localPath,
    };
  }

  try {
    const json = JSON.parse(buffer.toString());
    return json.data || json;
  } catch {
    throw new Error('Unexpected non-PDF response from ShippersHub label generation');
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

module.exports = { getToken, getMyCarriers, getMyVendors, createSingleLabel, getRecentLabels, clearToken, testCredentials };
