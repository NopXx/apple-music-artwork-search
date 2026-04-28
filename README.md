# Apple Music Artwork Search

Search Apple Music artwork — high-resolution stills (up to 3000×3000) and **animated artwork** in both **square 1:1** and **tall 9:16** orientations — via the iTunes Search/Lookup API and Apple's `amp-api`.

Single REST endpoint + ready-to-use web UI.

## Features

- Search by **keyword** (track / artist / album) or paste an **Apple Music URL** directly
- Multiple artwork sizes: 600 / 1000 / 3000 px
- Pulls every available animated-artwork resolution (e.g. 486p / 768p / 1080p / 2160p) and auto-splits into square / tall
- Sources motion data straight from Apple's `amp-api` — no third-party services
- Web UI: grid + modal with size picker, Square ↔ Tall toggle, download, copy URL

## Run

```bash
npm install
npm start
# open http://localhost:3000
```

Requires Node.js ≥ 18.

## API

### `GET /api/search`

Query params:

| param | required | default | description |
|---|---|---|---|
| `term` | ✅ | — | Search keyword **or** an Apple Music URL (album / track) |
| `limit` | | `25` | Max results (capped at 50). Ignored when `term` is a URL — always returns one match |
| `animation` | | `1` | Set to `0` / `false` to skip animated-artwork lookup (faster) |

#### Supported URL formats

```
https://music.apple.com/<cc>/album/<slug>/<albumId>             # whole album
https://music.apple.com/<cc>/album/<slug>/<albumId>?i=<trackId> # single track
https://music.apple.com/<cc>/song/<slug>/<trackId>
```

URLs are resolved via the iTunes Lookup API for an exact match (no fuzzy search).

#### Examples

```bash
# Keyword search
curl 'http://localhost:3000/api/search?term=ive%20blackhole&limit=5'

# Paste an album URL
curl 'http://localhost:3000/api/search?term=https://music.apple.com/us/album/_/1873882195'

# Skip animation for faster results
curl 'http://localhost:3000/api/search?term=ive&animation=0'
```

#### Response

```json
{
  "results": [
    {
      "id": 1873882196,
      "trackId": 1873882196,
      "collectionId": 1873882195,
      "track": "BLACKHOLE",
      "artist": "IVE",
      "album": "IVE EMPATHY - EP",
      "artwork": "https://.../600x600bb.jpg",
      "artworkHi": "https://.../1000x1000bb.jpg",
      "artworkUltra": "https://.../3000x3000bb.jpg",
      "trackViewUrl": "https://music.apple.com/us/album/blackhole/1873882195?i=1873882196",
      "collectionViewUrl": "https://music.apple.com/us/album/ive-empathy-ep/1873882195",
      "previewUrl": "https://audio-ssl.itunes.apple.com/.../mzaf_*.m4a",
      "releaseDate": "2025-04-25T00:00:00Z",
      "animation": {
        "best":     "https://mvod.itunes.apple.com/.../1080x1080-.mp4",
        "bestTall": "https://mvod.itunes.apple.com/.../664x886-.mp4",
        "square": {
          "360p": "...", "408p": "...", "456p": "...", "486p": "...",
          "768p": "...", "960p": "...", "1080p": "...", "1920p": "...", "2160p": "..."
        },
        "tall": {
          "414p": "...", "470p": "...", "526p": "...", "582p": "...",
          "648p": "...", "886p": "...", "1106p": "...", "1108p": "...",
          "1438p": "...", "1440p": "...", "2216p": "...", "2732p": "..."
        }
      }
    }
  ]
}
```

`animation` is `null` when the album has no motion artwork.
`animation.tall` is `{}` when only a square version exists.

## How it works

1. **Search**: keyword → `https://itunes.apple.com/search` · URL → `https://itunes.apple.com/lookup?id=<id>`
2. **Still artwork**: take `artworkUrl100` and swap `100x100bb.jpg` for the requested size (Apple CDN URL trick)
3. **Animated artwork**:
   - Extract the Apple Music developer JWT from `music.apple.com`'s JS bundle (cached in memory until expiry)
   - Call `https://amp-api.music.apple.com/v1/catalog/us/albums/<id>?extend=editorialVideo`
   - Read every master m3u8 from `editorialVideo` (`motionDetailSquare`, `motionDetailTall`, etc.)
   - For each master: parse `#EXT-X-STREAM-INF` + `RESOLUTION=WxH`, then turn `.m3u8` → `-.mp4` (handles the `_-.m3u8` → `_-.mp4` case too)
   - Bucket variants by orientation (`height > width` → tall) and pick the best per resolution
4. In-memory LRU cache (100 entries) for repeated lookups

## Deploy

- **Vercel**: `vercel --prod` (a `vercel.json` is included)
- **Railway / Render / Fly.io**: connect the repo and use `npm start`
- **VPS**: `node server.js` or behind pm2

## License

MIT
