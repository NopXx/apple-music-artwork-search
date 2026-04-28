const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const TIMEOUT_MS = 8000;

function withTimeout(ms) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, clear: () => clearTimeout(id) };
}

async function fetchText(url, opts = {}) {
  const t = withTimeout(opts.timeout ?? TIMEOUT_MS);
  try {
    const r = await fetch(url, { ...opts, signal: t.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally {
    t.clear();
  }
}

async function fetchJSON(url, opts = {}) {
  const text = await fetchText(url, opts);
  return JSON.parse(text);
}

export function upsizeArtwork(url, size = 600) {
  if (!url) return null;
  return url.replace(/\/\d+x\d+bb\.(jpg|png)$/i, `/${size}x${size}bb.$1`);
}

export function sanitizeAppleUrl(raw, dropTrackId = false) {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    u.searchParams.delete('uo');
    if (dropTrackId) u.searchParams.delete('i');
    return u.toString();
  } catch {
    return raw;
  }
}

function mapITunesItem(it) {
  const small = it.artworkUrl100 || '';
  return {
    id: it.trackId || it.collectionId,
    trackId: it.trackId || null,
    collectionId: it.collectionId || null,
    track: it.trackName || it.collectionName || '',
    artist: it.artistName || '',
    album: it.collectionName || '',
    artworkSmall: small,
    artwork: upsizeArtwork(small, 600),
    artworkHi: upsizeArtwork(small, 1000),
    artworkUltra: upsizeArtwork(small, 3000),
    trackViewUrl: sanitizeAppleUrl(it.trackViewUrl, false),
    collectionViewUrl: sanitizeAppleUrl(it.collectionViewUrl, true),
    artistViewUrl: it.artistViewUrl || null,
    releaseDate: it.releaseDate || null,
    previewUrl: it.previewUrl || null,
  };
}

// Apple Music URLs:
//   https://music.apple.com/<cc>/album/<slug>/<albumId>?i=<trackId>
//   https://music.apple.com/<cc>/album/<slug>/<albumId>
//   https://music.apple.com/<cc>/song/<slug>/<trackId>
export function parseAppleMusicUrl(input) {
  try {
    const u = new URL(input);
    if (!/(^|\.)music\.apple\.com$/i.test(u.hostname) && !/(^|\.)itunes\.apple\.com$/i.test(u.hostname)) {
      return null;
    }
    const i = u.searchParams.get('i');
    if (i && /^\d+$/.test(i)) return { id: i, kind: 'track' };
    const segs = u.pathname.split('/').filter(Boolean);
    const last = segs[segs.length - 1];
    if (last && /^\d+$/.test(last)) {
      const kind = segs.includes('song') ? 'track' : 'album';
      return { id: last, kind };
    }
    return null;
  } catch {
    return null;
  }
}

async function lookupById(id, kind) {
  const params = new URLSearchParams({ id });
  if (kind === 'album') {
    params.set('entity', 'song');
    params.set('limit', '1');
  }
  const url = `https://itunes.apple.com/lookup?${params.toString()}`;
  const data = await fetchJSON(url);
  const results = data?.results || [];
  if (kind === 'album') {
    return results.find((r) => r.wrapperType === 'track') || results[0] || null;
  }
  return results[0] || null;
}

export async function searchITunes(input, { limit = 25, entity = 'musicTrack' } = {}) {
  if (!input || !input.trim()) return [];
  const trimmed = input.trim();

  const parsed = parseAppleMusicUrl(trimmed);
  if (parsed) {
    const item = await lookupById(parsed.id, parsed.kind);
    return item ? [mapITunesItem(item)] : [];
  }

  const params = new URLSearchParams({
    term: trimmed,
    media: 'music',
    entity,
    limit: String(limit),
  });
  const url = `https://itunes.apple.com/search?${params.toString()}`;
  const data = await fetchJSON(url);
  const results = data?.results ?? [];
  return results.map(mapITunesItem);
}

async function parseM3U8Variants(masterUrl) {
  if (!masterUrl) return { square: {}, tall: {} };
  let text;
  try {
    text = await fetchText(masterUrl);
  } catch (e) {
    console.error('[artwork] master playlist error:', e.message);
    return { square: {}, tall: {} };
  }

  const variants = [];
  let currentInfo = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('#EXT-X-STREAM-INF')) {
      currentInfo = line;
    } else if (line.startsWith('https://') && line.endsWith('.m3u8') && currentInfo) {
      const m = currentInfo.match(/RESOLUTION=(\d+)x(\d+)/);
      if (m) {
        const width = parseInt(m[1], 10);
        const height = parseInt(m[2], 10);
        const mp4 = line.includes('_-.m3u8')
          ? line.replace('_-.m3u8', '_-.mp4')
          : line.replace(/\.m3u8$/, '-.mp4');
        variants.push({
          mp4,
          width,
          height,
          isTall: height > width,
          pixels: width * height,
        });
      }
      currentInfo = null;
    }
  }

  const square = {};
  const tall = {};
  const pxTrack = new Map();
  for (const v of variants) {
    const label = `${v.height}p`;
    const bucket = v.isTall ? tall : square;
    const key = (v.isTall ? 't:' : 's:') + label;
    if (!bucket[label] || v.pixels > pxTrack.get(key)) {
      bucket[label] = v.mp4;
      pxTrack.set(key, v.pixels);
    }
  }
  return { square, tall };
}

