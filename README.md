# Dashboard Honor & Penugasan Petugas — Versi Statis

Versi ini berjalan **tanpa server dan tanpa database**. Seluruh data disimpan di
`localStorage` browser, lalu dapat diimpor dari file Excel dan diekspor kembali ke
Excel. Cocok di-hosting gratis sebagai situs statis (Vercel, Netlify, GitHub Pages).

> Data hanya tersimpan di browser yang dipakai. Data tidak otomatis tersinkron
> antar perangkat atau antar pengguna.

## Halaman

1. **Dashboard** — total honor, jumlah penugasan, jumlah petugas, grafik per bulan
   dan per jenis kegiatan.
2. **Daftar Penugasan** — tambah, ubah, hapus penugasan; nama pekerjaan bisa
   diketik bebas dengan saran (autocomplete).
3. **Rekap per Bulan** — matriks petugas × 12 bulan.
4. **Rekap per Jenis Kegiatan** — matriks petugas × jenis kegiatan.
5. **Daftar Jenis Kegiatan** — kelola jenis kegiatan.
6. **Data & Excel** — impor Excel, ekspor Excel, backup/pemulihan JSON, reset data.

Rekap tidak pernah disimpan. Semua angka dihitung ulang dari daftar penugasan
setiap kali halaman dimuat.

## Menjalankan secara lokal

```bash
npm install
npm run dev
```

Buka <http://localhost:3000>.

Folder `public/` juga bisa disajikan oleh web server statis apa pun. Aplikasi
memakai ES module dan path absolut (`/css`, `/js`), jadi sajikan dari akar situs.

## Alur pemakaian

1. Buka halaman **Data & Excel**.
2. Klik atau seret file `.xlsx` ke area impor.
3. Periksa pratinjau (jumlah baris, petugas, tahun, total honor, baris bermasalah).
4. Klik **Terapkan Impor**. Data lama ditimpa dan dibackup otomatis.
5. Setelah itu semua perubahan di web tersimpan otomatis di browser.
6. Untuk arsip atau pindah perangkat: **Unduh Sesuai Template Excel**,
   **Unduh Data Saja**, atau **Unduh Backup JSON**.

### Format Excel yang dibaca

Sheet `Data Penugasan` dengan header (baris dapat dicari otomatis):

| No. | Nama Petugas | Jenis Kegiatan | Nama Pekerjaan/Kegiatan | Bulan | Tahun | Honor (Rp) |
| --- | --- | --- | --- | --- | --- | --- |

- Bulan menerima nama (`Januari`…`Desember`), singkatan (`Jan`, `Feb`, …), atau angka 1–12.
- Honor menerima angka Excel maupun teks seperti `Rp 1.500.000`.
- Baris yang tidak valid dilewati dan ditampilkan pada pratinjau.
- Sheet `Referensi` (kolom A) dipakai untuk daftar jenis kegiatan; jenis baru dari
  data penugasan otomatis ditambahkan.

Sheet rekap/formula tidak dibaca. Rekap dihitung ulang di browser agar tidak
bergantung pada nilai cache formula Excel.

### File hasil ekspor

Ada dua tombol di halaman **Data & Excel**:

**Unduh Sesuai Template Excel** — mengisi ulang
`Template_Matriks_Penugasan_dan_Honor_Petugas.xlsx` (dibundel di
`public/data/template-matriks.xlsx`) sehingga dihasilkan 5 sheet lengkap:

- **Dashboard** dan **Rekap** tidak ditulis nilainya; formula aslinya dibiarkan
  hidup dan akan menghitung sendiri saat file dibuka di Excel.
- Tahun analisis (sel `B3` rekap) diisi dari tahun aktif.
- Nama petugas di kolom A kedua sheet rekap diisi otomatis dari petugas yang
  punya penugasan, diurutkan menurut nama.
- Header jenis kegiatan pada sheet **Rekap Jenis Kegiatan** disusun mengikuti
  daftar jenis di web.

Batas template: **300 baris** penugasan, **50 petugas**, dan **14 jenis
kegiatan**. Jika data melebihi batas, ekspor akan menolak dengan pesan yang
menyebutkan batas tersebut.

**Unduh Data Saja (2 sheet)** — hanya **Data Penugasan** (7 kolom) dan
**Referensi**, tanpa rekap. Cocok untuk impor ulang ke web atau diolah sendiri.

## Deploy ke Vercel

1. Push repositori ini ke GitHub.
2. Di Vercel: **Add New → Project**, pilih repositori.
3. Framework Preset: **Other**. Root Directory: biarkan kosong.
4. Build Command: kosongkan. Output Directory: `public`.
5. Deploy.

Atau lewat CLI:

```bash
npx vercel --prod
```

## Penyimpanan & keamanan

- Kunci `localStorage`: `dashboard-honor-v2`.
- Backup otomatis sebelum impor/pemulihan: `dashboard-honor-v2-backup`.
- Data hilang jika data situs dibersihkan, mode Incognito ditutup, atau browser
  berganti profil. Lakukan ekspor/backup berkala.
- Tidak ada login. Siapa pun yang membuka browser tersebut dapat melihat datanya.
- Kapasitas `localStorage` umumnya sekitar 5 MB — cukup untuk ribuan baris.

## Struktur proyek

```
public/
  index.html, penugasan.html, rekap-*.html,
  master-jenis.html, data.html
  css/style.css
  js/
    api.js             # adapter data (bentuk respons sama dengan API lama)
    store/
      penyimpanan.js   # localStorage, backup, normalisasi
      pivot.js         # perhitungan rekap
      excel.js         # impor/ekspor Excel (ExcelJS)
      saran-pekerjaan.js  # daftar saran nama kegiatan bawaan
    layout.js, format.js, bulan.js
    dashboard.js, penugasan.js, rekap-*.js,
    master-jenis.js, data.js
  vendor/exceljs.min.js
vercel.json
```

## Perbedaan dengan versi sebelumnya

| Versi lama | Versi ini |
| --- | --- |
| Express + MySQL | Statis, tanpa server |
| Data di database | Data di `localStorage` browser |
| Nama kegiatan dari master 73 item | Teks bebas + autocomplete |
| Input lewat API | Input langsung di browser |
| Belum ada impor/ekspor Excel | Impor & ekspor `.xlsx` |
