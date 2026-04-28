const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
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

// ดึง track ID หรือ collection ID จาก Apple Music URL
// รองรับ:
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
    // ผลลัพธ์แรกคือ collection metadata, ตัวต่อมาคือเพลง
    // ใช้ track แรกเพื่อให้ได้ trackViewUrl + previewUrl ครบ
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

async function scrapeM3U8(pageUrl) {
  if (!pageUrl) return null;
  let html;
  try {
    html = await fetchText(pageUrl, { headers: { 'User-Agent': UA } });
  } catch (e) {
    console.error('[artwork] scrape page error:', e.message);
    return null;
  }
  const re = /https:\/\/mvod\.itunes\.apple\.com\/[^\s"\\')]+\.m3u8/g;
  const matches = [...new Set(html.match(re) || [])];
  if (!matches.length) return null;
  const preferred = matches.find((m) => m.includes('default.m3u8') || m.includes('main.m3u8'));
  return preferred || matches[0];
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
  for (const v of variants) {
    const label = `${v.height}p`;
    const bucket = v.isTall ? tall : square;
    if (!bucket[label] || v.pixels > bucket[`${label}__px`]) {
      bucket[label] = v.mp4;
      bucket[`${label}__px`] = v.pixels;
    }
  }
  for (const k of Object.keys(square)) if (k.endsWith('__px')) delete square[k];
  for (const k of Object.keys(tall)) if (k.endsWith('__px')) delete tall[k];
  return { square, tall };
}

async function fallbackDodoApps(collectionUrl) {
  try {
    const body = new URLSearchParams({ url: collectionUrl, animation: 'true' });
    const t = withTimeout(TIMEOUT_MS);
    const r = await fetch('https://clients.dodoapps.io/playlist-precis/playlist-artwork.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
        'Accept': 'application/json',
      },
      body,
      signal: t.signal,
    });
    t.clear();
    if (!r.ok) return null;
    const data = await r.json();
    return data?.animatedUrl1080 || data?.animatedUrl || null;
  } catch (e) {
    console.error('[artwork] dodoapps fallback error:', e.message);
    return null;
  }
}

function pickBest(map) {
  const keys = Object.keys(map);
  if (!keys.length) return null;
  const sorted = keys.sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
  const preferred = sorted.find((k) => parseInt(k, 10) <= 1080) || sorted[0];
  return map[preferred];
}

async function fetchMasterTallUrl(pageUrl) {
  try {
    const url = `https://api.aritra.ovh/v1/covers?${new URLSearchParams({ url: pageUrl })}`;
    const data = await fetchJSON(url);
    return data?.master?.tall || null;
  } catch {
    return null;
  }
}

export async function getAnimation(pageUrl) {
  const [master, masterTall] = await Promise.all([
    scrapeM3U8(pageUrl),
    fetchMasterTallUrl(pageUrl),
  ]);

  let square = {};
  let tall = {};

  const [squareParsed, tallParsed] = await Promise.all([
    master ? parseM3U8Variants(master) : Promise.resolve({ square: {}, tall: {} }),
    masterTall ? parseM3U8Variants(masterTall) : Promise.resolve({ square: {}, tall: {} }),
  ]);

  // master จากหน้าอัลบั้มมักเป็น square; master.tall มักเป็น tall
  // รวมทั้งสองเข้าตามแนวจริง (isTall ตัดสินจาก resolution)
  square = { ...squareParsed.square, ...tallParsed.square };
  tall = { ...squareParsed.tall, ...tallParsed.tall };

  let best = pickBest(square);
  let bestTall = pickBest(tall);

  if (!best && !bestTall) {
    const fb = await fallbackDodoApps(pageUrl);
    if (fb) {
      square = { fallback: fb };
      best = fb;
    }
  }

  return { square, tall, best, bestTall, master, masterTall };
}

export async function getCoverHires(pageUrl) {
  if (!pageUrl) return { uncompressed: null, masterTall: null };
  try {
    const url = `https://api.aritra.ovh/v1/covers?${new URLSearchParams({ url: pageUrl })}`;
    const data = await fetchJSON(url);
    return {
      uncompressed: data?.uncompressed_cover_art?.url || null,
      masterTall: data?.master?.tall || null,
    };
  } catch (e) {
    console.error('[artwork] cover-hires error:', e.message);
    return { uncompressed: null, masterTall: null };
  }
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
