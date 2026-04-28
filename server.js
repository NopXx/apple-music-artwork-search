import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchITunes, getAnimation, LRU } from './lib/artwork.js';

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
          r.animation = cached;
          return;
        }
        try {
          const data = await getAnimation({ id: r.collectionId, kind: 'album' });
          const out = (data.best || data.bestTall) ? {
            best: data.best,
            bestTall: data.bestTall,
            square: data.square,
            tall: data.tall,
          } : null;
          animCache.set(cacheKey, out);
          r.animation = out;
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

app.listen(PORT, () => {
  console.log(`apple-music-artwork-search listening on http://localhost:${PORT}`);
});
