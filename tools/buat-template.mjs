/**
 * Bangun ulang template bawaan aplikasi dari template asli BPS.
 *
 * Perubahan yang dilakukan:
 *  - Rekap Honor Bulanan : baris petugas 6..105 (100 petugas), baris TOTAL pindah 57 -> 107
 *  - Rekap Jenis Kegiatan: baris petugas 6..105
 *  - Formula total per baris ditulis ulang (template asli memakai =N6 / =L6 untuk semua baris)
 *  - Conditional formatting B6:M55 -> B6:M105
 *  - Dashboard menunjuk N107 dan COUNTA(A6:A105)
 *
 * Jalankan: node tools/buat-template.mjs "<template-asli.xlsx>" "public/data/template-matriks.xlsx"
 */
import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';

const sumber = process.argv[2];
const tujuan = process.argv[3] || 'public/data/template-matriks.xlsx';

const BARIS_AWAL = 6;
const BARIS_AKHIR = 105; // 100 petugas
const BARIS_DATA_AWAL = 5;
const BARIS_DATA_AKHIR = 304;
const KOLOM_JENIS_AWAL = 2; // B
const KOLOM_JENIS_AKHIR = 11; // K (10 jenis pada template asli)

if (!sumber) {
  console.error('Pakai: node tools/buat-template.mjs "<template-asli.xlsx>" [keluaran.xlsx]');
  process.exit(1);
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(sumber);

/* ------------------------------------------------------------------ utilitas */
const salinGaya = (dari, ke) => {
  ke.style = JSON.parse(JSON.stringify(dari.style || {}));
};

const huruf = (kolom) => {
  let sisa = kolom;
  let hasil = '';
  while (sisa > 0) {
    const s = (sisa - 1) % 26;
    hasil = String.fromCharCode(65 + s) + hasil;
    sisa = Math.floor((sisa - 1) / 26);
  }
  return hasil;
};

const bersihkanNilai = (sheet, barisAwal, barisAkhir, kolomAwal, kolomAkhir) => {
  for (let r = barisAwal; r <= barisAkhir; r += 1) {
    for (let c = kolomAwal; c <= kolomAkhir; c += 1) {
      sheet.getRow(r).getCell(c).value = null;
    }
  }
};

const jumlahKolom = (sheet) => Math.max(sheet.columnCount, 15);

/* ------------------------------------------- 1. Rekap Honor Bulanan -------- */
const bulanan = wb.getWorksheet('Rekap Honor Bulanan');
if (!bulanan) throw new Error('Sheet "Rekap Honor Bulanan" tidak ditemukan.');

// Simpan pola gaya baris genap (6) dan ganjil (7) sebelum ditimpa.
const polaBulanan = {
  genap: Array.from({ length: jumlahKolom(bulanan) + 1 }, (_, c) =>
    c === 0 ? null : JSON.parse(JSON.stringify(bulanan.getRow(6).getCell(c).style || {}))
  ),
  ganjil: Array.from({ length: jumlahKolom(bulanan) + 1 }, (_, c) =>
    c === 0 ? null : JSON.parse(JSON.stringify(bulanan.getRow(7).getCell(c).style || {}))
  ),
};

// Bersihkan seluruh isi lama baris 6..200 (nilai & formula), gaya dipertahankan.
bersihkanNilai(bulanan, BARIS_AWAL, 200, 1, jumlahKolom(bulanan));

for (let r = BARIS_AWAL; r <= BARIS_AKHIR; r += 1) {
  const row = bulanan.getRow(r);
  const pola = r % 2 === 0 ? polaBulanan.genap : polaBulanan.ganjil;
  for (let c = 1; c <= jumlahKolom(bulanan); c += 1) {
    if (pola[c]) salinGaya({ style: pola[c] }, row.getCell(c));
  }

  for (let c = 2; c <= 13; c += 1) {
    row.getCell(c).value = {
      formula: `IF($A${r}="","",SUMIFS('Data Penugasan'!$G$${BARIS_DATA_AWAL}:$G$${BARIS_DATA_AKHIR},'Data Penugasan'!$B$${BARIS_DATA_AWAL}:$B$${BARIS_DATA_AKHIR},$A${r},'Data Penugasan'!$E$${BARIS_DATA_AWAL}:$E$${BARIS_DATA_AKHIR},${huruf(c)}$5,'Data Penugasan'!$F$${BARIS_DATA_AWAL}:$F$${BARIS_DATA_AKHIR},$B$3))`,
    };
  }
  row.getCell(14).value = { formula: `IF($A${r}="","",SUM(B${r}:M${r}))` };
  row.getCell(15).value = {
    formula: `IF($A${r}="","",COUNTIFS('Data Penugasan'!$B$${BARIS_DATA_AWAL}:$B$${BARIS_DATA_AKHIR},$A${r},'Data Penugasan'!$F$${BARIS_DATA_AWAL}:$F$${BARIS_DATA_AKHIR},$B$3))`,
  };
}

// Baris TOTAL: 2 baris setelah data terakhir (mengikuti jarak asli 55 -> 57).
const barisTotal = BARIS_AKHIR + 2; // 107
const gayaTotal = Array.from({ length: jumlahKolom(bulanan) + 1 }, (_, c) =>
  c === 0 ? null : JSON.parse(JSON.stringify(bulanan.getRow(57).getCell(c).style || {}))
);
bulanan.getRow(barisTotal).getCell(1).value = 'TOTAL';
for (let c = 1; c <= jumlahKolom(bulanan); c += 1) {
  if (gayaTotal[c]) salinGaya({ style: gayaTotal[c] }, bulanan.getRow(barisTotal).getCell(c));
}
for (let c = 2; c <= 15; c += 1) {
  bulanan.getRow(barisTotal).getCell(c).value = {
    formula: `SUM(${huruf(c)}${BARIS_AWAL}:${huruf(c)}${BARIS_AKHIR})`,
  };
}
bulanan.getRow(barisTotal).getCell(1).value = 'TOTAL';

// Conditional formatting (color scale) ikut diperluas.
for (const cf of bulanan.conditionalFormattings || []) {
  cf.ref = `B${BARIS_AWAL}:M${BARIS_AKHIR}`;
}

/* ---------------------------------------- 2. Rekap Jenis Kegiatan --------- */
const jenisSheet = wb.getWorksheet('Rekap Jenis Kegiatan');
if (!jenisSheet) throw new Error('Sheet "Rekap Jenis Kegiatan" tidak ditemukan.');

const polaJenis = {
  genap: Array.from({ length: jumlahKolom(jenisSheet) + 1 }, (_, c) =>
    c === 0 ? null : JSON.parse(JSON.stringify(jenisSheet.getRow(6).getCell(c).style || {}))
  ),
  ganjil: Array.from({ length: jumlahKolom(jenisSheet) + 1 }, (_, c) =>
    c === 0 ? null : JSON.parse(JSON.stringify(jenisSheet.getRow(7).getCell(c).style || {}))
  ),
};

bersihkanNilai(jenisSheet, BARIS_AWAL, 200, 1, jumlahKolom(jenisSheet));

for (let r = BARIS_AWAL; r <= BARIS_AKHIR; r += 1) {
  const row = jenisSheet.getRow(r);
  const pola = r % 2 === 0 ? polaJenis.genap : polaJenis.ganjil;
  for (let c = 1; c <= jumlahKolom(jenisSheet); c += 1) {
    if (pola[c]) salinGaya({ style: pola[c] }, row.getCell(c));
  }

  for (let c = KOLOM_JENIS_AWAL; c <= KOLOM_JENIS_AKHIR; c += 1) {
    row.getCell(c).value = {
      formula: `IF($A${r}="","",SUMIFS('Data Penugasan'!$G$${BARIS_DATA_AWAL}:$G$${BARIS_DATA_AKHIR},'Data Penugasan'!$B$${BARIS_DATA_AWAL}:$B$${BARIS_DATA_AKHIR},$A${r},'Data Penugasan'!$C$${BARIS_DATA_AWAL}:$C$${BARIS_DATA_AKHIR},${huruf(c)}$5,'Data Penugasan'!$F$${BARIS_DATA_AWAL}:$F$${BARIS_DATA_AKHIR},$B$3))`,
    };
  }
  row.getCell(KOLOM_JENIS_AKHIR + 1).value = {
    formula: `IF($A${r}="","",SUM(B${r}:${huruf(KOLOM_JENIS_AKHIR)}${r}))`,
  };
}

/* --------------------------------------------------- 3. Dashboard --------- */
const dashboard = wb.getWorksheet('Dashboard');
if (!dashboard) throw new Error('Sheet "Dashboard" tidak ditemukan.');

dashboard.getCell('B5').value = { formula: `'Rekap Honor Bulanan'!N${barisTotal}` };
dashboard.getCell('B7').value = {
  formula: `COUNTA('Rekap Honor Bulanan'!A${BARIS_AWAL}:A${BARIS_AKHIR})`,
};

/* ------------------------------------------------------ 4. Simpan --------- */
wb.creator = 'Dashboard Honor & Penugasan Petugas';
wb.modified = new Date();
// Agar Excel menghitung ulang formula saat file dibuka (tidak ada nilai cache).
wb.calcProperties = { ...(wb.calcProperties || {}), fullCalcOnLoad: true };

fs.mkdirSync(path.dirname(tujuan), { recursive: true });
await wb.xlsx.writeFile(tujuan);

const info = fs.statSync(tujuan);
console.log(`Template dibuat: ${tujuan} (${info.size} byte)`);
console.log(`Petugas: baris ${BARIS_AWAL}..${BARIS_AKHIR} (${BARIS_AKHIR - BARIS_AWAL + 1} nama)`);
console.log(`TOTAL rekap bulanan: baris ${barisTotal}; Dashboard B5 -> N${barisTotal}`);
