# Apple Music Artwork Search

ค้นหา artwork ของเพลงบน Apple Music — ทั้งรูปนิ่งความละเอียดสูง (สูงสุด 3000×3000) และ **animated artwork** (ทั้งแบบ **square 1:1** และ **tall 9:16**) ผ่าน iTunes Search/Lookup API + master m3u8 playlist

มาพร้อม REST API endpoint เดียว + หน้าเว็บใช้งานได้ทันที

## Features

- ค้นหาด้วย **คำค้น** (ชื่อเพลง / ศิลปิน / อัลบั้ม) หรือ **วาง URL** ของ Apple Music ตรงๆ ก็ได้
- คืน artwork หลายขนาด: 600 / 1000 / 3000 px
- ดึง **animated artwork** ทุก resolution ที่มี (486p / 768p / 1080p / 2160p) แยกตามแนว square / tall อัตโนมัติ
- หน้าเว็บ: grid + modal มีปุ่มเลือกขนาด, สลับ Square ↔ Tall, ดาวน์โหลด, copy URL

## Run

```bash
npm install
npm start
# เปิด http://localhost:3000
```

ต้องการ Node.js ≥ 18

## API

### `GET /api/search`

Query params:

| param | required | default | description |
|---|---|---|---|
| `term` | ✅ | — | คำค้น **หรือ** Apple Music URL (album/track) |
| `limit` | | `25` | จำนวนผลลัพธ์ (max 50) — ถ้าใส่ URL จะคืนได้แค่ 1 รายการที่ตรง |
| `animation` | | `1` | ใส่ `0` / `false` เพื่อข้ามการดึง animation (ค้นเร็วขึ้น) |

#### รองรับ URL รูปแบบ

```
https://music.apple.com/<cc>/album/<slug>/<albumId>             # ทั้งอัลบั้ม
https://music.apple.com/<cc>/album/<slug>/<albumId>?i=<trackId> # เพลงเดียว
https://music.apple.com/<cc>/song/<slug>/<trackId>
```

URL จะถูก resolve ผ่าน iTunes Lookup API เพื่อให้ได้ผลตรงเป๊ะ (ไม่ใช้ fuzzy search)

#### ตัวอย่าง

```bash
# ค้นหาด้วยคำ
curl 'http://localhost:3000/api/search?term=bad%20bunny%20verano%20sin%20ti&limit=5'

# วาง URL อัลบั้ม
curl 'http://localhost:3000/api/search?term=https://music.apple.com/us/album/un-verano-sin-ti/1622045624'

# ข้าม animation ให้เร็วขึ้น
curl 'http://localhost:3000/api/search?term=anti-hero&animation=0'
```

#### Response

```json
{
  "results": [
    {
      "id": 1622046238,
      "track": "Tití Me Preguntó",
      "artist": "Bad Bunny",
      "album": "Un Verano Sin Ti",
      "artwork": "https://.../600x600bb.jpg",
      "artworkHi": "https://.../1000x1000bb.jpg",
      "artworkUltra": "https://.../3000x3000bb.jpg",
      "trackViewUrl": "https://music.apple.com/...",
      "collectionViewUrl": "https://music.apple.com/...",
      "previewUrl": "https://audio-ssl.itunes.apple.com/.../mzaf_*.m4a",
      "releaseDate": "2022-05-06T07:00:00Z",
      "animation": {
        "best":     "https://mvod.itunes.apple.com/.../1080x1080-.mp4",
        "bestTall": "https://mvod.itunes.apple.com/.../664x886-.mp4",
        "square": {
          "486p": "...", "768p": "...", "1080p": "...", "2160p": "..."
        },
        "tall": {
          "414p": "...", "648p": "...", "1108p": "...", "2216p": "..."
        }
      }
    }
  ]
}
```

`animation` เป็น `null` ถ้าเพลง/อัลบั้มนั้นไม่มี motion artwork
`animation.tall` เป็น `{}` ถ้าไม่มีเวอร์ชันแนวตั้ง (มีเฉพาะบางอัลบั้ม)

## How it works

1. **คำค้น** → `https://itunes.apple.com/search` / **URL** → `https://itunes.apple.com/lookup?id=...`
2. รูป artwork: ใช้ `artworkUrl100` แล้วแทน `100x100bb.jpg` ด้วยขนาดที่ต้องการ (CDN trick)
3. Animated artwork:
   - Scrape หน้า `music.apple.com/<album>` หา `*.m3u8` master playlist (square)
   - เรียก `api.aritra.ovh/v1/covers` เพื่อหา `master.tall` (portrait)
   - Parse ทั้งสอง playlist อ่าน `#EXT-X-STREAM-INF` + `RESOLUTION=WxH` แล้วแปลง `.m3u8` → `-.mp4` (รวมเคส `_-.m3u8` → `_-.mp4`)
   - แยก variant ตามแนว (`height > width` = tall) และเลือกขนาดที่ดีที่สุด
4. Cache in-memory (LRU 100 entries) ลด latency request ซ้ำ

## Deploy

- **Vercel**: `vercel --prod` (มี `vercel.json` ให้แล้ว)
- **Railway / Render / Fly.io**: connect repo, ใช้ `npm start`
- **VPS**: `node server.js` หรือใช้ pm2

## License

MIT
