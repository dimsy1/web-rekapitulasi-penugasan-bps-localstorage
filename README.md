# Dashboard Honor & Penugasan Petugas — PHP + MySQL

Aplikasi web untuk mencatat penugasan petugas BPS beserta honornya, menghitung
rekap bulanan/jenis di browser, dan bertukar data lewat file Excel. Data disimpan
di **database MySQL** melalui API PHP, sehingga semua admin melihat data yang sama
dari perangkat mana pun.

- **Database lokal**: MySQL Laragon, database `db_selaras`.
- **Login**: username + password, sesi disimpan di server (cookie `HttpOnly`).
- **Rekap** tidak disimpan di database; selalu dihitung ulang dari daftar penugasan.
- **Mode lokal** (`?mode=lokal`) masih tersedia untuk demo tanpa PHP dan dipakai
  oleh `npm test`.

> Fokus proyek saat ini adalah pengembangan lokal dengan Laragon.

## Arsitektur singkat

```
Browser (public/)  ──fetch JSON──▶  PHP /api/api.php  ──PDO──▶  MySQL
    │                                     │
    └── rekap & dashboard dihitung        └── validasi, sesi, log aktivitas
        di browser dari dataset
```

Satu kali per halaman, browser mengambil seluruh dataset lewat `aksi=bootstrap`,
lalu semua perhitungan memakai `public/js/store/komputasi.js`. Setiap perubahan
dikirim per baris ke API dan API mengembalikan dataset terbaru, sehingga dua admin
tidak saling menimpa tanpa terlihat.

## Halaman

1. **Dashboard** — total honor, jumlah penugasan, jumlah petugas, grafik per bulan
   dan per jenis kegiatan.
2. **Daftar Penugasan** — tambah, ubah, hapus penugasan; nama pekerjaan bisa
   diketik bebas dengan saran (autocomplete).
3. **Rekap per Bulan** — matriks petugas × 12 bulan.
4. **Rekap per Jenis Kegiatan** — matriks petugas × jenis kegiatan.
5. **Daftar Petugas** — kelola nama petugas (tambah, ubah, hapus). Urutan baris
   mengikuti file Excel yang diimpor, dan petugas baru otomatis masuk di akhir.
6. **Daftar Jenis Kegiatan** — kelola jenis kegiatan. Daftar ini **kosong** pada
   pemakaian pertama dan terisi dari file Excel yang diimpor (sheet `Referensi`,
   atau judul kolom sheet `Rekap Jenis Kegiatan` bila Referensi kosong). Jenis juga
   bisa ditambah/diubah manual di halaman ini.
7. **Data & Excel** — impor Excel, ekspor Excel, unduh template kosong, reset data.

Rekap tidak pernah disimpan. Semua angka dihitung ulang dari daftar penugasan
setiap kali halaman dimuat. Semua petugas master ikut ditampilkan, termasuk yang
belum punya penugasan, sehingga tampilannya sama dengan kolom A sheet rekap Excel.

## Menjalankan secara lokal

### Uji otomatis (tanpa server)

```bash
npm install
npm test
```

Uji memakai adapter **lokal** (`localStorage`) sehingga tidak butuh PHP/MySQL.

### Menjalankan aplikasi lokal dengan database

```bash
npm run dev
```

Buka <http://127.0.0.1:8000/>. Perintah ini otomatis menyiapkan database
`db_selaras`, mengimpor skema jika diperlukan, lalu menjalankan PHP router.
Pastikan MySQL Laragon aktif.

Mode server adalah default pada browser lokal. `?mode=lokal` masih tersedia bila
ingin menguji penyimpanan browser secara terpisah. Jika hanya ingin menyajikan
frontend statis tanpa PHP, gunakan `npm run dev:static` dan buka port 3000.

Konfigurasi lokal pada `api/config.php` memakai host `127.0.0.1`, database
`db_selaras`, user `root`, dan password kosong (pengaturan standar Laragon).
Jika instalasi Laragon Anda memakai password, ubah `db_pass` di file tersebut.

