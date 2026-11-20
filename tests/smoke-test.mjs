/**
 * Uji cepat tanpa browser:
 * - impor Excel (termasuk baris tidak valid)
 * - perhitungan dashboard & rekap
 * - CRUD penugasan dan jenis kegiatan
 * - pembuatan workbook ekspor
 *
 * Jalankan: npm test
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import ExcelJS from 'exceljs';

const peta = new Map();
globalThis.localStorage = {
  getItem: (kunci) => (peta.has(kunci) ? peta.get(kunci) : null),
  setItem: (kunci, nilai) => peta.set(kunci, String(nilai)),
  removeItem: (kunci) => peta.delete(kunci),
};
globalThis.window = {
  dispatchEvent: () => true,
  addEventListener: () => {},
};
if (typeof globalThis.CustomEvent === 'undefined') {
  globalThis.CustomEvent = class CustomEvent {
    constructor(tipe, opsi = {}) {
      this.type = tipe;
      this.detail = opsi.detail;
    }
  };
}
globalThis.ExcelJS = ExcelJS;

const { imporFileExcel, buatWorkbook, buatWorkbookTemplate } = await import(
  '../public/js/store/excel.js'
);
const { simpanDataset, bacaDataset, datasetKosong, gabungkanDataset } = await import(
  '../public/js/store/penyimpanan.js'
);
const { api, ApiError } = await import('../public/js/api.js');

function buatFixture() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Data Penugasan');
  ws.getCell('A1').value = 'TEMPLATE DATA PENUGASAN DAN HONOR PETUGAS';
  ['No.', 'Nama Petugas', 'Jenis Kegiatan', 'Nama Pekerjaan/Kegiatan', 'Bulan', 'Tahun', 'Honor (Rp)'].forEach(
    (teks, indeks) => {
      ws.getCell(4, indeks + 1).value = teks;
    }
  );

  const baris = [
    ['Budi Santoso', 'Survei', 'SURVEI HARGA KONSUMEN', 'Januari', 2026, 1500000],
    ['Siti Aminah', 'Sensus', 'SENSUS PENDUDUK', 'Februari', 2026, 2000000],
    ['Budi Santoso', 'Pengolahan Data', 'ENTRI DATA SURVEI', 'Maret', 2026, 'Rp 1.250.000'],
    ['Andi Wijaya', 'Koordinasi', 'RAPAT KOORDINASI', 4, 2026, 750000],
    ['Siti Aminah', 'Survei', 'SURVEI TANPA HONOR', 'April', 2026, 0],
    ['', 'Survei', 'BARIS TANPA PETUGAS', 'Mei', 2026, 100000],
    ['Rina', 'Survei', 'BULAN SALAH', 'BulanPalsu', 2026, 100000],
  ];
  baris.forEach((data, indeks) => {
    ws.getCell(5 + indeks, 1).value = indeks + 1;
    data.forEach((nilai, kolom) => {
      ws.getCell(5 + indeks, kolom + 2).value = nilai;
    });
  });

  const ref = wb.addWorksheet('Referensi');
  ['Survei', 'Sensus', 'Pengolahan Data', 'Pembinaan Statistik Sektoral', 'Koordinasi'].forEach(
    (nama, indeks) => {
      ref.getCell(3 + indeks, 1).value = nama;
    }
  );
  return wb;
}

async function uji() {
  // --- Pemakaian pertama: semua daftar master kosong -----------------------
  // Jenis kegiatan hanya berasal dari file Excel yang diimpor pengguna (atau
  // ditambahkan manual), jadi tidak ada jenis bawaan.
  const awal = bacaDataset();
  assert.equal(awal.penugasan.length, 0);
  assert.equal(awal.petugas.length, 0);
  assert.equal(awal.jenis.length, 0, 'belum ada jenis sebelum file Excel diimpor');
  assert.equal(localStorage.getItem('dashboard-honor-v2'), null, 'membaca belum menulis data');

  // Setelah dikosongkan pengguna, jenis tidak boleh muncul kembali sendiri.
  simpanDataset(datasetKosong());
  assert.equal(bacaDataset().jenis.length, 0, 'dataset kosong tersimpan tidak diisi ulang');
  localStorage.removeItem('dashboard-honor-v2');
  console.log('OK belum ada jenis bawaan sebelum impor');

  const wb = buatFixture();
  const buffer = await wb.xlsx.writeBuffer();
  const hasil = await imporFileExcel({
    name: 'fixture.xlsx',
    arrayBuffer: async () => buffer,
  });

  assert.equal(hasil.errors.length, 2, 'dua baris tidak valid harus dilaporkan');
  assert.equal(hasil.ringkasan.jumlahBaris, 5, 'lima baris valid harus terbaca');
  assert.equal(hasil.ringkasan.jumlahPetugas, 3);
  assert.equal(hasil.ringkasan.jumlahJenis, 5);
  assert.deepEqual(hasil.ringkasan.tahun, [2026]);
  assert.equal(hasil.ringkasan.totalHonor, 5_500_000);
  assert.equal(hasil.data.penugasan.length, 5);
  console.log('OK impor Excel: 5 valid, 2 dilewati');

  simpanDataset(hasil.data);
  assert.equal(bacaDataset().penugasan.length, 5);
  console.log('OK simpan ke localStorage tiruan');

  const dashboard = api.getDashboard(2026);
  assert.equal(dashboard.total_honor, 5_500_000);
  assert.equal(dashboard.jumlah_penugasan, 5);
  assert.equal(dashboard.jumlah_petugas, 3);
  assert.equal(dashboard.per_bulan[0].total, 1_500_000);
  assert.equal(dashboard.per_bulan[3].total, 750_000);
  assert.equal(dashboard.per_bulan[4].total, 0);
  assert.equal(dashboard.per_jenis.find((item) => item.nama === 'Survei').total, 1_500_000);
  console.log('OK dashboard dan agregasi');

  const rekap = api.getRekapBulanan(2026);
  assert.equal(rekap.kolom.length, 12);
  assert.equal(rekap.baris.length, 3);
  assert.equal(rekap.total_keseluruhan, 5_500_000);
  assert.equal(rekap.baris.find((item) => item.nama === 'Budi Santoso').sel['1'], 1_500_000);
  const rekapJenis = api.getRekapJenis(2026);
  assert.equal(rekapJenis.kolom.length, 5);
  assert.equal(rekapJenis.total_keseluruhan, 5_500_000);
  console.log('OK rekap bulanan dan rekap jenis');

  const dibuat = api.buatPenugasan({
    petugas_nama: 'Dewi Lestari',
    jenis_kegiatan_id: 1,
    nama_pekerjaan: 'SURVEI BARU',
    bulan: 5,
    tahun: 2026,
    honor: 500000,
  });
  assert.equal(dibuat.data.nama_petugas, 'Dewi Lestari');
  assert.equal(api.getPenugasan({ tahun: 2026, q: 'dewi' }).total, 1);

  const diubah = api.ubahPenugasan(dibuat.data.id, {
    petugas_nama: 'Dewi Lestari',
    jenis_kegiatan_id: 1,
    nama_pekerjaan: 'SURVEI BARU (REVISI)',
    bulan: 6,
    tahun: 2026,
    honor: 600000,
  });
  assert.equal(diubah.data.bulan, 6);
  assert.equal(diubah.data.honor, 600000);
  console.log('OK tambah dan ubah penugasan');

  assert.throws(
    () =>
      api.buatPenugasan({
        petugas_nama: '',
        jenis_kegiatan_id: 999,
        nama_pekerjaan: '',
        bulan: 13,
        tahun: 2020,
        honor: -1,
      }),
    (kesalahan) => {
      assert.ok(kesalahan instanceof ApiError);
      assert.ok(kesalahan.errors && Object.keys(kesalahan.errors).length > 0);
      return true;
    }
  );
  const jenisBaru = api.buatJenisKegiatan({ nama: 'Diseminasi' });
  api.ubahJenisKegiatan(jenisBaru.data.id, { nama: 'Diseminasi Baru' });
  api.hapusJenisKegiatan(jenisBaru.data.id);
  assert.throws(
    () => api.hapusJenisKegiatan(1),
    (kesalahan) => kesalahan instanceof ApiError && kesalahan.status === 409
  );
  console.log('OK validasi dan CRUD jenis kegiatan');

  api.hapusPenugasan(dibuat.data.id);
  assert.equal(bacaDataset().penugasan.length, 5);

  const ekspor = buatWorkbook(bacaDataset());
  assert.deepEqual(
    ekspor.worksheets.map((sheet) => sheet.name),
    ['Data Penugasan', 'Referensi']
  );
  const bufferEkspor = await ekspor.xlsx.writeBuffer();
  const dibacaUlang = new ExcelJS.Workbook();
  await dibacaUlang.xlsx.load(bufferEkspor);
  const sheetData = dibacaUlang.getWorksheet('Data Penugasan');
  assert.equal(sheetData.getCell('B5').value, 'Budi Santoso');
  assert.equal(sheetData.getCell('E5').value, 'Januari');
  assert.equal(sheetData.getCell('G5').value, 1500000);
  assert.equal(bacaDataset().penugasan.length, 5);
  console.log('OK ekspor workbook dan baca ulang');

  // --- CRUD petugas & urutan ------------------------------------------------
  const petugasBaru = api.buatPetugas({ nama: 'Zulkifli Ahmad' });
  assert.equal(petugasBaru.data.urutan, api.getPetugas(2026).length, 'petugas baru ditaruh di akhir');
  assert.throws(
    () => api.buatPetugas({ nama: 'Zulkifli Ahmad' }),
    (kesalahan) => kesalahan instanceof ApiError && kesalahan.status === 400,
    'nama petugas duplikat harus ditolak'
  );
  api.ubahPetugas(petugasBaru.data.id, { nama: 'Zulkifli A.' });
  assert.ok(api.getPetugas(2026).some((baris) => baris.nama === 'Zulkifli A.'));
  api.hapusPetugas(petugasBaru.data.id);
  assert.ok(!api.getPetugas(2026).some((baris) => baris.nama === 'Zulkifli A.'));
  assert.throws(
    () => api.hapusPetugas(1),
    (kesalahan) => kesalahan instanceof ApiError && kesalahan.status === 409,
    'petugas yang punya penugasan tidak boleh dihapus'
  );
  console.log('OK CRUD petugas dan aturan hapus');

  // Rekap menampilkan semua petugas, termasuk yang belum punya penugasan.
  const tanpaPenugasan = api.buatPetugas({ nama: 'Belum Ada Penugasan' });
  const rekapSemua = api.getRekapBulanan(2026);
  assert.ok(
    rekapSemua.baris.some((baris) => baris.nama === 'Belum Ada Penugasan'),
    'petugas tanpa penugasan tetap muncul di rekap'
  );
  assert.equal(rekapSemua.baris.length, api.getPetugas(2026).length);
  api.hapusPetugas(tanpaPenugasan.data.id);
  console.log('OK rekap menampilkan seluruh petugas master');

  // --- Impor baris setengah jadi (hanya nama petugas wajib) -----------------
  const wbSetengah = new ExcelJS.Workbook();
  wbSetengah.addWorksheet('Dashboard');
  const wsSetengah = wbSetengah.addWorksheet('Data Penugasan');
  ['No.', 'Nama Petugas', 'Jenis Kegiatan', 'Nama Pekerjaan/Kegiatan', 'Bulan', 'Tahun', 'Honor (Rp)'].forEach(
    (teks, indeks) => {
      wsSetengah.getCell(4, indeks + 1).value = teks;
    }
  );
  wsSetengah.getCell(5, 2).value = 'Ivan';
  wsSetengah.getCell(5, 4).value = '(SUSENAS26) SURVEI SOSIAL EKONOMI';
  wsSetengah.getCell(5, 5).value = 'April';
  wsSetengah.getCell(5, 6).value = 2026;
  wsSetengah.getCell(6, 2).value = 'Dimas';
  wsSetengah.getCell(6, 4).value = '(SE2026) SENSUS EKONOMI 2026';
  wsSetengah.getCell(6, 5).value = 'Juni';
  wsSetengah.getCell(6, 6).value = 2026;
  wsSetengah.getCell(7, 2).value = 'Hanya Nama';

  const wsRefSetengah = wbSetengah.addWorksheet('Referensi');
  wsRefSetengah.getCell(3, 1).value = 'Survei';

  const wsBulananSetengah = wbSetengah.addWorksheet('Rekap Honor Bulanan');
  wsBulananSetengah.getCell('B3').value = 2026;
  wbSetengah.addWorksheet('Rekap Jenis Kegiatan');

  const bufferSetengah = await wbSetengah.xlsx.writeBuffer();
  const hasilSetengah = await imporFileExcel({
    name: 'setengah-jadi.xlsx',
    arrayBuffer: async () => bufferSetengah,
  });

  assert.equal(hasilSetengah.errors.length, 0, 'baris tanpa jenis/honor tidak dianggap error');
  assert.equal(hasilSetengah.ringkasan.jumlahBaris, 3);
  assert.equal(hasilSetengah.ringkasan.jumlahBelumLengkap, 3);
  assert.equal(hasilSetengah.data.penugasan.length, 3);
  assert.equal(hasilSetengah.data.penugasan[0].jenis_kegiatan_id, null);
  assert.equal(hasilSetengah.data.penugasan[0].honor, null);
  assert.equal(hasilSetengah.data.penugasan[2].bulan, null, 'bulan kosong dibiarkan kosong');
  assert.equal(hasilSetengah.data.penugasan[2].tahun, 2026, 'tahun kosong ikut tahun analisis');
  assert.ok(
    hasilSetengah.peringatan.some((pesan) => pesan.includes('baris belum lengkap')),
    'peringatan baris belum lengkap'
  );

  simpanDataset(hasilSetengah.data);
  const belum = api.getPenugasan({ tahun: 2026, status: 'belum' });
  assert.equal(belum.total, 3);
  assert.equal(belum.belum_lengkap, 3);
  assert.equal(belum.data[0].lengkap, false);
  assert.ok(belum.data[0].kosong.includes('jenis'));
  assert.ok(belum.data[0].kosong.includes('honor'));
  assert.equal(api.getPenugasan({ tahun: 2026, status: 'lengkap' }).total, 0);

  const lengkapi = api.ubahPenugasan(belum.data[0].id, {
    petugas_nama: 'Ivan',
    jenis_kegiatan_id: hasilSetengah.data.jenis[0].id,
    nama_pekerjaan: '(SUSENAS26) SURVEI SOSIAL EKONOMI',
    bulan: 4,
    tahun: 2026,
    honor: 1700000,
  });
  assert.equal(lengkapi.data.lengkap, true);
  assert.equal(api.getPenugasan({ tahun: 2026, status: 'belum' }).total, 2);
  assert.equal(api.getPenugasan({ tahun: 2026, status: 'lengkap' }).total, 1);
  console.log('OK baris belum lengkap diimpor, difilter, dan bisa dilengkapi');

  // --- Impor template: petugas dari sheet rekap, tahun B3, judul jenis -----
  const wbTemplate = new ExcelJS.Workbook();
  wbTemplate.addWorksheet('Dashboard');
  const wsData = wbTemplate.addWorksheet('Data Penugasan');
  ['No.', 'Nama Petugas', 'Jenis Kegiatan', 'Nama Pekerjaan/Kegiatan', 'Bulan', 'Tahun', 'Honor (Rp)'].forEach(
    (teks, indeks) => {
      wsData.getCell(4, indeks + 1).value = teks;
    }
  );
  wsData.getCell(5, 2).value = 'Siti Aminah';
  wsData.getCell(5, 3).value = 'Sensus';
  wsData.getCell(5, 4).value = 'SENSUS PENDUDUK';
  wsData.getCell(5, 5).value = 'Februari';
  wsData.getCell(5, 6).value = 2026;
  wsData.getCell(5, 7).value = 2000000;

  const wsRef = wbTemplate.addWorksheet('Referensi');
  ['Survei', 'Sensus', 'Pengolahan Data'].forEach((nama, indeks) => {
    wsRef.getCell(3 + indeks, 1).value = nama;
  });

  const wsBulanan = wbTemplate.addWorksheet('Rekap Honor Bulanan');
  wsBulanan.getCell('B3').value = 2026;
  ['Budi Santoso', 'Siti Aminah', 'Andi Wijaya', 'Tanpa Penugasan'].forEach((nama, indeks) => {
    wsBulanan.getCell(6 + indeks, 1).value = nama;
  });

  const wsJenis = wbTemplate.addWorksheet('Rekap Jenis Kegiatan');
  ['Survei', 'Sensus', 'Pengolahan Data'].forEach((nama, indeks) => {
    wsJenis.getCell(5, 2 + indeks).value = nama;
  });
  wsJenis.getCell(5, 5).value = 'Total Honor';
  ['Siti Aminah', 'Andi Wijaya', 'Tanpa Penugasan'].forEach((nama, indeks) => {
    wsJenis.getCell(6 + indeks, 1).value = nama;
  });

  const bufferTemplate = await wbTemplate.xlsx.writeBuffer();
  const hasilTemplate = await imporFileExcel({
    name: 'template-petugas.xlsx',
    arrayBuffer: async () => bufferTemplate,
  });

  assert.equal(hasilTemplate.ringkasan.tahunAnalisis, 2026, 'tahun B3 terbaca');
  assert.deepEqual(
    hasilTemplate.data.petugas.map((baris) => baris.nama),
    ['Budi Santoso', 'Siti Aminah', 'Andi Wijaya', 'Tanpa Penugasan'],
    'urutan petugas mengikuti kolom A sheet rekap'
  );
  assert.deepEqual(
    hasilTemplate.data.petugas.map((baris) => baris.urutan),
    [1, 2, 3, 4],
    'urutan petugas disimpan'
  );
  assert.ok(
    hasilTemplate.data.jenis.some((baris) => baris.nama === 'Pengolahan Data'),
    'jenis dari sheet Referensi ikut terbaca'
  );
  assert.equal(hasilTemplate.ringkasan.kapasitasPetugas, 4, 'kapasitas petugas terdeteksi dari kolom A');
  assert.ok(
    hasilTemplate.peringatan.some((pesan) => pesan.includes('Rekap Honor Bulanan')),
    'peringatan nama yang hanya ada di salah satu sheet'
  );
  assert.ok(hasilTemplate.template && hasilTemplate.template.base64, 'file template disimpan sebagai cetakan');
  console.log('OK impor petugas dari sheet rekap, tahun B3, dan judul jenis');

  // Template lama memiliki 50 baris berformula, tetapi nama bisa ditulis lebih jauh.
  const namaTambahan = Array.from({ length: 81 }, (_, indeks) => `Petugas tambahan ${indeks + 1}`);
  let barisRekap = 10;
  for (const nama of namaTambahan) {
    if (barisRekap === 56) barisRekap = 58; // Jeda dan baris TOTAL template lama.
    wsBulanan.getCell(barisRekap, 1).value = nama;
    barisRekap += 1;
  }
  for (let baris = 6; baris <= 55; baris += 1) {
    wsBulanan.getCell(baris, 2).value = {
      formula: `SUMIFS('Data Penugasan'!$G$5:$G$304,'Data Penugasan'!$B$5:$B$304,$A${baris})`,
    };
  }
  wsBulanan.getCell('A57').value = 'TOTAL';
  wsJenis.getCell('A57').value = 'TOTAL';
  wsJenis.getCell('A5001').value = 'Hanya di Rekap Jenis';

  for (let baris = 6; baris <= 305; baris += 1) {
    wsData.getCell(baris, 2).value = 'Siti Aminah';
  }
  const bufferBesar = await wbTemplate.xlsx.writeBuffer();
  const hasilBesar = await imporFileExcel({
    name: 'template-lama-banyak-baris.xlsx',
    arrayBuffer: async () => bufferBesar,
  });
  assert.deepEqual(hasilBesar.data.petugas.map((baris) => baris.nama), [
    'Budi Santoso', 'Siti Aminah', 'Andi Wijaya', 'Tanpa Penugasan',
    ...namaTambahan, 'Hanya di Rekap Jenis',
  ]);
  assert.equal(hasilBesar.ringkasan.jumlahPetugasRekap, 86);
  assert.equal(hasilBesar.ringkasan.kapasitasPetugas, 50);
  assert.equal(hasilBesar.ringkasan.kapasitasPenugasan, 300);
  assert.equal(hasilBesar.data.penugasan.length, 301);
  assert.equal(hasilBesar.errors.length, 0);
  assert.ok(!hasilBesar.peringatan.some((pesan) => pesan.includes('rentang rekap')));
  assert.ok(!hasilBesar.peringatan.some((pesan) => pesan.includes('rentang Data Penugasan')));
  simpanDataset(hasilBesar.data);
  assert.equal(bacaDataset().petugas.length, 86);
  assert.equal(bacaDataset().penugasan.length, 301);
  console.log('OK impor menyimpan seluruh petugas dan penugasan di luar kapasitas ekspor');

  // --- File yang hanya berisi sheet Referensi --------------------------------
  const wbReferensi = new ExcelJS.Workbook();
  wbReferensi.addWorksheet('Dashboard');
  const wsDataKosong = wbReferensi.addWorksheet('Data Penugasan');
  ['No.', 'Nama Petugas', 'Jenis Kegiatan', 'Nama Pekerjaan/Kegiatan', 'Bulan', 'Tahun', 'Honor (Rp)'].forEach(
    (teks, indeks) => {
      wsDataKosong.getCell(4, indeks + 1).value = teks;
    }
  );

  const wsRefBaru = wbReferensi.addWorksheet('Referensi');
  wsRefBaru.getCell(1, 1).value = 'DAFTAR JENIS KEGIATAN (dapat diubah sesuai kebutuhan)';
  ['Pengumpulan Data', 'Pemeriksaan', 'Pelatihan Petugas'].forEach((nama, indeks) => {
    wsRefBaru.getCell(3 + indeks, 1).value = nama;
  });

  const wsBulananKosong = wbReferensi.addWorksheet('Rekap Honor Bulanan');
  wsBulananKosong.getCell('B3').value = 2027;

  // Judul kolom sheet rekap sengaja dibiarkan memakai daftar lama (10 jenis).
  const wsJenisLama = wbReferensi.addWorksheet('Rekap Jenis Kegiatan');
  ['Survei', 'Sensus', 'Pengolahan Data', 'Pembinaan Statistik Sektoral', 'Koordinasi'].forEach(
    (nama, indeks) => {
      wsJenisLama.getCell(5, 2 + indeks).value = nama;
    }
  );
  wsJenisLama.getCell(5, 7).value = 'Total Honor';

  const bufferReferensi = await wbReferensi.xlsx.writeBuffer();
  const hasilReferensi = await imporFileExcel({
    name: 'hanya-referensi.xlsx',
    arrayBuffer: async () => bufferReferensi,
  });

  assert.equal(hasilReferensi.ringkasan.jumlahBaris, 0, 'tidak ada penugasan');
  assert.equal(hasilReferensi.ringkasan.jumlahPetugas, 0, 'tidak ada petugas');
  assert.deepEqual(
    hasilReferensi.data.jenis.map((baris) => baris.nama),
    ['Pengumpulan Data', 'Pemeriksaan', 'Pelatihan Petugas'],
    'sheet Referensi menjadi sumber tunggal daftar jenis'
  );
  assert.equal(hasilReferensi.ringkasan.tahunAnalisis, 2027, 'tahun B3 tetap terbaca');
  assert.equal(hasilReferensi.data.penugasan.length, 0);
  assert.ok(
    hasilReferensi.peringatan.some((pesan) => pesan.includes('judul kolom Rekap Jenis Kegiatan')),
    'peringatan bahwa judul kolom lama tidak ada di Referensi'
  );
  console.log('OK impor file yang hanya berisi sheet Referensi');

  // Hasil impor harus bisa dipakai untuk CRUD jenis lalu diekspor kembali.
  simpanDataset(hasilReferensi.data);
  assert.deepEqual(
    bacaDataset().jenis.map((baris) => baris.nama),
    ['Pengumpulan Data', 'Pemeriksaan', 'Pelatihan Petugas']
  );
  api.buatJenisKegiatan({ nama: 'Pengolahan' });
  api.ubahJenisKegiatan(hasilReferensi.data.jenis[0].id, { nama: 'Pengumpulan Data (Revisi)' });

  const wbHasil = await buatWorkbookTemplate(bacaDataset(), {
    tahun: 2027,
    templateBuffer: fs.readFileSync('public/data/template-matriks.xlsx'),
  });
  const refHasil = wbHasil.getWorksheet('Referensi');
  assert.deepEqual(
    [3, 4, 5, 6].map((r) => refHasil.getCell(r, 1).value),
    ['Pengumpulan Data (Revisi)', 'Pemeriksaan', 'Pelatihan Petugas', 'Pengolahan']
  );
  assert.equal(refHasil.getCell(7, 1).value, null, 'sisa baris Referensi dibersihkan');
  const jenisHasil = wbHasil.getWorksheet('Rekap Jenis Kegiatan');
  assert.deepEqual(
    [2, 3, 4, 5].map((c) => jenisHasil.getCell(5, c).value),
    ['Pengumpulan Data (Revisi)', 'Pemeriksaan', 'Pelatihan Petugas', 'Pengolahan'],
    'judul kolom rekap jenis mengikuti daftar Referensi yang diedit'
  );
  assert.equal(jenisHasil.getCell(5, 6).value, null, 'kolom jenis sisa dikosongkan');
  assert.equal(
    jenisHasil.getCell(5, 12).value,
    'Total Honor',
    'kolom Total Honor tetap di posisi template (L)'
  );
  console.log('OK jenis dari Referensi bisa diedit/ditambah lalu diekspor kembali');

  // Kapasitas kolom ekspor tidak membatasi jenis yang diimpor dari Referensi.
  const daftarJenisPanjang = Array.from({ length: 20 }, (_, indeks) => `Jenis ${indeks + 1}`);
  daftarJenisPanjang.forEach((nama, indeks) => {
    wsRefBaru.getCell(3 + indeks, 1).value = nama;
  });
  const bufferJenisPanjang = await wbReferensi.xlsx.writeBuffer();
  const hasilJenisPanjang = await imporFileExcel({
    name: 'referensi-20-jenis.xlsx',
    arrayBuffer: async () => bufferJenisPanjang,
  });
  assert.deepEqual(hasilJenisPanjang.data.jenis.map(({ nama }) => nama), daftarJenisPanjang);
  assert.equal(hasilJenisPanjang.ringkasan.jumlahJenis, 20);
  assert.ok(hasilJenisPanjang.ringkasan.kapasitasJenis < 20);
  assert.ok(!hasilJenisPanjang.peringatan.some((pesan) => pesan.includes('rentang Rekap Jenis Kegiatan')));
  simpanDataset(hasilJenisPanjang.data);
  assert.equal(bacaDataset().jenis.length, 20);

  // Jika Referensi kosong, judul jenis yang ditambahkan setelah Total Honor ikut dibaca.
  wbReferensi.removeWorksheet(wsRefBaru.id);
  wsJenisLama.getCell('T5').value = 'Jenis di luar rentang rekap';
  const bufferJenisRekap = await wbReferensi.xlsx.writeBuffer();
  const hasilJenisRekap = await imporFileExcel({
    name: 'jenis-dari-judul-rekap.xlsx',
    arrayBuffer: async () => bufferJenisRekap,
  });
  assert.deepEqual(hasilJenisRekap.data.jenis.map(({ nama }) => nama), [
    'Survei', 'Sensus', 'Pengolahan Data', 'Pembinaan Statistik Sektoral', 'Koordinasi',
    'Jenis di luar rentang rekap',
  ]);
  console.log('OK impor 20 jenis kegiatan dan judul jenis di luar rentang rekap');

  // --- Referensi yang menyusut: jenis lama yang masih dipakai diberi tahu ----
  const wbSisa = new ExcelJS.Workbook();
  wbSisa.addWorksheet('Dashboard');
  const wsSisaData = wbSisa.addWorksheet('Data Penugasan');
  ['No.', 'Nama Petugas', 'Jenis Kegiatan', 'Nama Pekerjaan/Kegiatan', 'Bulan', 'Tahun', 'Honor (Rp)'].forEach(
    (teks, indeks) => {
      wsSisaData.getCell(4, indeks + 1).value = teks;
    }
  );
  wsSisaData.getCell(5, 2).value = 'Petugas Lama';
  wsSisaData.getCell(5, 3).value = 'Survei';
  wsSisaData.getCell(5, 4).value = 'SURVEI LAPANGAN';
  wsSisaData.getCell(5, 5).value = 'Januari';
  wsSisaData.getCell(5, 6).value = 2027;
  wsSisaData.getCell(5, 7).value = 500000;

  const wsSisaRef = wbSisa.addWorksheet('Referensi');
  ['Pengolahan Data', 'Pemeriksaan'].forEach((nama, indeks) => {
    wsSisaRef.getCell(3 + indeks, 1).value = nama;
  });
  wbSisa.addWorksheet('Rekap Honor Bulanan');
  wbSisa.addWorksheet('Rekap Jenis Kegiatan');

  const bufferSisa = await wbSisa.xlsx.writeBuffer();
  const hasilSisa = await imporFileExcel({
    name: 'referensi-menyusut.xlsx',
    arrayBuffer: async () => bufferSisa,
  });

  assert.deepEqual(
    hasilSisa.data.jenis.map((baris) => baris.nama),
    ['Pengolahan Data', 'Pemeriksaan', 'Survei'],
    'jenis dari Data Penugasan tetap ditambahkan setelah daftar Referensi'
  );
  assert.ok(
    hasilSisa.peringatan.some((pesan) => pesan.includes('masih dipakai di Data Penugasan')),
    'peringatan untuk jenis di luar Referensi'
  );
  console.log('OK jenis di luar Referensi tetap aman dan diberi peringatan');

  // Kedua workbook memakai ID lokal yang sama untuk entri yang berbeda.
  const dataLama = {
    petugas: [{ id: 10, nama: 'siti aminah', urutan: 5 }],
    jenis: [{ id: 12, nama: 'SENSUS', urutan: 8 }],
    penugasan: [{ id: 20, petugas_id: 10, jenis_kegiatan_id: 12, tahun: 2025, honor: 100 }],
  };
  const gabungan = gabungkanDataset(dataLama, [hasilTemplate.data, hasilSisa.data]);
  const tersimpan = simpanDataset(gabungan);
  assert.equal(dataLama.penugasan.length, 1, 'penggabungan tidak mengubah sumber');
  assert.deepEqual(tersimpan.petugas.map(({ nama }) => nama), [
    'siti aminah', 'Budi Santoso', 'Andi Wijaya', 'Tanpa Penugasan', 'Petugas Lama',
  ]);
  assert.deepEqual(tersimpan.jenis.map(({ nama }) => nama), [
    'SENSUS', 'Survei', 'Pengolahan Data', 'Pemeriksaan',
  ]);
  assert.deepEqual(tersimpan.penugasan.map(({ id, tahun, petugas_id, jenis_kegiatan_id }) => [
    id, tahun, petugas_id, jenis_kegiatan_id,
  ]), [[20, 2025, 10, 12], [21, 2026, 10, 12], [22, 2027, 14, 13]]);
  assert.deepEqual(tersimpan.penugasan.map(({ honor }) => honor), [100, 2000000, 500000]);
  assert.equal(gabungkanDataset(tersimpan, [hasilSisa.data]).penugasan.length, 4);
  console.log('OK gabung beberapa workbook dengan data lama, ID dan relasi tetap benar');

  console.log('\nSEMUA UJI LULUS');
}

uji().catch((kesalahan) => {
  console.error('UJI GAGAL');
  console.error(kesalahan);
  process.exitCode = 1;
});
