/**
 * Impor & ekspor Excel di browser memakai ExcelJS.
 *
 * Impor membaca sheet "Data Penugasan" (dan "Referensi" bila ada).
 * Ekspor membuat workbook baru dengan dua sheet: Data Penugasan dan Referensi.
 * Sheet rekap tidak ditulis karena rekap selalu dihitung ulang oleh web.
 */

import { normalisasiDataset, rapikanTeks } from './penyimpanan.js';
import { BULAN, DAFTAR_BULAN } from '../bulan.js';

const NAMA_SHEET_DATA = 'Data Penugasan';
const NAMA_SHEET_REFERENSI = 'Referensi';

const PETA_BULAN = {
  januari: 1,
  jan: 1,
  februari: 2,
  feb: 2,
  maret: 3,
  mar: 3,
  april: 4,
  apr: 4,
  mei: 5,
  may: 5,
  juni: 6,
  jun: 6,
  juli: 7,
  jul: 7,
  agustus: 8,
  agu: 8,
  agt: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  oktober: 10,
  okt: 10,
  oct: 10,
  november: 11,
  nov: 11,
  desember: 12,
  des: 12,
  dec: 12,
};

function ambilExcelJS() {
  const exceljs = globalThis.ExcelJS;
  if (!exceljs || !exceljs.Workbook) {
    throw new Error('Pustaka ExcelJS belum termuat. Muat ulang halaman Data & Excel.');
  }
  return exceljs;
}