function pickBest(map) {
  const keys = Object.keys(map);
  if (!keys.length) return null;
  const sorted = keys.sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
  const preferred = sorted.find((k) => parseInt(k, 10) <= 1080) || sorted[0];
  return map[preferred];
}

// Apple Music developer token — extract once from the web player JS bundle
let _tokenCache = { token: null, exp: 0 };

async function getAppleDevToken() {
  const now = Math.floor(Date.now() / 1000);
  if (_tokenCache.token && _tokenCache.exp - now > 300) return _tokenCache.token;

  const html = await fetchText('https://music.apple.com/us/browse', {
    headers: { 'User-Agent': UA, 'Accept': 'text/html' },
  });
  const bundle = html.match(/\/assets\/index[^"']*\.js/)?.[0];
  if (!bundle) throw new Error('cannot locate Apple Music JS bundle');
  const js = await fetchText(`https://music.apple.com${bundle}`, { timeout: 15000 });
  const jwt = js.match(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0];
  if (!jwt) throw new Error('cannot extract dev token from bundle');
  let exp = now + 86400;
  try {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64').toString('utf8'));
    if (payload.exp) exp = payload.exp;
  } catch {}
  _tokenCache = { token: jwt, exp };
  return jwt;
}

const TYPE_MAP = { album: 'albums', track: 'songs' };

async function fetchMotionMasters(id, kind) {
  const type = TYPE_MAP[kind];
  if (!type) return [];
  const token = await getAppleDevToken();
  const url = `https://amp-api.music.apple.com/v1/catalog/us/${type}/${id}?extend=editorialVideo`;
  const t = withTimeout(TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://music.apple.com',
        'Accept': 'application/json',
      },
      signal: t.signal,
    });
    if (r.status === 401) _tokenCache = { token: null, exp: 0 };
    if (!r.ok) return [];
    const data = await r.json();
    const ev = data?.data?.[0]?.attributes?.editorialVideo || {};
    const out = [];
    for (const v of Object.values(ev)) {
      if (v?.video && typeof v.video === 'string') out.push(v.video);
    }
    return [...new Set(out)];
  } finally {
    t.clear();
  }
}

export async function getAnimation({ id, kind } = {}) {
  if (!id || !kind) return { square: {}, tall: {}, best: null, bestTall: null, masters: [] };

  let masters = [];
  try {
    masters = await fetchMotionMasters(id, kind);
  } catch (e) {
    console.error('[artwork] motion masters error:', e.message);
  }

  const parsed = await Promise.all(masters.map((m) => parseM3U8Variants(m)));
  const square = {};
  const tall = {};
  for (const p of parsed) {
    Object.assign(square, p.square);
    Object.assign(tall, p.tall);
  }

  return {
    square,
    tall,
    best: pickBest(square),
    bestTall: pickBest(tall),
    masters,
  };
}

// Simple LRU cache
export class LRU {
  constructor(max = 50) {
    this.max = max;
    this.map = new Map();
  }
  get(k) {
    if (!this.map.has(k)) return undefined;
    const v = this.map.get(k);
    this.map.delete(k);
    this.map.set(k, v);
    return v;
  }
  set(k, v) {
    if (this.map.has(k)) this.map.delete(k);
    this.map.set(k, v);
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
  }
}
