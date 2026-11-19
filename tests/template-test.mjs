/**
 * Uji ekspor mengikuti template asli tanpa browser.
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

const { buatWorkbookTemplate, BATAS_TEMPLATE } = await import('../public/js/store/excel.js');

const dataset = {
  versi: 1,
  jenis: [
    { id: 1, nama: 'Survei', urutan: 1 },
    { id: 2, nama: 'Sensus', urutan: 2 },
    { id: 3, nama: 'Pengolahan Data', urutan: 3 },
    { id: 5, nama: 'Koordinasi', urutan: 4 },
  ],
  petugas: [
    { id: 1, nama: 'Budi Santoso' },
    { id: 2, nama: 'Siti Aminah' },
    { id: 3, nama: 'Andi Wijaya' },
    { id: 9, nama: 'Tidak Punya Penugasan' },
  ],
  penugasan: [
    { id: 1, petugas_id: 1, jenis_kegiatan_id: 1, nama_pekerjaan: 'SURVEI A', bulan: 1, tahun: 2026, honor: 1500000 },
    { id: 2, petugas_id: 2, jenis_kegiatan_id: 2, nama_pekerjaan: 'SENSUS B', bulan: 2, tahun: 2026, honor: 2000000 },
    { id: 3, petugas_id: 1, jenis_kegiatan_id: 3, nama_pekerjaan: 'ENTRI C', bulan: 3, tahun: 2026, honor: 1250000 },
    { id: 4, petugas_id: 3, jenis_kegiatan_id: 5, nama_pekerjaan: 'RAPAT D', bulan: 4, tahun: 2026, honor: 750000 },
    { id: 5, petugas_id: 1, jenis_kegiatan_id: 1, nama_pekerjaan: 'SURVEI E', bulan: 1, tahun: 2025, honor: 500000 },
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

const data = workbook.getWorksheet(BATAS_TEMPLATE.namaSheetData);
assert.equal(data.getCell('B5').value, 'Budi Santoso');
assert.equal(data.getCell('C5').value, 'Survei');
assert.equal(data.getCell('D5').value, 'SURVEI E');
assert.equal(data.getCell('E5').value, 'Januari');
assert.equal(data.getCell('F5').value, 2025, 'data diurutkan dari tahun terlama');
assert.equal(data.getCell('G5').value, 500000);
assert.equal(data.getCell('G9').value, 750000);
assert.equal(data.getCell('B10').value, null, 'baris setelah data harus kosong');
assert.ok(data.getCell('A5').formula || data.getCell('A5').sharedFormula, 'formula No. tetap ada');

const referensi = workbook.getWorksheet(BATAS_TEMPLATE.namaSheetReferensi);
assert.deepEqual(
  [3, 4, 5, 6, 7, 8, 9].map((r) => referensi.getCell(r, 1).value),
  ['Survei', 'Sensus', 'Pengolahan Data', 'Koordinasi', null, null, null]
);

const bulanan = workbook.getWorksheet(BATAS_TEMPLATE.namaSheetRekapBulanan);
assert.equal(bulanan.getCell('B3').value, 2026);
assert.deepEqual(
  [6, 7, 8].map((r) => bulanan.getCell(r, 1).value),
  ['Andi Wijaya', 'Budi Santoso', 'Siti Aminah'],
  'hanya petugas yang punya penugasan, urut nama'
);
assert.equal(bulanan.getCell('A9').value, null);
assert.ok(bulanan.getCell('B6').formula.includes('SUMIFS'));

const jenis = workbook.getWorksheet(BATAS_TEMPLATE.namaSheetRekapJenis);
assert.deepEqual(
  [2, 3, 4, 5, 6].map((c) => jenis.getCell(5, c).value),
  ['Survei', 'Sensus', 'Pengolahan Data', 'Koordinasi', 'Total Honor']
);
const formulaJenis = jenis.getCell('C6').formula;
assert.ok(formulaJenis.includes("'Data Penugasan'!$C$5:$C$304,C$5"), 'kriteria jenis memakai header kolom');
assert.ok(formulaJenis.includes('$B$3'), 'tahun mengacu ke B3 rekap bulanan');
assert.equal(jenis.getCell('F6').formula, 'IF($A6="","",SUM(B6:E6))');
assert.equal(jenis.getCell('H10').value, null, 'kolom di luar daftar dibersihkan');
assert.equal(jenis.getCell('G10').value, null, 'kolom setelah total dibersihkan');

// Data validation pada Data Penugasan harus tetap ada.
assert.ok(data.getCell('E5').dataValidation, 'validasi bulan tetap ada');
assert.ok(data.getCell('F5').dataValidation, 'validasi tahun tetap ada');

const buffer = await workbook.xlsx.writeBuffer();
const hasil = path.join(os.tmpdir(), 'opencode', 'uji-template.xlsx');
await fs.promises.writeFile(hasil, Buffer.from(buffer));

// Tulis lalu baca ulang: formula penomoran No. harus tetap berfungsi.
const ulang = new ExcelJS.Workbook();
await ulang.xlsx.load(buffer);
const ulangData = ulang.getWorksheet(BATAS_TEMPLATE.namaSheetData);
const a6 = ulangData.getCell('A6');
assert.ok(
  a6.sharedFormula || a6.formula,
  'sel A6 tetap berisi formula (shared/normal)'
);
if (a6.sharedFormula) assert.equal(a6.sharedFormula, 'A5', 'shared formula masih menunjuk master A5');

console.log('OK lima sheet, data, referensi, dan rekap terisi');
console.log('OK formula rekap jenis memakai header & tahun B3');
console.log('OK data validation tetap ada');
console.log(`OK file hasil: ${hasil}`);

// --- Batas template harus ditolak dengan pesan yang jelas -------------------
const petugasBanyak = Array.from({ length: 51 }, (_, i) => ({ id: i + 1, nama: `Petugas ${i + 1}` }));
await assert.rejects(
  () =>
    buatWorkbookTemplate(
      {
        versi: 1,
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
  /50 nama petugas/,
  'lebih dari 50 petugas harus ditolak'
);

await assert.rejects(
  () =>
    buatWorkbookTemplate(
      {
        versi: 1,
        jenis: Array.from({ length: 15 }, (_, i) => ({ id: i + 1, nama: `Jenis ${i + 1}`, urutan: i + 1 })),
        petugas: [{ id: 1, nama: 'Budi' }],
        penugasan: [
          { id: 1, petugas_id: 1, jenis_kegiatan_id: 1, nama_pekerjaan: 'UJI', bulan: 1, tahun: 2026, honor: 1000 },
        ],
      },
      { tahun: 2026, templateBuffer }
    ),
  /14 jenis kegiatan/,
  'lebih dari 14 jenis harus ditolak'
);

await assert.rejects(
  () =>
    buatWorkbookTemplate(
      {
        versi: 1,
        jenis: [{ id: 1, nama: 'Survei', urutan: 1 }],
        petugas: [{ id: 1, nama: 'Budi' }],
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
  /300 baris penugasan/,
  'lebih dari 300 baris harus ditolak'
);

console.log('OK batas 300 baris / 50 petugas / 14 jenis ditolak dengan pesan jelas');
