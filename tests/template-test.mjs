/**
 * Uji ekspor mengikuti template tanpa browser.
 * Jalankan: node tests/template-test.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';

globalThis.ExcelJS = ExcelJS;
if (typeof globalThis.CustomEvent === 'undefined') {
  globalThis.CustomEvent = class CustomEvent {
    constructor(tipe, opsi = {}) {
      this.type = tipe;
      this.detail = opsi.detail;
    }
  };
}
globalThis.window = { dispatchEvent: () => true, addEventListener: () => {} };

const { buatWorkbookTemplate, TEMPLATE_BAWAAN } = await import(
  '../public/js/store/excel.js'
);

const dataset = {
  versi: 2,
  jenis: [
    { id: 1, nama: 'Survei', urutan: 1 },
    { id: 2, nama: 'Sensus', urutan: 2 },
    { id: 3, nama: 'Pengolahan Data', urutan: 3 },
    { id: 5, nama: 'Koordinasi', urutan: 4 },
  ],
  posisi: [
    { id: 1, jenis_kegiatan_id: 1, nama: 'PPL', urutan: 1 },
    { id: 2, jenis_kegiatan_id: 2, nama: 'PML', urutan: 1 },
    { id: 3, jenis_kegiatan_id: 1, nama: 'PML', urutan: 2 },
  ],
  petugas: [
    { id: 1, nama: 'Budi Santoso', urutan: 1 },
    { id: 2, nama: 'Siti Aminah', urutan: 2 },
    { id: 3, nama: 'Andi Wijaya', urutan: 3 },
    { id: 9, nama: 'Tidak Punya Penugasan', urutan: 4 },
  ],
  penugasan: [
    { id: 1, petugas_id: 1, jenis_kegiatan_id: 1, posisi_id: 3, nama_pekerjaan: 'SURVEI A', bulan: 1, tahun: 2026, honor: 1500000 },
    { id: 2, petugas_id: 2, jenis_kegiatan_id: 2, posisi_id: 2, nama_pekerjaan: 'SENSUS B', bulan: 2, tahun: 2026, honor: 2000000 },
    { id: 3, petugas_id: 1, jenis_kegiatan_id: 3, posisi_id: null, nama_pekerjaan: 'ENTRI C', bulan: 3, tahun: 2026, honor: 1250000 },
    { id: 4, petugas_id: 3, jenis_kegiatan_id: 5, posisi_id: null, nama_pekerjaan: 'RAPAT D', bulan: 4, tahun: 2026, honor: 750000 },
    { id: 5, petugas_id: 1, jenis_kegiatan_id: 1, posisi_id: 1, nama_pekerjaan: 'SURVEI E', bulan: 1, tahun: 2025, honor: 500000 },
  ],
};

const templateBuffer = fs.readFileSync('public/data/template-matriks.xlsx');
const workbook = await buatWorkbookTemplate(dataset, { tahun: 2026, templateBuffer });

assert.deepEqual(
  workbook.worksheets.map((s) => s.name),
  [
    'Dashboard',
    'Data Penugasan',
    'Referensi',
    'Rekap Honor Bulanan',
    'Rekap Jenis Kegiatan',
  ],
  'lima sheet template harus utuh'
);

const data = workbook.getWorksheet(TEMPLATE_BAWAAN.namaSheetData);
assert.equal(data.getCell('B5').value, 'Budi Santoso');
assert.equal(data.getCell('C5').value, 'Survei');
assert.equal(data.getCell('D5').value, 'SURVEI E');
assert.equal(data.getCell('E5').value, 'PPL', 'posisi petugas ikut diekspor');
assert.equal(data.getCell('F5').value, 'Januari');
assert.equal(data.getCell('G5').value, 2025, 'data diurutkan dari tahun terlama');
assert.equal(data.getCell('H5').value, 500000);
assert.equal(data.getCell('E6').value, 'PML', 'posisi per jenis kegiatan ikut diekspor');
assert.equal(data.getCell('E8').value, '', 'baris tanpa posisi dibiarkan kosong');
assert.equal(data.getCell('H9').value, 750000);
assert.equal(data.getCell('B10').value, null, 'baris setelah data harus kosong');
assert.ok(data.getCell('A5').formula || data.getCell('A5').sharedFormula, 'formula No. tetap ada');

const referensi = workbook.getWorksheet(TEMPLATE_BAWAAN.namaSheetReferensi);
assert.deepEqual(
  [3, 4, 5, 6, 7].map((r) => referensi.getCell(r, 1).value),
  ['Survei', 'Sensus', 'Pengolahan Data', 'Koordinasi', null]
);

const bulanan = workbook.getWorksheet(TEMPLATE_BAWAAN.namaSheetRekapBulanan);
assert.equal(bulanan.getCell('B3').value, 2026);
assert.deepEqual(
  [6, 7, 8, 9].map((r) => bulanan.getCell(r, 1).value),
  ['Budi Santoso', 'Siti Aminah', 'Andi Wijaya', 'Tidak Punya Penugasan'],
  'semua petugas ikut ditulis dengan urutan master, termasuk yang tanpa penugasan'
);
assert.equal(bulanan.getCell('A10').value, null, 'sisa baris petugas dibersihkan');
assert.ok(bulanan.getCell('B6').formula.includes('SUMIFS'));
assert.equal(bulanan.getCell('N6').formula, 'IF($A6="","",SUM(B6:M6))', 'total per baris benar');
assert.equal(bulanan.getCell('N107').formula, 'SUM(N6:N105)', 'baris TOTAL mengikuti kapasitas 100 petugas');

const jenis = workbook.getWorksheet(TEMPLATE_BAWAAN.namaSheetRekapJenis);
// Kolom total tetap di posisi template (L), kolom jenis yang tidak dipakai dibiarkan kosong.
assert.deepEqual(
  [2, 3, 4, 5, 6, 11, 12, 13].map((c) => jenis.getCell(5, c).value),
  ['Survei', 'Sensus', 'Pengolahan Data', 'Koordinasi', null, null, 'Total Honor', null]
);
const formulaJenis = jenis.getCell('C6').formula;
assert.ok(formulaJenis.includes("'Data Penugasan'!$C$5:$C$304,C$5"), 'kriteria jenis memakai header kolom');
assert.ok(formulaJenis.includes('$B$3'), 'tahun mengacu ke B3 rekap bulanan');
assert.equal(jenis.getCell('L6').formula, 'IF($A6="","",SUM(B6:K6))');
assert.equal(jenis.getCell('H10').value, null, 'kolom di luar daftar dibersihkan');
assert.equal(jenis.getCell('M10').value, null, 'kolom setelah total dibersihkan');

// Data validation pada Data Penugasan harus tetap ada.
assert.ok(data.getCell('F5').dataValidation, 'validasi bulan tetap ada');
assert.ok(data.getCell('G5').dataValidation, 'validasi tahun tetap ada');

const buffer = await workbook.xlsx.writeBuffer();
const hasil = path.join(os.tmpdir(), 'opencode', 'uji-template.xlsx');
await fs.promises.writeFile(hasil, Buffer.from(buffer));

// Tulis lalu baca ulang: formula penomoran No. harus tetap berfungsi.
const ulang = new ExcelJS.Workbook();
await ulang.xlsx.load(buffer);
const ulangData = ulang.getWorksheet(TEMPLATE_BAWAAN.namaSheetData);
const a6 = ulangData.getCell('A6');
assert.ok(
  a6.sharedFormula || a6.formula,
  'sel A6 tetap berisi formula (shared/normal)'
);
if (a6.sharedFormula) assert.equal(a6.sharedFormula, 'A5', 'shared formula masih menunjuk master A5');

console.log('OK lima sheet, data, referensi, dan rekap terisi');
console.log('OK semua petugas (termasuk tanpa penugasan) ditulis ke rekap');
console.log('OK formula rekap jenis memakai header & tahun B3');
console.log('OK data validation tetap ada');
console.log(`OK file hasil: ${hasil}`);

// --- Batas template harus ditolak dengan pesan yang jelas -------------------
const petugasBanyak = Array.from({ length: 101 }, (_, i) => ({
  id: i + 1,
  nama: `Petugas ${i + 1}`,
  urutan: i + 1,
}));
await assert.rejects(
  () =>
    buatWorkbookTemplate(
      {
        versi: 2,
        jenis: dataset.jenis,
        petugas: petugasBanyak,
        penugasan: petugasBanyak.map((p, i) => ({
          id: i + 1,
          petugas_id: p.id,
          jenis_kegiatan_id: 1,
          nama_pekerjaan: 'UJI',
          bulan: 1,
          tahun: 2026,
          honor: 1000,
        })),
      },
      { tahun: 2026, templateBuffer }
    ),
  /100 baris petugas/,
  'lebih dari 100 petugas harus ditolak'
);

await assert.rejects(
  () =>
    buatWorkbookTemplate(
      {
        versi: 2,
        jenis: Array.from({ length: 14 }, (_, i) => ({ id: i + 1, nama: `Jenis ${i + 1}`, urutan: i + 1 })),
        petugas: [{ id: 1, nama: 'Budi', urutan: 1 }],
        penugasan: [
          { id: 1, petugas_id: 1, jenis_kegiatan_id: 1, nama_pekerjaan: 'UJI', bulan: 1, tahun: 2026, honor: 1000 },
        ],
      },
      { tahun: 2026, templateBuffer }
    ),
  /13 jenis kegiatan/,
  'jenis melebihi kolom template harus ditolak'
);

await assert.rejects(
  () =>
    buatWorkbookTemplate(
      {
        versi: 2,
        jenis: [{ id: 1, nama: 'Survei', urutan: 1 }],
        petugas: [{ id: 1, nama: 'Budi', urutan: 1 }],
        penugasan: Array.from({ length: 301 }, (_, i) => ({
          id: i + 1,
          petugas_id: 1,
          jenis_kegiatan_id: 1,
          nama_pekerjaan: 'UJI',
          bulan: 1,
          tahun: 2026,
          honor: 1000,
        })),
      },
      { tahun: 2026, templateBuffer }
    ),
  /300 baris/,
  'lebih dari 300 baris harus ditolak'
);

console.log('OK batas 300 baris / 100 petugas / 13 jenis ditolak dengan pesan jelas');

// --- Template milik pengguna dipakai sebagai cetakan -----------------------
const kustom = new ExcelJS.Workbook();
await kustom.xlsx.load(fs.readFileSync('public/data/template-matriks.xlsx'));
kustom.getWorksheet('Dashboard').getCell('A1').value = 'PENANDA TEMPLATE PENGGUNA';
const kustomBuffer = await kustom.xlsx.writeBuffer();

const dariPengguna = await buatWorkbookTemplate(dataset, {
  tahun: 2026,
  templateBuffer: kustomBuffer,
});
assert.equal(
  dariPengguna.getWorksheet('Dashboard').getCell('A1').value,
  'PENANDA TEMPLATE PENGGUNA',
  'isi template pengguna tidak boleh hilang'
);

const dariBase64 = await buatWorkbookTemplate(dataset, {
  tahun: 2026,
  templateBase64: Buffer.from(kustomBuffer).toString('base64'),
});
assert.equal(
  dariBase64.getWorksheet('Dashboard').getCell('A1').value,
  'PENANDA TEMPLATE PENGGUNA',
  'template dari localStorage (base64) juga dipakai'
);
console.log('OK template pengguna (buffer & base64) dipakai sebagai cetakan');