Saat mode server aktif, aplikasi tidak memakai `localStorage` untuk dataset,
penugasan, petugas, jenis kegiatan, backup, atau template. Sisa data dari mode
lokal akan dihapus otomatis dari browser; sumber data aktif adalah MySQL
`db_selaras`.

Folder `public/` memakai ES module dan path absolut (`/css`, `/js`), jadi harus
disajikan dari akar situs.

## Login dan akun admin

- Saat pertama kali dijalankan, aplikasi membuat akun lokal `admin` dengan
  password awal `admin12345`.
- Menambah admin baru:

  ```bash
  npm run admin
  ```

  Isi username dan password (minimal 8 karakter). Bisa juga langsung:

  ```bash
  php tools/tambah-admin.php username password123
  ```

  Akun baru langsung aktif dan tercatat di tabel `admin`.
- Mengganti password admin (semua sesi lama otomatis berakhir):

  ```bash
  npm run sandi
  ```

  Atau langsung: `php tools/ganti-sandi.php username password-baru`.
- Username harus unik; password disimpan sebagai hash `password_hash` (bcrypt)
  dan diverifikasi dengan `password_verify`.
- Sesi berupa token acak 32 byte; yang disimpan di database hanya hash SHA-256-nya,
  dan browser memegangnya lewat cookie `HttpOnly` + `SameSite=Lax` (Secure saat HTTPS).
- Percobaan login dibatasi 8 kali per 15 menit per IP/username.
- Semua aksi yang mengubah data wajib `POST` + header `X-Requested-With:
  dashboard-honor`. Permintaan `GET` hanya untuk membaca data, sehingga tautan
  dari situs lain tidak bisa menghapus atau mengubah data.
- Setiap perubahan data dicatat di tabel `log` dan bisa dilihat di halaman
  **Data & Excel** pada panel **Admin & log aktivitas**.

## Alur pemakaian

Ada dua cara memulai:

**Mulai dari nol (data diisi lewat web)** — daftar jenis kegiatan masih kosong.
Tambahkan jenis lebih dulu di halaman **Daftar Jenis Kegiatan** (atau impor file
Excel), lalu isi penugasan di halaman **Daftar Penugasan**. Petugas baru otomatis
dibuat saat namanya diketik.

**Mulai dari file Excel yang sudah ada**

1. Buka halaman **Data & Excel**.
2. Pilih atau seret satu atau beberapa file `.xlsx` ke area impor.
3. Periksa pratinjau (jumlah petugas, jenis, tahun analisis B3, total honor, baris
   bermasalah, dan catatan bila ada nama yang tidak konsisten).
4. Klik **Impor Data** untuk menambahkan hasil impor ke database.
5. Setelah itu semua perubahan di web langsung tersimpan di database dan terlihat
   oleh admin lain (muat ulang otomatis saat tab kembali aktif).
6. Untuk arsip: **Unduh sesuai template Excel**.

Nama petugas dan jenis kegiatan yang sama berbagi satu entri, dengan mengabaikan
kapitalisasi dan perbedaan spasi. Setiap baris penugasan ditambahkan, termasuk
jika file yang sama diimpor ulang. Jika sebuah file gagal dibaca, pratinjau
menampilkan nama file dan alasannya. File lain yang berhasil dibaca tetap bisa digabungkan.

Impor boleh dilakukan walau sheet `Data Penugasan` masih kosong, asalkan kolom A
sheet rekap atau sheet `Referensi` sudah berisi data. Jadi alur yang disarankan:

1. Klik **Unduh Template Kosong** di halaman **Data & Excel**, lalu isi nama
   petugas pada kolom A sheet **Rekap Honor Bulanan** dan **Rekap Jenis Kegiatan**
   di Excel (dan ubah kolom A sheet `Referensi` bila perlu).