function normalisasiTeks(nilai) {
  return String(nilai ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function nilaiSel(cell) {
  const nilai = cell?.value;
  if (nilai === null || nilai === undefined) return '';
  if (typeof nilai !== 'object') return nilai;
  if (nilai instanceof Date) return nilai;
  if (Array.isArray(nilai.richText)) return nilai.richText.map((bagian) => bagian.text || '').join('');
  if ('result' in nilai) return nilaiSel({ value: nilai.result });
  if ('text' in nilai) return nilai.text;
  if ('error' in nilai) return '';
  return '';
}

export function parseBulan(nilai) {
  if (typeof nilai === 'number') {
    return Number.isInteger(nilai) && nilai >= 1 && nilai <= 12 ? nilai : null;
  }
  const teks = rapikanTeks(nilai).toLowerCase().replace(/\.$/, '');
  if (!teks) return null;
  const angka = Number(teks);
  if (Number.isInteger(angka) && angka >= 1 && angka <= 12) return angka;
  return PETA_BULAN[teks] ?? null;
}

export function parseTahun(nilai) {
  if (nilai === '' || nilai === null || nilai === undefined) return null;
  const angka = Number(String(nilai).trim());
  if (!Number.isInteger(angka) || angka < 2020 || angka > 65535) return null;
  return angka;
}

export function parseHonor(nilai) {
  if (typeof nilai === 'number') {
    return Number.isSafeInteger(nilai) && nilai >= 0 ? nilai : null;
  }
  let teks = String(nilai ?? '')
    .trim()
    .replace(/^rp/i, '')
    .replace(/\s/g, '');
  if (!teks) return null;
  if (/^\d{1,3}([.,]\d{3})+$/.test(teks)) teks = teks.replace(/[.,]/g, '');
  if (!/^\d+$/.test(teks)) return null;
  const angka = Number(teks);
  return Number.isSafeInteger(angka) ? angka : null;
}

function cariSheet(workbook, nama) {
  const target = nama.toLowerCase();
  return workbook.worksheets.find((sheet) => sheet.name.trim().toLowerCase() === target) || null;
}

function cariHeader(worksheet) {
  const batas = Math.min(worksheet.rowCount || 0, 40);
  for (let nomor = 1; nomor <= batas; nomor += 1) {
    const row = worksheet.getRow(nomor);
    const kolom = new Map();
    row.eachCell({ includeEmpty: false }, (cell, indeksKolom) => {
      const judul = normalisasiTeks(nilaiSel(cell));
      if (!judul) return;
      if (judul.includes('namapetugas') || judul === 'petugas') kolom.set('petugas', indeksKolom);
      else if (judul.includes('jenis')) kolom.set('jenis', indeksKolom);
      else if (judul.includes('pekerjaan') || judul.includes('kegiatan')) {
        kolom.set('pekerjaan', indeksKolom);
      } else if (judul.includes('bulan')) kolom.set('bulan', indeksKolom);
      else if (judul.includes('tahun')) kolom.set('tahun', indeksKolom);
      else if (judul.includes('honor')) kolom.set('honor', indeksKolom);
    });

    if (kolom.has('petugas') && kolom.has('bulan') && kolom.has('tahun') && kolom.has('honor')) {
      return { nomor, kolom };
    }
  }
  return null;
}

function bacaBarisData(worksheet) {
  const header = cariHeader(worksheet);
  if (!header) {
    throw new Error(
      `Baris header tidak ditemukan pada sheet "${worksheet.name}". Pastikan ada kolom Nama Petugas, Bulan, Tahun, dan Honor.`
    );
  }

  const wajib = ['petugas', 'jenis', 'pekerjaan', 'bulan', 'tahun', 'honor'];
  const hilang = wajib.filter((kunci) => !header.kolom.has(kunci));
  if (hilang.length > 0) {
    const label = {
      petugas: 'Nama Petugas',
      jenis: 'Jenis Kegiatan',
      pekerjaan: 'Nama Pekerjaan/Kegiatan',
      bulan: 'Bulan',
      tahun: 'Tahun',
      honor: 'Honor',
    };
    throw new Error(`Kolom berikut tidak ditemukan: ${hilang.map((kunci) => label[kunci]).join(', ')}.`);
  }

  const records = [];
  const errors = [];
  const terakhir = worksheet.rowCount || 0;

  for (let nomor = header.nomor + 1; nomor <= terakhir; nomor += 1) {
    const row = worksheet.getRow(nomor);
    const ambil = (kunci) => nilaiSel(row.getCell(header.kolom.get(kunci)));

    const petugas = rapikanTeks(ambil('petugas'));
    const jenis = rapikanTeks(ambil('jenis'));
    const pekerjaan = rapikanTeks(ambil('pekerjaan'));
    const bulanMentah = ambil('bulan');
    const tahunMentah = ambil('tahun');
    const honorMentah = ambil('honor');

    const kosong =
      !petugas &&
      !jenis &&
      !pekerjaan &&
      rapikanTeks(bulanMentah) === '' &&
      rapikanTeks(tahunMentah) === '' &&
      rapikanTeks(honorMentah) === '';
    if (kosong) continue;

    const masalah = [];
    if (!petugas) masalah.push('Nama petugas kosong.');
    else if (petugas.length > 150) masalah.push('Nama petugas lebih dari 150 karakter.');

    if (!jenis) masalah.push('Jenis kegiatan kosong.');
    else if (jenis.length > 100) masalah.push('Jenis kegiatan lebih dari 100 karakter.');

    if (!pekerjaan) masalah.push('Nama pekerjaan/kegiatan kosong.');
    else if (pekerjaan.length > 255) masalah.push('Nama pekerjaan/kegiatan lebih dari 255 karakter.');

    const bulan = parseBulan(bulanMentah);
    if (bulan === null) masalah.push('Bulan tidak valid (gunakan Januari–Desember atau 1–12).');

    const tahun = parseTahun(tahunMentah);
    if (tahun === null) masalah.push('Tahun tidak valid (minimal 2020).');

    const honor = parseHonor(honorMentah);
    if (honor === null) masalah.push('Honor harus angka bulat minimal 0.');

    if (masalah.length > 0) {
      errors.push({ baris: nomor, masalah });
      continue;
    }

    records.push({
      baris: nomor,
      petugas,
      jenis,
      pekerjaan,
      bulan,
      tahun,
      honor,
    });
  }

  return { header, records, errors };
}

function bacaReferensi(workbook) {
  const sheet = cariSheet(workbook, NAMA_SHEET_REFERENSI);
  if (!sheet) return [];

  const hasil = [];
  const terpakai = new Set();
  const terakhir = sheet.rowCount || 0;
  for (let nomor = 1; nomor <= terakhir; nomor += 1) {
    const teks = rapikanTeks(nilaiSel(sheet.getRow(nomor).getCell(1)));
    if (!teks) continue;
    if (/^daftar jenis kegiatan/i.test(teks)) continue;
    if (/^petunjuk/i.test(teks)) continue;
    if (teks.length > 100) continue;
    const kunci = teks.toLowerCase();
    if (terpakai.has(kunci)) continue;
    terpakai.add(kunci);
    hasil.push(teks);
  }
  return hasil;
}

function bangunDataset(records, referensi) {
  const jenisMap = new Map();
  const jenis = [];
  const tambahJenis = (nama) => {
    const teks = rapikanTeks(nama);
    if (!teks) return;
    const kunci = teks.toLowerCase();
    if (jenisMap.has(kunci)) return;
    const baris = { id: jenis.length + 1, nama: teks, urutan: jenis.length + 1 };
    jenisMap.set(kunci, baris);
    jenis.push(baris);
  };

  for (const nama of referensi) tambahJenis(nama);
  for (const record of records) tambahJenis(record.jenis);

  const petugasMap = new Map();
  const petugas = [];
  const tambahPetugas = (nama) => {
    const teks = rapikanTeks(nama);
    const kunci = teks.toLowerCase();
    if (petugasMap.has(kunci)) return petugasMap.get(kunci);
    const baris = { id: petugas.length + 1, nama: teks };
    petugasMap.set(kunci, baris);
    petugas.push(baris);
    return baris;
  };

  const penugasan = records.map((record, indeks) => {
    const orang = tambahPetugas(record.petugas);
    const kategori = jenisMap.get(record.jenis.toLowerCase());
    return {
      id: indeks + 1,
      petugas_id: orang.id,
      jenis_kegiatan_id: kategori.id,
      nama_pekerjaan: record.pekerjaan,
      bulan: record.bulan,
      tahun: record.tahun,
      honor: record.honor,
    };
  });

  return normalisasiDataset({ versi: 1, jenis, petugas, penugasan });
}

export function ringkasanDataset(dataset) {
  const tahun = [...new Set(dataset.penugasan.map((baris) => Number(baris.tahun)))].sort(
    (a, b) => b - a
  );
  return {
    jumlahBaris: dataset.penugasan.length,
    jumlahPetugas: dataset.petugas.length,
    jumlahJenis: dataset.jenis.length,
    tahun,
    totalHonor: dataset.penugasan.reduce((total, baris) => total + Number(baris.honor), 0),
  };
}

/** Baca file .xlsx (File/Blob) menjadi dataset + daftar baris bermasalah. */
export async function imporFileExcel(file) {
  const exceljs = ambilExcelJS();
  const buffer = await file.arrayBuffer();
  const workbook = new exceljs.Workbook();

  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw new Error('File tidak dapat dibaca. Pastikan file berformat .xlsx dan tidak rusak.');
  }

  let worksheet = cariSheet(workbook, NAMA_SHEET_DATA);
  if (!worksheet) {
    worksheet = workbook.worksheets.find((sheet) => cariHeader(sheet));
  }
  if (!worksheet) {
    throw new Error(
      `Sheet "${NAMA_SHEET_DATA}" tidak ditemukan. Gunakan file template yang memiliki kolom Nama Petugas, Bulan, Tahun, dan Honor.`
    );
  }

  const { records, errors } = bacaBarisData(worksheet);
  const referensi = bacaReferensi(workbook);
  const data = bangunDataset(records, referensi);

  return {
    data,
    errors,
    sheet: worksheet.name,
    ringkasan: ringkasanDataset(data),
  };
}

function gayaHeader(cell) {
  cell.font = { bold: true, color: { argb: 'FF17324D' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' } };
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  cell.border = {
    top: { style: 'thin', color: { argb: 'FF9FB3C8' } },
    left: { style: 'thin', color: { argb: 'FF9FB3C8' } },
    bottom: { style: 'thin', color: { argb: 'FF9FB3C8' } },
    right: { style: 'thin', color: { argb: 'FF9FB3C8' } },
  };
}

function isiSheetData(workbook, dataset) {
  const sheet = workbook.addWorksheet(NAMA_SHEET_DATA, {
    views: [{ state: 'frozen', ySplit: 4 }],
  });

  sheet.columns = [
    { width: 6 },
    { width: 26 },
    { width: 24 },
    { width: 48 },
    { width: 14 },
    { width: 10 },
    { width: 16 },
  ];

  sheet.mergeCells('A1:G1');
  const judul = sheet.getCell('A1');
  judul.value = 'TEMPLATE DATA PENUGASAN DAN HONOR PETUGAS';
  judul.font = { bold: true, size: 14, color: { argb: 'FF0B2E4F' } };
  judul.alignment = { vertical: 'middle' };
  sheet.getRow(1).height = 24;

  sheet.mergeCells('A2:G2');
  const petunjuk = sheet.getCell('A2');
  petunjuk.value =
    'Satu baris untuk setiap penugasan. Bulan diisi Januari–Desember, honor berupa angka bulat rupiah.';
  petunjuk.font = { italic: true, size: 10, color: { argb: 'FF5B7188' } };

  const headers = [
    'No.',
    'Nama Petugas',
    'Jenis Kegiatan',
    'Nama Pekerjaan/Kegiatan',
    'Bulan',
    'Tahun',
    'Honor (Rp)',
  ];
  headers.forEach((teks, indeks) => {
    const cell = sheet.getRow(4).getCell(indeks + 1);
    cell.value = teks;
    gayaHeader(cell);
  });
  sheet.getRow(4).height = 28;

  const terurut = dataset.penugasan
    .slice()
    .sort((a, b) => a.tahun - b.tahun || a.bulan - b.bulan || a.id - b.id);

  let nomor = 5;
  for (const baris of terurut) {
    const orang = dataset.petugas.find((item) => Number(item.id) === Number(baris.petugas_id));
    const jenis = dataset.jenis.find(
      (item) => Number(item.id) === Number(baris.jenis_kegiatan_id)
    );

    sheet.getCell(nomor, 1).value = nomor - 4;
    sheet.getCell(nomor, 1).alignment = { horizontal: 'center' };
    sheet.getCell(nomor, 2).value = orang?.nama || '';
    sheet.getCell(nomor, 3).value = jenis?.nama || '';
    sheet.getCell(nomor, 4).value = baris.nama_pekerjaan;
    sheet.getCell(nomor, 5).value = BULAN[baris.bulan] || '';
    sheet.getCell(nomor, 6).value = baris.tahun;
    sheet.getCell(nomor, 7).value = baris.honor;
    sheet.getCell(nomor, 7).numFmt = '#,##0';

    const daftarBulan = DAFTAR_BULAN.map((bulan) => bulan.nama).join(',');
    sheet.getCell(nomor, 5).dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: [`"${daftarBulan}"`],
    };
    sheet.getCell(nomor, 6).dataValidation = {
      type: 'whole',
      operator: 'between',
      allowBlank: false,
      formulae: [2020, 2100],
    };
    sheet.getCell(nomor, 7).dataValidation = {
      type: 'decimal',
      operator: 'greaterThanOrEqual',
      allowBlank: false,
      formulae: [0],
    };

    nomor += 1;
  }

  if (terurut.length > 0) {
    sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: nomor - 1, column: 7 } };
  }

  return sheet;
}

