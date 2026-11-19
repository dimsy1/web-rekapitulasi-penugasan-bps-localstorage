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

const { imporFileExcel, buatWorkbook } = await import('../public/js/store/excel.js');
const { simpanDataset, bacaDataset, datasetKosong } = await import(
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
  // --- Pemakaian pertama: 10 jenis bawaan tersedia tanpa menyentuh data -----
  const awal = bacaDataset();
  assert.equal(awal.penugasan.length, 0);
  assert.equal(awal.petugas.length, 0);
  assert.deepEqual(
    awal.jenis.map((baris) => baris.nama),
    [
      'Survei',
      'Sensus',
      'Pengolahan Data',
      'Pembinaan Statistik Sektoral',
      'Koordinasi',
      'Administrasi',
      'Pengawasan/Monitoring',
      'Pengolahan dan Analisis',
      'Diseminasi',
      'Lainnya',
    ],
    '10 jenis bawaan template harus tersedia saat pertama dipakai'
  );
  assert.equal(localStorage.getItem('dashboard-honor-v2'), null, 'membaca belum menulis data');

  // Setelah dikosongkan pengguna, jenis tidak boleh muncul kembali sendiri.
  simpanDataset(datasetKosong());
  assert.equal(bacaDataset().jenis.length, 0, 'dataset kosong tersimpan tidak diisi ulang');
  localStorage.removeItem('dashboard-honor-v2');
  console.log('OK 10 jenis bawaan saat pertama dipakai');

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

  console.log('\nSEMUA UJI LULUS');
}

uji().catch((kesalahan) => {
  console.error('UJI GAGAL');
  console.error(kesalahan);
  process.exitCode = 1;
});
