# Apple Music Artwork Search

Search Apple Music artwork — high-resolution stills (up to 3000×3000) and **animated artwork** in both **square 1:1** and **tall 9:16** orientations — via the iTunes Search/Lookup API and Apple's `amp-api`.

A small REST API plus a Liquid Glass–style web UI with a mini-player modal modelled on [Musique](https://github.com/NopXx/Musique).

## Features

### Search & data

- Search by **keyword** (track / artist / album) or paste an **Apple Music URL** directly
- Still artwork at 600 / 1000 / 3000 px
- Every available animated-artwork resolution (e.g. 486p / 768p / 1080p / 2160p), auto-split into square / tall
- **Audio quality** per release from Apple: Lossless, Hi-Res Lossless, Dolby Atmos (`audioTraits`)
- **Artwork palette** per release from Apple (`bgColor`, `textColor1–4`) — drives the player's colours
- 30-second **audio preview** URL for each track
- Motion data and quality come straight from Apple's `amp-api` in a single request per album — no third-party services

### Web UI

- **Liquid Glass** look (iOS 26): floating glass nav, search capsule, chips, filter and cards over an ambient backdrop that takes its colours from the covers in your results; light and dark themes
- Results grid with an **All / Motion / Static** filter
- **Player modal** (after Musique's mini player):
  - *Classic* layout — the cover blurred as a backdrop over the artwork's palette, white text over a dark bottom fade
  - *Immersive* layout for tall 9:16 motion — the video runs full bleed from the top at its own aspect ratio
  - Preview player with scrubber, countdown, and volume / mute (remembered)
  - Glass tab bar for **Still / 1:1 / 9:16** — tap, or press and drag the lens across it; the choice is remembered for the next track
  - Motion plays a small display variant that starts buffering as soon as the card opens; the still cover shows until the first frame; downloads keep the full-size file
  - Quality line (`LOSSLESS · DOLBY ATMOS`), scrolling title/artist when too long, prev / next to browse results
  - Copy-link and close in a glass capsule, an " Music" button to open the track, and a ⋯ menu with Download, Copy URL and size / motion options
- GitHub button in the nav shows the repo's star count

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
| `animation` | | `1` | Set to `0` / `false` to skip the `amp-api` lookup (faster; no `animation`, `audioTraits` or `colors`) |

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

# Skip the amp-api lookup for faster results
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
      },
      "audioTraits": ["atmos", "lossless", "lossy-stereo", "spatial"],
      "colors": {
        "bg": "#eaeaea",
        "text1": "#101010",
        "text2": "#292929",
        "text3": "#3b3b3b",
        "text4": "#4f4f4f"
      }
    }
  ]
}
```

- `animation` is `null` when the album has no motion artwork; `animation.tall` is `{}` when only a square version exists.
- `audioTraits` lists what Apple offers for the album. Values seen: `lossy-stereo`, `lossless`, `hi-res-lossless`, `atmos`, `spatial`. It says which tiers exist, not the exact bit depth / sample rate.
- `colors` is Apple's palette for the cover: `bg` is the dominant background, `text1–4` are text colours chosen to read on it. `null` if unavailable.

## How it works

1. **Search**: keyword → `https://itunes.apple.com/search` · URL → `https://itunes.apple.com/lookup?id=<id>`
2. **Still artwork**: take `artworkUrl100` and swap `100x100bb.jpg` for the requested size (Apple CDN URL trick)
3. **Album details from `amp-api`** (one request per album):
   - Extract the Apple Music developer JWT from `music.apple.com`'s JS bundle (cached in memory until expiry)
   - Call `https://amp-api.music.apple.com/v1/catalog/us/albums/<id>?extend=editorialVideo,audioTraits`
   - From the same response, read `audioTraits` and the artwork palette (`attributes.artwork.bgColor`, `textColor1–4`)
4. **Animated artwork**:
   - Read every master m3u8 from `editorialVideo` (`motionDetailSquare`, `motionDetailTall`, etc.)
   - For each master: parse `#EXT-X-STREAM-INF` + `RESOLUTION=WxH`, then turn `.m3u8` → `-.mp4` (handles the `_-.m3u8` → `_-.mp4` case too)
   - Bucket variants by orientation (`height > width` → tall) and pick the best per resolution
5. In-memory LRU cache (100 albums) for motion, quality and palette

## Deploy

- **Vercel**: `vercel --prod` (a `vercel.json` is included)
- **Railway / Render / Fly.io**: connect the repo and use `npm start`
- **VPS**: `node server.js` or behind pm2

## License

MIT