function isiSheetReferensi(workbook, dataset) {
  const sheet = workbook.addWorksheet(NAMA_SHEET_REFERENSI);
  sheet.columns = [{ width: 42 }, { width: 4 }, { width: 50 }];

  sheet.mergeCells('A1:C1');
  const judul = sheet.getCell('A1');
  judul.value = 'DAFTAR JENIS KEGIATAN';
  judul.font = { bold: true, size: 14, color: { argb: 'FF0B2E4F' } };

  sheet.getCell('C2').value =
    'Daftar ini dipakai sebagai pilihan jenis kegiatan. Ubah di halaman Daftar Jenis Kegiatan pada web.';

  const jenis = dataset.jenis.slice().sort((a, b) => a.urutan - b.urutan || a.id - b.id);
  jenis.forEach((baris, indeks) => {
    const cell = sheet.getCell(3 + indeks, 1);
    cell.value = baris.nama;
  });

  return sheet;
}

export function buatWorkbook(dataset) {
  const exceljs = ambilExcelJS();
  const workbook = new exceljs.Workbook();
  workbook.creator = 'Dashboard Honor & Penugasan Petugas';
  workbook.created = new Date();
  workbook.modified = new Date();

  isiSheetData(workbook, dataset);
  isiSheetReferensi(workbook, dataset);

  return workbook;
}