2. Impor file tersebut ke web — daftar petugas dan jenis langsung terisi.
3. Isi penugasan lewat halaman **Daftar Penugasan** (atau rapikan daftar di
   halaman **Daftar Petugas**). Baris yang baru berisi nama petugas dan nama
   pekerjaan tetap masuk, lalu dilengkapi dengan filter **Belum lengkap**.
4. Ekspor dengan **Unduh Sesuai Template Excel**; hasilnya memakai struktur file
   yang tadi diimpor, dengan nama petugas dan jenis yang sudah diperbarui.

Bila hanya ingin memakai daftar jenis dari file lama, cukup sisakan sheet
`Referensi` yang berisi daftar jenis (sheet lain boleh kosong), lalu impor dan
terapkan. Daftar jenis bisa langsung diedit/ditambah di halaman **Daftar Jenis
Kegiatan**.

Catatan: **Kosongkan** menghapus penugasan, petugas, dan jenis kegiatan sekaligus.
Daftar jenis tidak pernah diisi otomatis, jadi setelah dikosongkan jenis perlu
diimpor ulang atau ditambahkan manual. File template yang pernah diimpor tetap
dipakai sebagai cetakan ekspor sampai Anda mengimpor file lain.

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
- **Hanya Nama Petugas yang wajib.** Kolom lain boleh kosong: baris tetap diimpor
  sebagai **belum lengkap** dan bisa dilengkapi di web.
- Tahun yang kosong ditempatkan pada tahun analisis `B3` agar baris tetap muncul.
- Baris yang benar-benar tidak valid (misalnya bulan salah tulis) dilewati dan
  ditampilkan pada pratinjau.
- Urutan nama petugas mengikuti urutan yang Anda tulis di kolom A sheet rekap.
- Impor membaca seluruh baris yang terisi, termasuk nama di luar rentang formula
  rekap. Baris berlabel `TOTAL` dilewati.
- Bila jumlah petugas atau penugasan melebihi kapasitas ekspor template,
  pratinjau menampilkan peringatan dan impor tetap bisa dilanjutkan.

#### Baris belum lengkap

Baris yang jenis kegiatan, pekerjaan, bulan, atau honor-nya masih kosong tetap
disimpan dan diberi tanda **Belum lengkap** di halaman **Daftar Penugasan**
(kolom kosong ditampilkan sebagai *Belum diisi*). Gunakan filter status:

- **Semua status** — semua baris.
- **Belum lengkap** — hanya baris yang masih ada kolom kosong, untuk dirapikan.
- **Lengkap** — hanya baris yang sudah terisi penuh.

Tombol **Ubah** pada baris seperti ini membuka formulir yang boleh disimpan
sebagian, jadi jenis dan honor bisa diisi bertahap. Baris belum lengkap tidak
menambah honor di dashboard/rekap sampai kolomnya terisi.

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
  belum punya penugasan) mengikuti urutan file Excel yang diimpor; petugas baru
  dari web diletakkan di akhir.
- Header jenis kegiatan pada sheet **Rekap Jenis Kegiatan** disusun mengikuti
  daftar jenis di web.
- Baris yang belum lengkap ditulis apa adanya: sel jenis/bulan/honor yang kosong
  dibiarkan kosong agar bisa dilengkapi di Excel.
- Formula total per baris diperbaiki (template asli selalu menunjuk baris pertama).

Batas mengikuti file template yang dipakai. Template bawaan menampung **300 baris**
penugasan, **100 petugas** (baris 6–105, TOTAL di baris 107), dan **10 kolom jenis**
kegiatan (kapasitas terbaca **13 jenis** karena kolom Total Honor bisa bergeser).
Bila data melebihi kapasitas file template, ekspor menolak dengan pesan yang
menyebutkan batasnya.

**Unduh Template Kosong** — mengunduh template bawaan yang masih kosong, untuk
diisi nama petugas di kolom A sheet rekap lalu diimpor kembali.

