# Kerang Ajaib

Director AI untuk ide dan skrip video pendek (TikTok, Reels, Shorts). Kamu ceritakan siapa kreatornya, karakter dan ciri khasnya, data views, topik, produk keranjang kuning, dan foto pendukung. Kerang Ajaib menyusun ide yang anti mainstream, lengkap dengan hook 3 detik, shot list per detik, momen catchphrase, integrasi keranjang kuning, pemicu komentar, caption, dan persiapan syuting.

## Cara menjalankan

1. Butuh Node.js 24.
2. Salin `.env.example` menjadi `.env`, lalu isi `ANTHROPIC_API_KEY` (dari https://console.anthropic.com).
3. Jalankan:

   ```bash
   npm install
   npm start
   ```

4. Buka http://localhost:3000 (landing page), daftar akun, lalu masuk ke studio di `/app`.

Mau coba tampilan tanpa API key? Jalankan dengan `KERANG_MOCK=1` di `.env`. Semua alur jalan, tapi hasilnya respons contoh, bukan AI.

## Deploy ke Vercel

1. Di Vercel: **Add New Project**, pilih repo GitHub ini. Framework preset biarkan otomatis (Express terdeteksi dari `server.js`), tidak perlu build command.
2. Database: buka tab **Storage** di project Vercel, pilih **Neon** (Postgres) dari Marketplace, lalu hubungkan ke project. Vercel otomatis mengisi `DATABASE_URL`. Tabel dibuat sendiri saat request pertama.
3. Deploy. Tanpa `ANTHROPIC_API_KEY` web sudah bisa dijelajahi: landing page, daftar, masuk, simpan kreator, lihat riwayat. Tombol generate akan memberi tahu bahwa AI belum disambungkan.
4. Kalau API key sudah ada: **Settings > Environment Variables**, tambahkan `ANTHROPIC_API_KEY`, lalu **Redeploy**.

Catatan Vercel:
- Kalau `DATABASE_URL` belum diisi, data disimpan sementara di `/tmp` dan bisa hilang kapan saja. Sambungkan Neon sebelum dipakai orang lain.
- Batas waktu fungsi di paket Hobby 5 menit per generate. Kalau sering terpotong (misalnya riset tren + 5 ide), turunkan `KERANG_EFFORT` ke `medium` atau kurangi jumlah ide.
- Body request dibatasi sekitar 4,5 MB, jadi foto otomatis dikecilkan (maksimal 6 foto).

## Struktur

| File | Isi |
|---|---|
| `prompts/director.js` | "Otak" Kerang Ajaib: teori viral, tes wajib tiap ide, klise yang dihindari, format jawaban. Ubah di sini kalau mau mengubah cara director berpikir. |
| `prompts/brief.js` | Mengubah isian form menjadi brief terstruktur + lampiran foto. |
| `server.js` | API akun, persona, riwayat, dan `/api/generate` (streaming, web search opsional, revisi). |
| `lib/db.js` | Database: Postgres kalau `DATABASE_URL` diisi, selain itu SQLite bawaan Node (`data/kerang.db`). |
| `lib/auth.js` | Password (scrypt) dan sesi login lewat cookie httpOnly, berlaku 30 hari. |
| `lib/memory.js` | "Memori Kerang": ringkasan 10 konten terakhir per kreator + hasil tayang yang dilaporkan, disisipkan ke setiap brief baru. |
| `public/` | Landing page (`/`), masuk/daftar (`/masuk`), studio (`/app`). |

## Cara Kerang "mengingat" kreator

Setiap akun bisa punya beberapa persona kreator. Tiap kali brief dibuat untuk persona itu, Kerang menerima ringkasan konten sebelumnya: judul, ide yang diusulkan, status (belum direkam, sudah tayang, dll), views, dan catatan kreator. Dari situ Kerang menghindari ide yang sama, belajar dari yang berhasil, dan bisa menyambung jadi series. Makin rajin user melapor hasil tayang, makin tajam arahannya.

## Pengaturan opsional (`.env`)

- `KERANG_MODEL` : default `claude-opus-5`
- `KERANG_EFFORT` : `low`, `medium`, `high` (default), `xhigh`, `max`. Makin tinggi makin dalam mikirnya, makin lama dan mahal.
- `PORT` : default `3000`

## Catatan

- Lokal tanpa `DATABASE_URL`, semua data tersimpan di `data/kerang.db`.
- Kalau dipasang online, jalankan dengan `NODE_ENV=production` di balik HTTPS supaya cookie login ditandai secure.
- Riset tren otomatis memakai web search Claude dan ditagih terpisah per pencarian (maksimal 5 per permintaan).
- Skor di hasil adalah estimasi director, bukan prediksi views.
