/**
 * Impor & ekspor Excel di browser memakai ExcelJS.
 *
 * Impor membaca seluruh isi template:
 *   - "Data Penugasan"                : daftar penugasan (satu baris per petugas per kegiatan)
 *   - "Referensi"                     : daftar jenis kegiatan
 *   - "Rekap Honor Bulanan" kolom A   : daftar nama petugas (baris 6 dst)
 *   - "Rekap Jenis Kegiatan" kolom A  : daftar nama petugas
 *   - "Rekap Jenis Kegiatan" baris 5  : judul kolom jenis kegiatan
 *   - "Rekap Honor Bulanan" sel B3    : tahun analisis
 *
 * Ekspor memakai file template yang diimpor pengguna (bila ada) sebagai cetakan,
 * sehingga struktur dan formatnya tetap sama. Bila belum ada, dipakai template
 * bawaan aplikasi di /data/template-matriks.xlsx.
 */

import { kolomKosong, normalisasiDataset, rapikanTeks } from './penyimpanan.js';
import { BULAN, DAFTAR_BULAN } from '../bulan.js';

const NAMA_SHEET_DATA = 'Data Penugasan';
const NAMA_SHEET_REFERENSI = 'Referensi';
const NAMA_SHEET_REKAP_BULANAN = 'Rekap Honor Bulanan';
const NAMA_SHEET_REKAP_JENIS = 'Rekap Jenis Kegiatan';

const SEL_TAHUN_REKAP = 'B3';
const LABEL_TOTAL_JENIS = 'totalhonor';
const LABEL_JUMLAH_PENUGASAN = 'jumlahpenugasan';

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
  worksheet.eachRow((row, nomor) => {
    if (nomor <= header.nomor) return;
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
    if (kosong) return;

    const masalah = [];
    // Hanya nama petugas yang wajib. Kolom lain boleh kosong: baris tetap
    // diimpor sebagai "belum lengkap" supaya bisa diisi di halaman Penugasan.
    if (!petugas) masalah.push('Nama petugas kosong.');
    else if (petugas.length > 150) masalah.push('Nama petugas lebih dari 150 karakter.');

    if (jenis && jenis.length > 100) masalah.push('Jenis kegiatan lebih dari 100 karakter.');
    if (pekerjaan && pekerjaan.length > 255) {
      masalah.push('Nama pekerjaan/kegiatan lebih dari 255 karakter.');
    }

    let bulan = null;
    if (rapikanTeks(bulanMentah) !== '') {
      bulan = parseBulan(bulanMentah);
      if (bulan === null) masalah.push('Bulan tidak valid (gunakan Januari–Desember atau 1–12).');
    }

    let tahun = null;
    if (rapikanTeks(tahunMentah) !== '') {
      tahun = parseTahun(tahunMentah);
      if (tahun === null) masalah.push('Tahun tidak valid (minimal 2020).');
    }

    let honor = null;
    if (rapikanTeks(honorMentah) !== '') {
      honor = parseHonor(honorMentah);
      if (honor === null) masalah.push('Honor harus angka bulat minimal 0.');
    }

    if (masalah.length > 0) {
      errors.push({ baris: nomor, masalah });
      return;
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
  });

  return { header, records, errors };
}

function bacaReferensi(workbook) {
  const sheet = cariSheet(workbook, NAMA_SHEET_REFERENSI);
  if (!sheet) return [];

  const hasil = [];
  const terpakai = new Set();
  sheet.eachRow((row) => {
    const teks = rapikanTeks(nilaiSel(row.getCell(1)));
    if (!teks || teks.length > 100) return;
    if (/^daftar jenis kegiatan/i.test(teks) || /^petunjuk/i.test(teks)) return;
    const kunci = teks.toLowerCase();
    if (terpakai.has(kunci)) return;
    terpakai.add(kunci);
    hasil.push(teks);
  });
  return hasil;
}

/* -------------------------------------------------------------------------
   Struktur template

   Kapasitas dan posisi kolom dibaca dari file template, bukan dipatok di kode,
   supaya bila pengguna menambah baris/kolom di file sendiri, ekspor ikut.
   ------------------------------------------------------------------------- */
