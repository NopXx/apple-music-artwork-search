import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchITunes, getAnimation, diagnoseMotion, parseAppleMusicUrl, LRU } from './lib/artwork.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

const animCache = new LRU(100);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/search', async (req, res) => {
  const term = (req.query.term || '').toString();
  if (!term.trim()) return res.status(400).json({ error: 'missing term' });
  const limit = Math.min(Number(req.query.limit) || 25, 50);
  const includeAnim = req.query.animation !== '0' && req.query.animation !== 'false';
  try {
    const results = await searchITunes(term, { limit });
    if (includeAnim) {
      await Promise.all(results.map(async (r) => {
        if (!r.collectionId) return;
        const cacheKey = `album:${r.collectionId}`;
        const cached = animCache.get(cacheKey);
        if (cached !== undefined) {
          r.animation = cached.animation;
          r.audioTraits = cached.audioTraits;
          r.colors = cached.colors;
          return;
        }
        try {
          const data = await getAnimation({ id: r.collectionId, kind: 'album' });
          const animation = (data.best || data.bestTall) ? {
            best: data.best,
            bestTall: data.bestTall,
            square: data.square,
            tall: data.tall,
          } : null;
          const audioTraits = data.audioTraits || [];
          const colors = data.colors || null;
          animCache.set(cacheKey, { animation, audioTraits, colors });
          r.animation = animation;
          r.audioTraits = audioTraits;
          r.colors = colors;
        } catch {
          r.animation = null;
        }
      }));
    }
    res.json({ results });
  } catch (e) {
    console.error('[api/search]', e);
    res.status(502).json({ error: e.message || 'search failed' });
  }
});

// Diagnostic: GET /api/debug?id=<albumId>&kind=album  OR  ?term=<appleMusicUrl>
app.get('/api/debug', async (req, res) => {
  let id = (req.query.id || '').toString();
  let kind = (req.query.kind || 'album').toString();
  const term = (req.query.term || '').toString();
  if (term) {
    const parsed = parseAppleMusicUrl(term);
    if (parsed) { id = parsed.id; kind = parsed.kind === 'track' ? 'track' : 'album'; }
  }
  if (!id) return res.status(400).json({ error: 'provide id (+kind) or term' });
  try {
    const result = await diagnoseMotion({ id, kind });
    res.json({ id, kind, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message, stack: e.stack });
  }
});

// GitHub star count for the nav badge. Cached server-side so visitors don't
// each spend GitHub's 60-requests/hour unauthenticated limit.
const GITHUB_REPO = 'NopXx/apple-music-artwork-search';
const STARS_TTL_MS = 15 * 60 * 1000;
let starsCache = { stars: null, at: 0 };

app.get('/api/stars', async (req, res) => {
  if (starsCache.stars !== null && Date.now() - starsCache.at < STARS_TTL_MS) {
    return res.json({ stars: starsCache.stars });
  }
  try {
    const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}`, {
      headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'apple-music-artwork-search' },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) throw new Error(`GitHub HTTP ${r.status}`);
    const data = await r.json();
    starsCache = { stars: data.stargazers_count ?? null, at: Date.now() };
    res.json({ stars: starsCache.stars });
  } catch (e) {
    // Serve a stale count if we have one; otherwise the badge just stays hidden.
    res.json({ stars: starsCache.stars });
  }
});

app.listen(PORT, () => {
  console.log(`apple-music-artwork-search listening on http://localhost:${PORT}`);
});
