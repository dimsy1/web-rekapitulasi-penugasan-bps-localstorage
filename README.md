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
5. **Daftar Petugas** — kelola nama petugas (tambah, ubah, hapus, atur urutan).
   Urutan di sini sama dengan urutan baris pada rekap dan file Excel.
6. **Daftar Jenis Kegiatan** — kelola jenis kegiatan. Saat aplikasi pertama kali
   dipakai, daftar ini sudah berisi **10 jenis bawaan** dari sheet `Referensi`
   template Excel: Survei, Sensus, Pengolahan Data, Pembinaan Statistik Sektoral,
   Koordinasi, Administrasi, Pengawasan/Monitoring, Pengolahan dan Analisis,
   Diseminasi, dan Lainnya.
7. **Data & Excel** — impor Excel, ekspor Excel, unduh template kosong,
   backup/pemulihan JSON, reset data.

Rekap tidak pernah disimpan. Semua angka dihitung ulang dari daftar penugasan
setiap kali halaman dimuat. Semua petugas master ikut ditampilkan, termasuk yang
belum punya penugasan, sehingga tampilannya sama dengan kolom A sheet rekap Excel.

## Menjalankan secara lokal

```bash
npm install
npm run dev
```

Buka <http://localhost:3000>.

Folder `public/` juga bisa disajikan oleh web server statis apa pun. Aplikasi
memakai ES module dan path absolut (`/css`, `/js`), jadi sajikan dari akar situs.

## Alur pemakaian

Ada dua cara memulai:

**Mulai dari nol (data diisi lewat web)** — daftar jenis kegiatan sudah berisi
10 jenis bawaan, jadi langsung bisa menambah penugasan di halaman
**Daftar Penugasan**. Petugas baru otomatis dibuat saat namanya diketik.

**Mulai dari file Excel yang sudah ada**

1. Buka halaman **Data & Excel**.
2. Klik atau seret file `.xlsx` ke area impor.
3. Periksa pratinjau (jumlah petugas, jenis, tahun analisis B3, total honor, baris
   bermasalah, dan catatan bila ada nama yang tidak konsisten).
4. Klik **Terapkan Impor**. Data lama ditimpa dan dibackup otomatis.
5. Setelah itu semua perubahan di web tersimpan otomatis di browser.
6. Untuk arsip atau pindah perangkat: **Unduh Sesuai Template Excel**,
   **Unduh Data Saja**, atau **Unduh Backup JSON**.

Impor boleh dilakukan walau sheet `Data Penugasan` masih kosong, asalkan kolom A
sheet rekap atau sheet `Referensi` sudah berisi data. Jadi alur yang disarankan:

1. Klik **Unduh Template Kosong** di halaman **Data & Excel**, lalu isi nama
   petugas pada kolom A sheet **Rekap Honor Bulanan** dan **Rekap Jenis Kegiatan**
   di Excel (dan ubah kolom A sheet `Referensi` bila perlu).
2. Impor file tersebut ke web — daftar petugas dan jenis langsung terisi.
3. Isi penugasan lewat halaman **Daftar Penugasan** (atau rapikan daftar di
   halaman **Daftar Petugas**).
4. Ekspor dengan **Unduh Sesuai Template Excel**; hasilnya memakai struktur file
   yang tadi diimpor, dengan nama petugas dan jenis yang sudah diperbarui.

Bila hanya ingin memakai daftar jenis dari file lama, cukup sisakan sheet
`Referensi` yang berisi daftar jenis (sheet lain boleh kosong), lalu impor dan
terapkan. Daftar jenis bisa langsung diedit/ditambah di halaman **Daftar Jenis
Kegiatan**.

Catatan: **Kosongkan** menghapus penugasan, petugas, dan jenis kegiatan sekaligus.
Jenis bawaan hanya muncul otomatis saat aplikasi belum pernah menyimpan data,
jadi setelah dikosongkan jenis perlu ditambahkan lagi secara manual. File template
yang pernah diimpor tetap dipakai sebagai cetakan ekspor sampai Anda mengimpor
file lain.

### Format Excel yang dibaca

Yang dibaca dari file template:

- Sheet `Data Penugasan` — daftar penugasan, satu baris per petugas per kegiatan.
- Sheet `Referensi` kolom A — daftar jenis kegiatan (sumber utama).
- Sheet `Rekap Honor Bulanan` kolom A (baris 6 ke bawah) — daftar nama petugas.
- Sheet `Rekap Jenis Kegiatan` kolom A — daftar nama petugas.
- Sheet `Rekap Jenis Kegiatan` baris 5 (kolom B dst) — judul kolom jenis kegiatan.
- Sheet `Rekap Honor Bulanan` sel `B3` — tahun analisis.

Header sheet `Data Penugasan` dicari otomatis:

| No. | Nama Petugas | Jenis Kegiatan | Nama Pekerjaan/Kegiatan | Bulan | Tahun | Honor (Rp) |
| --- | --- | --- | --- | --- | --- | --- |