const STRUKTUR_BAWAAN = {
  dataAwal: 5,
  dataAkhir: 304,
  petugasAwal: 6,
  petugasAkhir: 55,
  barisTotalBulanan: null,
  kolomBulanAwal: 2,
  kolomBulanAkhir: 13,
  kolomTotalBulanan: 14,
  kolomJumlahPenugasan: 15,
  kolomJenisAwal: 2,
  kolomJenisAkhir: 11,
  kolomTotalJenis: 12,
  kolomJenisMaks: 10,
};

function formulaSel(cell) {
  const nilai = cell?.value;
  if (nilai && typeof nilai === 'object' && typeof nilai.formula === 'string') return nilai.formula;
  return '';
}

function kolomDariJudul(sheet, baris, judul) {
  const target = normalisasiTeks(judul);
  const batas = Math.max(sheet.columnCount || 0, 15);
  for (let kolom = 1; kolom <= batas; kolom += 1) {
    if (normalisasiTeks(nilaiSel(sheet.getRow(baris).getCell(kolom))) === target) return kolom;
  }
  return null;
}

/** Baca kapasitas & posisi kolom dari file template. */
export function deteksiStrukturTemplate(workbook) {
  const struktur = { ...STRUKTUR_BAWAAN };
  const bulanan = cariSheet(workbook, NAMA_SHEET_REKAP_BULANAN);
  const jenis = cariSheet(workbook, NAMA_SHEET_REKAP_JENIS);

  if (bulanan) {
    const kolomTotal = kolomDariJudul(bulanan, 5, 'Total Setahun');
    const kolomJumlah = kolomDariJudul(bulanan, 5, 'Jumlah Penugasan');
    if (kolomTotal) {
      struktur.kolomTotalBulanan = kolomTotal;
      struktur.kolomBulanAwal = 2;
      struktur.kolomBulanAkhir = kolomTotal - 1;
    }
    if (kolomJumlah) struktur.kolomJumlahPenugasan = kolomJumlah;

    // Baris petugas terakhir = baris terakhir yang masih berformula SUMIFS/COUNTIFS.
    let terakhir = 0;
    for (let baris = struktur.petugasAwal; baris <= 1000; baris += 1) {
      const formula = formulaSel(bulanan.getRow(baris).getCell(2));
      if (formula && /SUMIFS/i.test(formula)) terakhir = baris;
      if (baris - terakhir > 20 && terakhir > 0) break;
    }
    if (terakhir === 0) {
      // Template tanpa formula: pakai baris terakhir yang berisi nama petugas.
      for (let baris = struktur.petugasAwal; baris <= struktur.petugasAwal + 999; baris += 1) {
        const teks = rapikanTeks(nilaiSel(bulanan.getRow(baris).getCell(1)));
        if (!teks || normalisasiTeks(teks) === 'total') continue;
        terakhir = baris;
      }
    }
    if (terakhir > 0) struktur.petugasAkhir = terakhir;

    // Baris TOTAL rekap bulanan.
    for (let baris = struktur.petugasAwal; baris <= struktur.petugasAkhir + 20; baris += 1) {
      if (normalisasiTeks(nilaiSel(bulanan.getRow(baris).getCell(1))) === 'total') {
        struktur.barisTotalBulanan = baris;
        break;
      }
    }

    // Rentang sheet Data Penugasan dari formula pertama.
    const contoh = formulaSel(bulanan.getRow(struktur.petugasAwal).getCell(2));
    const rentang = contoh.match(/\$([A-Z]+)\$(\d+):\$[A-Z]+\$(\d+)/);
    if (rentang) {
      struktur.dataAwal = Number(rentang[2]);
      struktur.dataAkhir = Number(rentang[3]);
    }
  }

  if (jenis) {
    let akhir = null;
    for (let kolom = 2; kolom <= Math.max(jenis.columnCount || 0, 15); kolom += 1) {
      const judul = normalisasiTeks(nilaiSel(jenis.getRow(5).getCell(kolom)));
      if (!judul) continue;
      if (judul === LABEL_TOTAL_JENIS) {
        struktur.kolomTotalJenis = kolom;
        break;
      }
      akhir = kolom;
    }
    if (!struktur.kolomTotalJenis || !akhir) {
      struktur.kolomTotalJenis = (akhir || struktur.kolomJenisAkhir) + 1;
    }
    struktur.kolomJenisAwal = 2;
    struktur.kolomJenisAkhir = struktur.kolomTotalJenis - 1;
    // Banyak jenis yang masih muat: sampai kolom sebelum 'Total Honor' bila
    // kolom total boleh bergeser (kolom terpakai sheet dianggap batas akhir).
    struktur.kolomJenisMaks = Math.max(
      Math.max(jenis.columnCount || 0, struktur.kolomTotalJenis) - struktur.kolomJenisAwal,
      struktur.kolomJenisAkhir - struktur.kolomJenisAwal + 1
    );
  }

  return struktur;
}