function unduhBlob(buffer, namaFile) {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const tautan = document.createElement('a');
  tautan.href = url;
  tautan.download = namaFile;
  document.body.appendChild(tautan);
  tautan.click();
  tautan.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function capTanggal(tanggal = new Date()) {
  return [
    tanggal.getFullYear(),
    String(tanggal.getMonth() + 1).padStart(2, '0'),
    String(tanggal.getDate()).padStart(2, '0'),
  ].join('-');
}

export async function eksporDataset(dataset, { namaFile } = {}) {
  const workbook = buatWorkbook(dataset);
  const buffer = await workbook.xlsx.writeBuffer();
  unduhBlob(buffer, namaFile || `Data_Penugasan_Honor_${capTanggal()}.xlsx`);
}

/* -------------------------------------------------------------------------
   Ekspor mengikuti template asli

   File template dibundel di /data/template-matriks.xlsx. Isinya diisi ulang
   dari data web, sementara formula rekap dan dashboard template dibiarkan
   hidup supaya rekap di Excel ikut menghitung sendiri.
   ------------------------------------------------------------------------- */
export const BATAS_TEMPLATE = {
  barisData: 300, // 'Data Penugasan' baris 5..304
  barisRekapAwal: 6, // baris pertama daftar petugas di sheet rekap
  barisRekapAkhir: 55, // baris terakhir daftar petugas (50 petugas)
  kolomJenisMaks: 14, // kolom jenis yang muat sebelum kolom total
  namaSheetData: NAMA_SHEET_DATA,
  namaSheetReferensi: NAMA_SHEET_REFERENSI,
  namaSheetRekapBulanan: 'Rekap Honor Bulanan',
  namaSheetRekapJenis: 'Rekap Jenis Kegiatan',
  urlTemplate: '/data/template-matriks.xlsx',
};

function ambilSheet(workbook, nama) {
  const sheet = workbook.getWorksheet(nama);
  if (!sheet) {
    throw new Error(
      `File template tidak memiliki sheet "${nama}". Unduh ulang aplikasi atau hubungi pengelola.`
    );
  }
  return sheet;
}

function hurufKolom(indeks) {
  let sisa = indeks;
  let hasil = '';
  while (sisa > 0) {
    const sisaBagi = (sisa - 1) % 26;
    hasil = String.fromCharCode(65 + sisaBagi) + hasil;
    sisa = Math.floor((sisa - 1) / 26);
  }
  return hasil;
}

/** Kosongkan isi sel (nilai & formula) tanpa menghapus gaya/border. */
function kosongkan(sheet, barisAwal, barisAkhir, kolomAwal, kolomAkhir) {
  for (let baris = barisAwal; baris <= barisAkhir; baris += 1) {
    const row = sheet.getRow(baris);
    for (let kolom = kolomAwal; kolom <= kolomAkhir; kolom += 1) {
      row.getCell(kolom).value = null;
    }
  }
}

function urutkanPenugasan(penugasan) {
  return penugasan
    .slice()
    .sort((a, b) => a.tahun - b.tahun || a.bulan - b.bulan || a.id - b.id);
}

function isiDataPenugasanTemplate(workbook, dataset) {
  const sheet = ambilSheet(workbook, BATAS_TEMPLATE.namaSheetData);
  const baris = urutkanPenugasan(dataset.penugasan);
  if (baris.length > BATAS_TEMPLATE.barisData) {
    throw new Error(
      `Template Excel hanya menampung ${BATAS_TEMPLATE.barisData} baris penugasan, sedangkan data saat ini ${baris.length} baris. Gunakan "Unduh Data Excel" biasa, atau pisahkan data per tahun.`
    );
  }

  kosongkan(sheet, 5, 4 + BATAS_TEMPLATE.barisData, 2, 7);

  baris.forEach((data, indeks) => {
    const nomor = 5 + indeks;
    const orang = dataset.petugas.find((item) => Number(item.id) === Number(data.petugas_id));
    const jenis = dataset.jenis.find(
      (item) => Number(item.id) === Number(data.jenis_kegiatan_id)
    );
    sheet.getCell(nomor, 2).value = orang?.nama || '';
    sheet.getCell(nomor, 3).value = jenis?.nama || '';
    sheet.getCell(nomor, 4).value = data.nama_pekerjaan;
    sheet.getCell(nomor, 5).value = BULAN[data.bulan] || '';
    sheet.getCell(nomor, 6).value = data.tahun;
    sheet.getCell(nomor, 7).value = data.honor;
  });

  return sheet;
}

function isiReferensiTemplate(workbook, dataset) {
  const sheet = ambilSheet(workbook, BATAS_TEMPLATE.namaSheetReferensi);
  kosongkan(sheet, 3, 40, 1, 1);

  const jenis = dataset.jenis.slice().sort((a, b) => a.urutan - b.urutan || a.id - b.id);
  jenis.forEach((data, indeks) => {
    sheet.getCell(3 + indeks, 1).value = data.nama;
  });

  return sheet;
}

function isiRekapBulananTemplate(workbook, daftarPetugas, tahun) {
  const sheet = ambilSheet(workbook, BATAS_TEMPLATE.namaSheetRekapBulanan);
  sheet.getCell('B3').value = tahun;

  const { barisRekapAwal, barisRekapAkhir } = BATAS_TEMPLATE;
  kosongkan(sheet, barisRekapAwal, barisRekapAkhir, 1, 1);
  daftarPetugas.forEach((nama, indeks) => {
    sheet.getCell(barisRekapAwal + indeks, 1).value = nama;
  });

  return sheet;
}

function isiRekapJenisTemplate(workbook, daftarJenis, daftarPetugas) {
  const sheet = ambilSheet(workbook, BATAS_TEMPLATE.namaSheetRekapJenis);
  const { barisRekapAwal, barisRekapAkhir, kolomJenisMaks } = BATAS_TEMPLATE;
  const kolomTerakhir = kolomJenisMaks + 2;

  kosongkan(sheet, 5, 5, 2, kolomTerakhir);
  kosongkan(sheet, barisRekapAwal, barisRekapAkhir, 1, kolomTerakhir);

  daftarJenis.forEach((nama, indeks) => {
    sheet.getCell(5, 2 + indeks).value = nama;
  });
  const kolomTotal = 2 + daftarJenis.length;
  if (daftarJenis.length > 0) {
    sheet.getCell(5, kolomTotal).value = 'Total Honor';
  }

  const kolomJenisAwal = hurufKolom(2);
  const kolomJenisAkhir = hurufKolom(Math.max(kolomTotal - 1, 2));

  for (let baris = barisRekapAwal; baris <= barisRekapAkhir; baris += 1) {
    sheet.getCell(baris, 1).value = daftarPetugas[baris - barisRekapAwal] || null;

    daftarJenis.forEach((_, indeks) => {
      const kolom = 2 + indeks;
      sheet.getCell(baris, kolom).value = {
        formula: `IF($A${baris}="","",SUMIFS('Data Penugasan'!$G$5:$G$${4 + BATAS_TEMPLATE.barisData},'Data Penugasan'!$B$5:$B$${4 + BATAS_TEMPLATE.barisData},$A${baris},'Data Penugasan'!$C$5:$C$${4 + BATAS_TEMPLATE.barisData},${hurufKolom(kolom)}$5,'Data Penugasan'!$F$5:$F$${4 + BATAS_TEMPLATE.barisData},$B$3))`,
      };
    });

    if (daftarJenis.length > 0) {
      sheet.getCell(baris, kolomTotal).value = {
        formula: `IF($A${baris}="","",SUM(${kolomJenisAwal}${baris}:${kolomJenisAkhir}${baris}))`,
      };
    }
  }

  return sheet;
}

/** Siapkan workbook dari file template yang sudah diisi data web. */
export async function buatWorkbookTemplate(dataset, { tahun, templateBuffer } = {}) {
  const exceljs = ambilExcelJS();
  const tahunAktif = Number(tahun) || new Date().getFullYear();

  let sumber = templateBuffer;
  if (!sumber) {
    if (typeof fetch !== 'function') {
      throw new Error('File template tidak dapat dimuat di lingkungan ini.');
    }
    const respons = await fetch(BATAS_TEMPLATE.urlTemplate, { cache: 'no-store' });
    if (!respons.ok) {
      throw new Error(
        'File template Excel tidak ditemukan. Pastikan berkas data/template-matriks.xlsx tersedia di aplikasi.'
      );
    }
    sumber = await respons.arrayBuffer();
  }

  const workbook = new exceljs.Workbook();
  try {
    await workbook.xlsx.load(sumber instanceof ArrayBuffer ? sumber : new Uint8Array(sumber));
  } catch {
    throw new Error('File template Excel tidak dapat dibaca.');
  }

  const petugasPenugasan = new Set(dataset.penugasan.map((data) => Number(data.petugas_id)));
  const daftarPetugas = dataset.petugas
    .filter((orang) => petugasPenugasan.has(Number(orang.id)))
    .map((orang) => orang.nama)
    .sort((a, b) => a.localeCompare(b, 'id'));

  if (daftarPetugas.length > BATAS_TEMPLATE.barisRekapAkhir - BATAS_TEMPLATE.barisRekapAwal + 1) {
    throw new Error(
      `Sheet rekap template hanya menampung 50 nama petugas, sedangkan data saat ini ${daftarPetugas.length} petugas. Gunakan "Unduh Data Excel" biasa, atau pecah data per unit kerja.`
    );
  }

  const daftarJenis = dataset.jenis
    .slice()
    .sort((a, b) => a.urutan - b.urutan || a.id - b.id)
    .map((data) => data.nama);

  if (daftarJenis.length > BATAS_TEMPLATE.kolomJenisMaks) {
    throw new Error(
      `Sheet rekap template hanya menampung ${BATAS_TEMPLATE.kolomJenisMaks} jenis kegiatan, sedangkan data saat ini ${daftarJenis.length} jenis. Kurangi jenis kegiatan atau gunakan "Unduh Data Excel" biasa.`
    );
  }

  isiDataPenugasanTemplate(workbook, dataset);
  isiReferensiTemplate(workbook, dataset);
  isiRekapBulananTemplate(workbook, daftarPetugas, tahunAktif);
  isiRekapJenisTemplate(workbook, daftarJenis, daftarPetugas);

  workbook.creator = 'Dashboard Honor & Penugasan Petugas';
  workbook.modified = new Date();

  return workbook;
}

export async function eksporTemplate(dataset, { tahun, namaFile, templateBuffer } = {}) {
  const workbook = await buatWorkbookTemplate(dataset, { tahun, templateBuffer });
  const buffer = await workbook.xlsx.writeBuffer();
  const tahunAktif = Number(tahun) || new Date().getFullYear();
  unduhBlob(
    buffer,
    namaFile || `Matriks_Penugasan_dan_Honor_${tahunAktif}_${capTanggal()}.xlsx`
  );
}