- Bulan menerima nama (`Januari`…`Desember`), singkatan (`Jan`, `Feb`, …), atau angka 1–12.
- Honor menerima angka Excel maupun teks seperti `Rp 1.500.000`.
- Baris yang tidak valid dilewati dan ditampilkan pada pratinjau.
- Urutan nama petugas mengikuti urutan yang Anda tulis di kolom A sheet rekap.
- Bila nama hanya ada di salah satu sheet rekap, atau jumlahnya melebihi kapasitas
  template, pratinjau menampilkan peringatan (impor tetap bisa dilanjutkan).

Untuk daftar jenis kegiatan berlaku aturan berikut:

- **Sheet `Referensi` adalah sumber utama.** Bila sheet `Referensi` berisi daftar
  (baris 3 ke bawah), hanya daftar itulah yang dipakai; judul kolom sheet
  `Rekap Jenis Kegiatan` diabaikan dan diperbarui otomatis saat ekspor.
- Bila `Referensi` kosong, judul kolom sheet `Rekap Jenis Kegiatan` dipakai
  sebagai daftar jenis.
- Jenis yang masih dipakai di `Data Penugasan` tetapi tidak ada di `Referensi`
  tetap ditambahkan agar penugasan tidak yatim, dan hal ini diberi peringatan.
- Jumlah jenis dibatasi kapasitas kolom file template.

#### Impor file yang hanya berisi sheet `Referensi`

File yang seluruh isinya kosong kecuali sheet `Referensi` tetap bisa diimpor:
pratinjau menampilkan **0 baris penugasan** dan **0 petugas**, tombol berubah
menjadi **Terapkan Daftar Jenis**, dan setelah diterapkan halaman **Daftar Jenis
Kegiatan** berisi persis daftar dari `Referensi`. Daftar itu bisa ditambah, diubah,
atau dihapus di web, lalu **Unduh Sesuai Template Excel** akan menuliskan daftar
baru ke sheet `Referensi` dan judul kolom sheet `Rekap Jenis Kegiatan` sekaligus
membersihkan sisa baris/kolom daftar lama.

Nilai dan formula pada sheet rekap tidak dipakai; rekap dihitung ulang di browser
agar tidak bergantung pada nilai cache formula Excel.

### File hasil ekspor

Ada dua tombol di halaman **Data & Excel**:

**Unduh Sesuai Template Excel** — memakai file template yang terakhir diimpor
sebagai cetakan (bila belum pernah impor, dipakai template bawaan
`public/data/template-matriks.xlsx`), sehingga dihasilkan 5 sheet lengkap:

- **Dashboard** dan **Rekap** tidak ditulis nilainya; formula aslinya dibiarkan
  hidup dan akan menghitung sendiri saat file dibuka di Excel.
- Tahun analisis (sel `B3` rekap) diisi dari tahun aktif.
- Nama petugas di kolom A kedua sheet rekap diisi **semua petugas** (termasuk yang
  belum punya penugasan) mengikuti urutan pada halaman **Daftar Petugas**.
- Header jenis kegiatan pada sheet **Rekap Jenis Kegiatan** disusun mengikuti
  daftar jenis di web.
- Formula total per baris diperbaiki (template asli selalu menunjuk baris pertama).

Batas mengikuti file template yang dipakai. Template bawaan menampung **300 baris**
penugasan, **100 petugas** (baris 6–105, TOTAL di baris 107), dan **10 kolom jenis**
kegiatan (kapasitas terbaca **13 jenis** karena kolom Total Honor bisa bergeser).
Bila data melebihi kapasitas file template, ekspor menolak dengan pesan yang
menyebutkan batasnya.

**Unduh Template Kosong** — mengunduh template bawaan yang masih kosong, untuk
diisi nama petugas di kolom A sheet rekap lalu diimpor kembali.

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
- Cetakan ekspor (file template terakhir yang diimpor): `dashboard-honor-v2-template`.
- Data hilang jika data situs dibersihkan, mode Incognito ditutup, atau browser
  berganti profil. Lakukan ekspor/backup berkala.
- Tidak ada login. Siapa pun yang membuka browser tersebut dapat melihat datanya.
- Kapasitas `localStorage` umumnya sekitar 5 MB — cukup untuk ribuan baris.

## Struktur proyek

```
public/
  index.html, penugasan.html, rekap-*.html,
  petugas.html, master-jenis.html, data.html
  css/style.css
  js/
    api.js             # adapter data (bentuk respons sama dengan API lama)
    store/
      penyimpanan.js   # localStorage, backup, normalisasi, file template
      pivot.js         # perhitungan rekap
      excel.js         # impor/ekspor Excel (ExcelJS)
      saran-pekerjaan.js  # daftar saran nama kegiatan bawaan
    layout.js, format.js, bulan.js
    dashboard.js, penugasan.js, rekap-*.js,
    petugas.js, master-jenis.js, data.js
  vendor/exceljs.min.js
  data/template-matriks.xlsx   # template bawaan 100 baris petugas
tools/
  buat-template.mjs  # membangun ulang template bawaan dari template BPS
tests/
  smoke-test.mjs, template-test.mjs
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