/** Baca kolom A di seluruh baris terisi, termasuk di luar rentang formula. */
export function bacaPetugasRekap(workbook, { petugasAwal }) {
  const baca = (namaSheet) => {
    const sheet = cariSheet(workbook, namaSheet);
    if (!sheet) return [];
    const daftar = [];
    sheet.eachRow((row, nomor) => {
      if (nomor < petugasAwal) return;
      const teks = rapikanTeks(nilaiSel(row.getCell(1)));
      if (!teks || teks.length > 150) return;
      const label = normalisasiTeks(teks);
      if (label === 'namapetugas' || label === 'total') return;
      daftar.push(teks);
    });
    return daftar;
  };

  const bulanan = baca(NAMA_SHEET_REKAP_BULANAN);
  const jenis = baca(NAMA_SHEET_REKAP_JENIS);
  const daftar = [];
  const terpakai = new Set();
  const tambah = (nama) => {
    const kunci = nama.toLowerCase();
    if (terpakai.has(kunci)) return;
    terpakai.add(kunci);
    daftar.push(nama);
  };
  for (const nama of bulanan) tambah(nama);
  for (const nama of jenis) tambah(nama);

  const setBulanan = new Set(bulanan.map((nama) => nama.toLowerCase()));
  const setJenis = new Set(jenis.map((nama) => nama.toLowerCase()));
  const hanyaBulanan = daftar.filter(
    (nama) => setBulanan.has(nama.toLowerCase()) && !setJenis.has(nama.toLowerCase())
  );
  const hanyaJenis = daftar.filter(
    (nama) => setJenis.has(nama.toLowerCase()) && !setBulanan.has(nama.toLowerCase())
  );

  return { daftar, jumlahBulanan: bulanan.length, jumlahJenis: jenis.length, hanyaBulanan, hanyaJenis };
}

/** Tahun analisis dari sel B3 sheet Rekap Honor Bulanan. */
export function bacaTahunAnalisis(workbook) {
  const sheet = cariSheet(workbook, NAMA_SHEET_REKAP_BULANAN);
  if (!sheet) return null;
  const nilai = nilaiSel(sheet.getCell(SEL_TAHUN_REKAP));
  return parseTahun(typeof nilai === 'number' ? nilai : String(nilai));
}

/** Baca judul jenis sepanjang baris 5, termasuk di luar kolom cetakan ekspor. */
export function bacaJenisRekap(workbook) {
  const sheet = cariSheet(workbook, NAMA_SHEET_REKAP_JENIS);
  if (!sheet) return [];
  const hasil = [];
  sheet.getRow(5).eachCell((cell, kolom) => {
    if (kolom < 2) return;
    const teks = rapikanTeks(nilaiSel(cell));
    if (!teks || teks.length > 100) return;
    if (normalisasiTeks(teks) === LABEL_TOTAL_JENIS) return;
    hasil.push(teks);
  });
  return hasil;
}

function bufferKeBase64(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let biner = '';
  const potongan = 0x8000;
  for (let mulai = 0; mulai < bytes.length; mulai += potongan) {
    biner += String.fromCharCode.apply(null, bytes.subarray(mulai, mulai + potongan));
  }
  if (typeof btoa === 'function') return btoa(biner);
  // Padanan untuk lingkungan tanpa btoa (mis. uji Node lama).
  return Buffer.from(bytes).toString('base64');
}

