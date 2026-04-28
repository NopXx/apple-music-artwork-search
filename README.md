# Apple Music Artwork Search

ค้นหา artwork (รวมถึง animated artwork) ของเพลงบน Apple Music ผ่าน iTunes Search API
มาพร้อม REST API + หน้าเว็บ

## Run

```bash
npm install
npm start
# เปิด http://localhost:3000
```

ต้องการ Node.js >= 18

## API

### `GET /api/search?term=<query>&limit=25&animation=1`
ค้นหาเพลง พร้อม animated artwork (ถ้ามี) ในผลลัพธ์เดียวกัน

Query params:
- `term` (required) คำค้น
- `limit` จำนวนผลลัพธ์ (default 25, max 50)
- `animation` ใส่ `0` หรือ `false` เพื่อข้ามการดึง animation (ค้นเร็วขึ้น)

```json
{
  "results": [
    {
      "track": "Tití Me Preguntó",
      "artist": "Bad Bunny",
      "album": "Un Verano Sin Ti",
      "artwork": "https://.../600x600bb.jpg",
      "artworkHi": "https://.../1000x1000bb.jpg",
      "artworkUltra": "https://.../3000x3000bb.jpg",
      "trackViewUrl": "https://music.apple.com/...",
      "collectionViewUrl": "https://music.apple.com/...",
      "previewUrl": "https://...",
      "animation": {
        "best": "https://mvod.itunes.apple.com/...1080x1080-.mp4",
        "resolutions": {
          "2160p": "...", "1080p": "...", "768p": "...", "486p": "..."
        }
      }
    }
  ]
}
```

`animation` จะเป็น `null` ถ้าเพลง/อัลบั้มนั้นไม่มี motion artwork

## Deploy

- **Vercel**: `vercel --prod` (มี `vercel.json` ให้แล้ว)
- **Railway / Render / Fly.io**: connect repo, ใช้ `npm start`
- **VPS**: `node server.js` หรือใช้ pm2

## Credits

Logic หลักพอร์ตจากโปรเจค `apple-music/` (Python) → Node.js