> Ekspor data saja (2 sheet) dan cadangan JSON tidak ditampilkan di antarmuka.
> Kodenya masih tersimpan (dikomentari) di `public/data.html` dan
> `public/js/data.js` bila suatu saat diperlukan. Untuk arsip, gunakan
> **Unduh Sesuai Template Excel**.

## Penyimpanan & keamanan

- Tabel utama: `admin`, `sesi`, `petugas`, `jenis_kegiatan`, `penugasan`, `meta`,
  `log`, `template_ekspor`, `login_gagal`.
- Template Excel tersimpan di `template_ekspor.isi` (`LONGBLOB`, maksimal 4 MB).
  Bila belum ada template tersimpan, dipakai `public/data/template-matriks.xlsx`.
- `api/config.php` berisi kata sandi database dan **tidak boleh di-commit**
  (sudah masuk `.gitignore`). Berkas itu juga diblokir dari akses web lewat
  `.htaccess`.
- Rekap/dashboard tidak disimpan; hanya penugasan, master, dan template yang
  tersimpan di MySQL.
- Semua respons memakai header `X-Content-Type-Options: nosniff`,
  `X-Frame-Options`, `Referrer-Policy`, dan `Content-Security-Policy` (skrip
  hanya dari domain sendiri dan CDN yang dipakai: jsDelivr, jQuery, DataTables).
- `api/buat-admin.php` menolak berjalan bila `setup_token` masih nilai contoh
  atau kurang dari 16 karakter. Untuk lokal pakai `npm run admin`; setelah
  membuat akun di hosting, hapus file itu dan kosongkan `setup_token`.
- Password awal `admin12345` hanya untuk pemakaian lokal. Ganti dengan
  `npm run sandi` sebelum dashboard dipakai bersama.
- Backup database dapat dilakukan dari HeidiSQL/phpMyAdmin Laragon.

## Struktur proyek

```
api/
  api.php            # router JSON (semua aksi: masuk, bootstrap, CRUD, impor, ...)
  bootstrap.php      # koneksi PDO, sesi, validasi, helper JSON
  config.contoh.php  # contoh konfigurasi; salin menjadi config.php
  config.php         # TIDAK di-commit (kata sandi database)
  skema.sql          # skema MySQL untuk phpMyAdmin
  buat-admin.php     # pembuat akun sekali pakai (hapus setelah dipakai)
  .htaccess          # blokir config/bootstrap/skema/log
public/
  index.html, login.html, penugasan.html, rekap-*.html,
  petugas.html, master-jenis.html, data.html
  .htaccess          # HTTPS + header keamanan
  css/style.css
  js/
    api.js             # memilih adapter server/lokal
    sesi.js, login.js  # login lewat API, redirect, logout
    layout.js, format.js, bulan.js
    dashboard.js, penugasan.js, rekap-*.js,
    petugas.js, master-jenis.js, data.js
    store/
      server.js        # adapter fetch ke /api/api.php
      lokal.js         # adapter localStorage (uji/demo)
      validasi.js      # aturan validasi bersama
      komputasi.js     # dashboard & rekap dari dataset
      penyimpanan.js   # localStorage, normalisasi, template lokal
      pivot.js         # matriks rekap
      excel.js         # impor/ekspor Excel (ExcelJS)
      saran-pekerjaan.js
  vendor/exceljs.min.js
  data/template-matriks.xlsx   # template bawaan
tools/
  setup-local.php    # menyiapkan db_selaras sebelum npm run dev
  buat-template.mjs  # membangun ulang template bawaan dari template BPS
tests/
  smoke-test.mjs, template-test.mjs
```

## Perbedaan dengan versi sebelumnya

| Versi lama | Versi ini |
| --- | --- |
| Data hanya di `localStorage` browser | Data di MySQL, dipakai bersama |
| Login palsu di sisi browser | Login server + sesi cookie `HttpOnly` |
| Satu pengguna per browser | Dua akun admin dengan log aktivitas |
| Tidak ada cadangan terpusat | Template tersimpan di database + ekspor Excel |