export function base64KeBytes(base64) {
  if (typeof atob === 'function') {
    const biner = atob(base64);
    const bytes = new Uint8Array(biner.length);
    for (let i = 0; i < biner.length; i += 1) bytes[i] = biner.charCodeAt(i);
    return bytes;
  }
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

/** True bila workbook berisi kelima sheet template. */
export function sepertiTemplate(workbook) {
  return [
    'Dashboard',
    NAMA_SHEET_DATA,
    NAMA_SHEET_REFERENSI,
    NAMA_SHEET_REKAP_BULANAN,
    NAMA_SHEET_REKAP_JENIS,
  ].every((nama) => cariSheet(workbook, nama));
}

function bangunDataset(
  records,
  {
    referensi = [],
    jenisRekap = [],
    petugasRekap = [],
    tahunDefault = new Date().getFullYear(),
  } = {}
) {
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

  // Sheet "Referensi" adalah sumber utama daftar jenis kegiatan. Judul kolom
  // sheet "Rekap Jenis Kegiatan" hanya dipakai bila Referensi kosong, karena
  // pengguna biasanya mengubah daftar jenis di sheet Referensi lebih dulu.
  const sumberJenis = referensi.length > 0 ? referensi : jenisRekap;
  for (const nama of sumberJenis) tambahJenis(nama);
  for (const record of records) tambahJenis(record.jenis);

  const petugasMap = new Map();
  const petugas = [];
  const tambahPetugas = (nama) => {
    const teks = rapikanTeks(nama);
    if (!teks) return null;
    const kunci = teks.toLowerCase();
    if (petugasMap.has(kunci)) return petugasMap.get(kunci);
    const baris = { id: petugas.length + 1, nama: teks, urutan: petugas.length + 1 };
    petugasMap.set(kunci, baris);
    petugas.push(baris);
    return baris;
  };

  // Nama dari kolom A sheet rekap didahulukan agar urutannya seperti di file.
  for (const nama of petugasRekap) tambahPetugas(nama);

  const penugasan = records.map((record, indeks) => {
    const orang = tambahPetugas(record.petugas);
    const kategori = record.jenis ? jenisMap.get(record.jenis.toLowerCase()) : null;
    return {
      id: indeks + 1,
      petugas_id: orang.id,
      jenis_kegiatan_id: kategori ? kategori.id : null,
      nama_pekerjaan: record.pekerjaan || '',
      bulan: record.bulan ?? null,
      // Baris tanpa tahun tetap ditampung pada tahun analisis B3 / tahun aktif,
      // supaya muncul di halaman Daftar Penugasan untuk dilengkapi.
      tahun: record.tahun ?? tahunDefault,
      honor: record.honor ?? null,
    };
  });

  return normalisasiDataset({ versi: 2, jenis, petugas, penugasan });
}

export function ringkasanDataset(dataset) {
  const tahun = [...new Set(dataset.penugasan.map((baris) => Number(baris.tahun)))].sort(
    (a, b) => b - a
  );
  return {
    jumlahBaris: dataset.penugasan.length,
    jumlahPetugas: dataset.petugas.length,
    jumlahJenis: dataset.jenis.length,
    jumlahBelumLengkap: dataset.penugasan.filter((baris) => kolomKosong(baris).length > 0).length,
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

  const struktur = deteksiStrukturTemplate(workbook);
  const { records, errors } = bacaBarisData(worksheet);
  const referensi = bacaReferensi(workbook);
  const jenisRekap = bacaJenisRekap(workbook);
  const petugasRekap = bacaPetugasRekap(workbook, struktur);
  const tahunAnalisis = bacaTahunAnalisis(workbook);

  const data = bangunDataset(records, {
    referensi,
    jenisRekap,
    petugasRekap: petugasRekap.daftar,
    tahunDefault: tahunAnalisis ?? new Date().getFullYear(),
  });

  const dipakai = new Set(data.penugasan.map((baris) => Number(baris.petugas_id)));
  const tanpaPenugasan = data.petugas.filter((orang) => !dipakai.has(Number(orang.id))).length;
  const belumLengkap = data.penugasan.filter((baris) => kolomKosong(baris).length > 0).length;
  const tanpaTahun = records.filter((record) => record.tahun === null).length;

  const peringatan = [];
  if (belumLengkap > 0) {
    peringatan.push(
      `${belumLengkap} baris belum lengkap (jenis/pekerjaan/bulan/honor kosong) dan tetap disimpan. Lengkapi lewat halaman Daftar Penugasan dengan filter "Belum lengkap".`
    );
  }
  if (tanpaTahun > 0) {
    peringatan.push(
      `${tanpaTahun} baris tidak mencantumkan tahun sehingga ditempatkan pada tahun ${tahunAnalisis ?? new Date().getFullYear()} agar tetap bisa dibuka di web.`
    );
  }
  const kapasitas = struktur.petugasAkhir - struktur.petugasAwal + 1;
  const kapasitasPenugasan = struktur.dataAkhir - struktur.dataAwal + 1;
  if (petugasRekap.hanyaBulanan.length > 0) {
    peringatan.push(
      `${petugasRekap.hanyaBulanan.length} nama hanya ada di kolom A sheet Rekap Honor Bulanan: ${petugasRekap.hanyaBulanan.slice(0, 3).join(', ')}${petugasRekap.hanyaBulanan.length > 3 ? ', …' : ''}.`
    );
  }
  if (petugasRekap.hanyaJenis.length > 0) {
    peringatan.push(
      `${petugasRekap.hanyaJenis.length} nama hanya ada di kolom A sheet Rekap Jenis Kegiatan: ${petugasRekap.hanyaJenis.slice(0, 3).join(', ')}${petugasRekap.hanyaJenis.length > 3 ? ', …' : ''}.`
    );
  }

  if (jenisRekap.length > 0 && referensi.length > 0) {
    const kunciReferensi = new Set(referensi.map((nama) => nama.toLowerCase()));
    const beda = jenisRekap.filter((nama) => !kunciReferensi.has(nama.toLowerCase()));
    if (beda.length > 0) {
      peringatan.push(
        `${beda.length} judul kolom di Rekap Jenis Kegiatan tidak ada di sheet Referensi sehingga tidak ikut daftar jenis: ${beda.slice(0, 3).join(', ')}${beda.length > 3 ? ', …' : ''}.`
      );
    }
    const kunciRekap = new Set(jenisRekap.map((nama) => nama.toLowerCase()));
    const baru = referensi.filter((nama) => !kunciRekap.has(nama.toLowerCase()));
    if (baru.length > 0) {
      peringatan.push(
        `${baru.length} jenis di sheet Referensi belum ada di judul kolom Rekap Jenis Kegiatan (judul kolom diperbarui otomatis saat ekspor): ${baru.slice(0, 3).join(', ')}${baru.length > 3 ? ', …' : ''}.`
      );
    }
  }
  if (referensi.length > 0) {
    // Daftar jenis berasal dari sheet Referensi. Bila Data Penugasan masih
    // memakai jenis yang sudah dihapus dari Referensi, jenis itu tetap
    // dipertahankan agar penugasan tidak yatim, tetapi pengguna diberi tahu.
    const kunciReferensi = new Set(referensi.map((nama) => nama.toLowerCase()));
    const dariPenugasan = new Set();
    for (const record of records) {
      const nama = rapikanTeks(record.jenis);
      if (nama && !kunciReferensi.has(nama.toLowerCase())) dariPenugasan.add(nama);
    }
    if (dariPenugasan.size > 0) {
      const daftar = Array.from(dariPenugasan);
      peringatan.push(
        `${daftar.length} jenis masih dipakai di Data Penugasan tetapi tidak ada di sheet Referensi sehingga tetap ditambahkan: ${daftar.slice(0, 3).join(', ')}${daftar.length > 3 ? ', …' : ''}.`
      );
    }
  }

  if (tahunAnalisis === null) {
    peringatan.push('Sel B3 (tahun analisis) di sheet Rekap Honor Bulanan belum berisi tahun yang sah.');
  }

  const ringkasan = {
    ...ringkasanDataset(data),
    tahunAnalisis,
    jumlahPetugasRekap: petugasRekap.daftar.length,
    jumlahPetugasTanpaPenugasan: tanpaPenugasan,
    kapasitasPetugas: kapasitas,
    kapasitasJenis: struktur.kolomJenisMaks,
    kapasitasPenugasan,
  };

  return {
    data,
    errors,
    sheet: worksheet.name,
    ringkasan,
    struktur,
    peringatan,
    // File template pengguna disimpan sebagai cetakan ekspor.
    template: sepertiTemplate(workbook)
      ? { nama: file.name || 'template.xlsx', base64: bufferKeBase64(buffer), bytes: buffer.byteLength }
      : null,
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
   Ekspor mengikuti template

   File template yang dipakai:
     1. file .xlsx yang terakhir diimpor pengguna (disimpan di browser), atau
     2. template bawaan aplikasi di /data/template-matriks.xlsx.

   Isi Data Penugasan, Referensi, dan nama petugas ditulis ulang dari data web;
   formula rekap dan dashboard template dibiarkan hidup supaya Excel menghitung
   sendiri saat file dibuka.
   ------------------------------------------------------------------------- */
export const TEMPLATE_BAWAAN = {
  url: '/data/template-matriks.xlsx',
  namaFile: 'Template_Matriks_Penugasan_dan_Honor_Petugas.xlsx',
  namaSheetData: NAMA_SHEET_DATA,
  namaSheetReferensi: NAMA_SHEET_REFERENSI,
  namaSheetRekapBulanan: NAMA_SHEET_REKAP_BULANAN,
  namaSheetRekapJenis: NAMA_SHEET_REKAP_JENIS,
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

function isiDataPenugasan(workbook, dataset, struktur) {
  const sheet = ambilSheet(workbook, NAMA_SHEET_DATA);
  const baris = urutkanPenugasan(dataset.penugasan);
  const kapasitas = struktur.dataAkhir - struktur.dataAwal + 1;
  if (baris.length > kapasitas) {
    throw new Error(
      `Sheet Data Penugasan pada template hanya menampung ${kapasitas} baris, sedangkan data saat ini ${baris.length} baris. Pisahkan data per tahun atau gunakan template dengan kapasitas lebih besar.`
    );
  }

  kosongkan(sheet, struktur.dataAwal, struktur.dataAkhir, 2, 7);

  baris.forEach((data, indeks) => {
    const nomor = struktur.dataAwal + indeks;
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

function isiReferensi(workbook, dataset) {
  const sheet = ambilSheet(workbook, NAMA_SHEET_REFERENSI);

  // Bersihkan dari baris 3 sampai baris terakhir yang masih berisi data, agar
  // daftar yang menyusut pun tidak menyisakan nama lama.
  const barisTerakhirSheet = Math.max(sheet.rowCount || 0, 3);
  let terakhir = 2;
  for (let baris = 3; baris <= barisTerakhirSheet; baris += 1) {
    if (rapikanTeks(nilaiSel(sheet.getRow(baris).getCell(1)))) terakhir = baris;
  }

  const jenis = dataset.jenis.slice().sort((a, b) => a.urutan - b.urutan || a.id - b.id);
  kosongkan(sheet, 3, Math.max(terakhir, jenis.length + 2), 1, 1);

  jenis.forEach((data, indeks) => {
    sheet.getCell(3 + indeks, 1).value = data.nama;
  });

  return sheet;
}

/** Tulis nama petugas (semua, termasuk yang belum punya penugasan) + formula total. */
function isiRekapBulanan(workbook, dataset, struktur, tahun) {
  const sheet = ambilSheet(workbook, NAMA_SHEET_REKAP_BULANAN);
  const {
    petugasAwal,
    petugasAkhir,
    barisTotalBulanan,
    kolomTotalBulanan,
    kolomJumlahPenugasan,
    dataAwal,
    dataAkhir,
  } = struktur;

  const kapasitas = petugasAkhir - petugasAwal + 1;
  const petugas = dataset.petugas.slice().sort(
    (a, b) => (Number(a.urutan) || 0) - (Number(b.urutan) || 0) || a.nama.localeCompare(b.nama, 'id')
  );
  if (petugas.length > kapasitas) {
    throw new Error(
      `Sheet Rekap Honor Bulanan pada template hanya menyediakan ${kapasitas} baris petugas, sedangkan data saat ini ${petugas.length} petugas. Kurangi petugas atau tambah baris pada file template.`
    );
  }

  sheet.getCell(SEL_TAHUN_REKAP).value = tahun;

  kosongkan(sheet, petugasAwal, petugasAkhir, 1, 1);
  petugas.forEach((orang, indeks) => {
    sheet.getCell(petugasAwal + indeks, 1).value = orang.nama;
  });

  const kolomBulanAkhir = hurufKolom(Math.max(kolomTotalBulanan - 1, 2));
  for (let baris = petugasAwal; baris <= petugasAkhir; baris += 1) {
    // Perbaiki formula total yang di template asli menunjuk baris pertama terus.
    sheet.getCell(baris, kolomTotalBulanan).value = {
      formula: `IF($A${baris}="","",SUM(B${baris}:${kolomBulanAkhir}${baris}))`,
    };
    if (kolomJumlahPenugasan) {
      sheet.getCell(baris, kolomJumlahPenugasan).value = {
        formula: `IF($A${baris}="","",COUNTIFS('Data Penugasan'!$B$${dataAwal}:$B$${dataAkhir},$A${baris},'Data Penugasan'!$F$${dataAwal}:$F$${dataAkhir},$B$3))`,
      };
    }
  }

  if (barisTotalBulanan) {
    const kolomTerakhir = Math.max(kolomTotalBulanan, kolomJumlahPenugasan || kolomTotalBulanan);
    for (let kolom = 2; kolom <= kolomTerakhir; kolom += 1) {
      const huruf = hurufKolom(kolom);
      sheet.getCell(barisTotalBulanan, kolom).value = {
        formula: `SUM(${huruf}${petugasAwal}:${huruf}${petugasAkhir})`,
      };
    }
  }

  return sheet;
}

/** Tulis judul jenis kegiatan, nama petugas, dan formula rekap per jenis. */
function isiRekapJenis(workbook, dataset, struktur) {
  const sheet = ambilSheet(workbook, NAMA_SHEET_REKAP_JENIS);
  const {
    petugasAwal,
    petugasAkhir,
    kolomJenisAwal,
    kolomTotalJenis,
    dataAwal,
    dataAkhir,
  } = struktur;

  const jenis = dataset.jenis.slice().sort((a, b) => a.urutan - b.urutan || a.id - b.id);
  const kapasitasJenis =
    struktur.kolomJenisMaks || struktur.kolomJenisAkhir - struktur.kolomJenisAwal + 1;
  if (jenis.length > kapasitasJenis) {
    throw new Error(
      `Sheet Rekap Jenis Kegiatan pada template hanya muat ${kapasitasJenis} jenis kegiatan, sedangkan data saat ini ${jenis.length} jenis. Kurangi jenis kegiatan atau tambah kolom pada file template.`
    );
  }

  const kolomTotal = Math.max(kolomTotalJenis, kolomJenisAwal + jenis.length);
  const batasKolom = Math.max(sheet.columnCount || 0, kolomTotal, kolomTotalJenis);

  const petugas = dataset.petugas.slice().sort(
    (a, b) => (Number(a.urutan) || 0) - (Number(b.urutan) || 0) || a.nama.localeCompare(b.nama, 'id')
  );
  const kapasitas = petugasAkhir - petugasAwal + 1;
  if (petugas.length > kapasitas) {
    throw new Error(
      `Sheet Rekap Jenis Kegiatan pada template hanya menyediakan ${kapasitas} baris petugas, sedangkan data saat ini ${petugas.length} petugas. Kurangi petugas atau tambah baris pada file template.`
    );
  }

  // B3 di sheet ini biasanya formula ke Rekap Honor Bulanan; hanya diisi bila berupa nilai.
  const selTahun = sheet.getCell(SEL_TAHUN_REKAP);
  const nilaiTahun = selTahun.value;
  const tahunDariBulanan = workbook.getWorksheet(NAMA_SHEET_REKAP_BULANAN)?.getCell(SEL_TAHUN_REKAP)?.value;
  if (!(nilaiTahun && typeof nilaiTahun === 'object' && nilaiTahun.formula)) {
    selTahun.value = typeof tahunDariBulanan === 'number' ? tahunDariBulanan : nilaiTahun;
  }

  const kolomTerakhir = Math.max(kolomTotal, batasKolom);
  kosongkan(sheet, 5, 5, 2, kolomTerakhir);
  kosongkan(sheet, petugasAwal, petugasAkhir, 1, kolomTerakhir);

  jenis.forEach((data, indeks) => {
    sheet.getCell(5, kolomJenisAwal + indeks).value = data.nama;
  });
  sheet.getCell(5, kolomTotal).value = 'Total Honor';

  const kolomJenisTerakhir = hurufKolom(Math.max(kolomTotal - 1, kolomJenisAwal));
  const gayaTotal = sheet.getCell(petugasAwal, kolomTotalJenis).numFmt;

  for (let baris = petugasAwal; baris <= petugasAkhir; baris += 1) {
    sheet.getCell(baris, 1).value = petugas[baris - petugasAwal]?.nama || null;

    for (let indeks = 0; indeks < jenis.length; indeks += 1) {
      const kolom = kolomJenisAwal + indeks;
      const cell = sheet.getCell(baris, kolom);
      cell.value = {
        formula: `IF($A${baris}="","",SUMIFS('Data Penugasan'!$G$${dataAwal}:$G$${dataAkhir},'Data Penugasan'!$B$${dataAwal}:$B$${dataAkhir},$A${baris},'Data Penugasan'!$C$${dataAwal}:$C$${dataAkhir},${hurufKolom(kolom)}$5,'Data Penugasan'!$F$${dataAwal}:$F$${dataAkhir},$B$3))`,
      };
      if (gayaTotal) cell.numFmt = gayaTotal;
    }

    const cellTotal = sheet.getCell(baris, kolomTotal);
    if (jenis.length > 0) {
      cellTotal.value = {
        formula: `IF($A${baris}="","",SUM(${hurufKolom(kolomJenisAwal)}${baris}:${kolomJenisTerakhir}${baris}))`,
      };
    } else {
      cellTotal.value = null;
    }
    if (gayaTotal) cellTotal.numFmt = gayaTotal;
  }

  return sheet;
}

/** Muat file template: dari pengguna, atau template bawaan aplikasi. */
async function muatTemplate({ templateBuffer, templateBase64 } = {}) {
  const exceljs = ambilExcelJS();
  let sumber = templateBuffer;
  if (!sumber && templateBase64) sumber = base64KeBytes(templateBase64);
  if (!sumber) {
    if (typeof fetch !== 'function') {
      throw new Error('File template tidak dapat dimuat di lingkungan ini.');
    }
    const respons = await fetch(TEMPLATE_BAWAAN.url, { cache: 'no-store' });
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

  return { workbook, struktur: deteksiStrukturTemplate(workbook) };
}

/** Siapkan workbook dari file template yang sudah diisi data web. */
export async function buatWorkbookTemplate(
  dataset,
  { tahun, templateBuffer, templateBase64 } = {}
) {
  const tahunAktif = Number(tahun) || new Date().getFullYear();
  const { workbook, struktur } = await muatTemplate({ templateBuffer, templateBase64 });

  isiDataPenugasan(workbook, dataset, struktur);
  isiReferensi(workbook, dataset);
  isiRekapBulanan(workbook, dataset, struktur, tahunAktif);
  isiRekapJenis(workbook, dataset, struktur);

  workbook.creator = 'Dashboard Honor & Penugasan Petugas';
  workbook.modified = new Date();
  // Excel menghitung ulang formula saat file dibuka.
  workbook.calcProperties = { ...(workbook.calcProperties || {}), fullCalcOnLoad: true };

  return workbook;
}

export async function eksporTemplate(
  dataset,
  { tahun, namaFile, templateBuffer, templateBase64 } = {}
) {
  const workbook = await buatWorkbookTemplate(dataset, {
    tahun,
    templateBuffer,
    templateBase64,
  });
  const buffer = await workbook.xlsx.writeBuffer();
  const tahunAktif = Number(tahun) || new Date().getFullYear();
  unduhBlob(
    buffer,
    namaFile || `Matriks_Penugasan_dan_Honor_${tahunAktif}_${capTanggal()}.xlsx`
  );
}

/** Unduh template bawaan yang masih kosong, untuk diisi nama petugas di Excel. */
export async function unduhTemplateKosong({ namaFile } = {}) {
  if (typeof fetch !== 'function') {
    throw new Error('File template tidak dapat dimuat di lingkungan ini.');
  }
  const respons = await fetch(TEMPLATE_BAWAAN.url, { cache: 'no-store' });
  if (!respons.ok) {
    throw new Error(
      'File template Excel tidak ditemukan. Pastikan berkas data/template-matriks.xlsx tersedia di aplikasi.'
    );
  }
  const buffer = await respons.arrayBuffer();
  unduhBlob(buffer, namaFile || TEMPLATE_BAWAAN.namaFile);
}
