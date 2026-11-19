/**
 * Penyimpanan data lokal (localStorage).
 * Semua data aplikasi disimpan pada satu kunci agar mudah dibackup.
 * Tidak ada server: data hanya ada di browser yang dipakai.
 */

export const KUNCI_DATA = 'dashboard-honor-v2';
export const KUNCI_BACKUP = 'dashboard-honor-v2-backup';
export const KUNCI_TEMPLATE = 'dashboard-honor-v2-template';
export const VERSI_DATA = 2;

/** Jenis kegiatan bawaan, mengikuti sheet Referensi template Excel. */
export const JENIS_BAWAAN = [
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
];

/** Bentuk baris jenis dari daftar bawaan. */
export function jenisBawaan() {
  return JENIS_BAWAAN.map((nama, indeks) => ({
    id: indeks + 1,
    nama,
    urutan: indeks + 1,
  }));
}

export function datasetKosong() {
  return {
    versi: VERSI_DATA,
    diperbarui: null,
    jenis: [],
    petugas: [],
    penugasan: [],
  };
}

/**
 * Dataset untuk pemakaian pertama: belum ada data, tetapi master jenis sudah
 * berisi 10 jenis standar agar penugasan bisa langsung diisi.
 */
export function datasetAwal() {
  return { ...datasetKosong(), jenis: jenisBawaan() };
}

/** Salin objek tanpa referensi bersama. */
export function salin(nilai) {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(nilai);
    } catch {
      /* jatuh ke JSON */
    }
  }
  return JSON.parse(JSON.stringify(nilai));
}

function angkaId(nilai) {
  const angka = Number(nilai);
  return Number.isInteger(angka) && angka > 0 ? angka : null;
}

/** Rapikan dataset dari localStorage/backup agar bentuknya selalu konsisten. */
export function normalisasiDataset(mentah) {
  const data = mentah && typeof mentah === 'object' ? mentah : {};
  const hasil = datasetKosong();
  hasil.diperbarui = typeof data.diperbarui === 'string' ? data.diperbarui : null;

  const jenisTerpakai = new Set();
  for (const baris of Array.isArray(data.jenis) ? data.jenis : []) {
    const nama = typeof baris?.nama === 'string' ? baris.nama.trim() : '';
    if (!nama) continue;
    const kunci = nama.toLowerCase();
    if (jenisTerpakai.has(kunci)) continue;
    jenisTerpakai.add(kunci);
    const id = angkaId(baris.id) || hasil.jenis.length + 1;
    hasil.jenis.push({
      id,
      nama,
      urutan: Number.isFinite(Number(baris.urutan)) ? Number(baris.urutan) : hasil.jenis.length + 1,
    });
  }
  hasil.jenis = urutkanJenis(hasil.jenis);

  const petugasTerpakai = new Set();
  for (const baris of Array.isArray(data.petugas) ? data.petugas : []) {
    const nama = typeof baris?.nama === 'string' ? rapikanTeks(baris.nama) : '';
    if (!nama) continue;
    const kunci = nama.toLowerCase();
    if (petugasTerpakai.has(kunci)) continue;
    petugasTerpakai.add(kunci);
    const urutan = Number(baris?.urutan);
    hasil.petugas.push({
      id: angkaId(baris.id) || hasil.petugas.length + 1,
      nama,
      urutan: Number.isInteger(urutan) && urutan > 0 ? urutan : hasil.petugas.length + 1,
    });
  }
  hasil.petugas = urutkanPetugas(hasil.petugas);

  let idPenugasan = 0;
  for (const baris of Array.isArray(data.penugasan) ? data.penugasan : []) {
    const petugasId = angkaId(baris?.petugas_id);
    const jenisId = angkaId(baris?.jenis_kegiatan_id);
    const bulan = Number(baris?.bulan);
    const tahun = Number(baris?.tahun);
    const honor = Number(baris?.honor);
    const pekerjaan = typeof baris?.nama_pekerjaan === 'string' ? rapikanTeks(baris.nama_pekerjaan) : '';

    if (!petugasId || !jenisId || !pekerjaan) continue;
    if (!Number.isInteger(bulan) || bulan < 1 || bulan > 12) continue;
    if (!Number.isInteger(tahun) || tahun < 2020) continue;
    if (!Number.isSafeInteger(honor) || honor < 0) continue;

    idPenugasan += 1;
    hasil.penugasan.push({
      id: angkaId(baris.id) || idPenugasan,
      petugas_id: petugasId,
      jenis_kegiatan_id: jenisId,
      nama_pekerjaan: pekerjaan,
      bulan,
      tahun,
      honor,
    });
  }

  // Pastikan semua relasi menunjuk ke master yang ada.
  const idPetugas = new Set(hasil.petugas.map((baris) => baris.id));
  const idJenis = new Set(hasil.jenis.map((baris) => baris.id));
  hasil.penugasan = hasil.penugasan.filter(
    (baris) => idPetugas.has(baris.petugas_id) && idJenis.has(baris.jenis_kegiatan_id)
  );

  return hasil;
}

export function rapikanTeks(nilai) {
  return String(nilai ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function urutkanJenis(daftar) {
  return daftar
    .slice()
    .sort((a, b) => Number(a.urutan) - Number(b.urutan) || Number(a.id) - Number(b.id));
}

/**
 * Urutkan petugas. `urutan` dipertahankan sesuai urutan yang ditulis pengguna
 * pada kolom A sheet rekap template; nama dipakai sebagai cadangan.
 */
export function urutkanPetugas(daftar) {
  return daftar
    .slice()
    .sort(
      (a, b) =>
        (Number(a.urutan) || 0) - (Number(b.urutan) || 0) ||
        a.nama.localeCompare(b.nama, 'id')
    );
}

/** Baca dataset aktif. Selalu mengembalikan objek valid. */
export function bacaDataset() {
  try {
    const mentah = localStorage.getItem(KUNCI_DATA);
    // Pemakaian pertama: mulai dengan 10 jenis bawaan template.
    if (!mentah) return datasetAwal();
    return normalisasiDataset(JSON.parse(mentah));
  } catch {
    return datasetKosong();
  }
}

/** Simpan dataset. Mengembalikan dataset yang tersimpan. */
export function simpanDataset(data) {
  const rapi = normalisasiDataset(data);
  rapi.diperbarui = new Date().toISOString();
  try {
    localStorage.setItem(KUNCI_DATA, JSON.stringify(rapi));
  } catch (kesalahan) {
    const error = new Error(
      'Data gagal disimpan di browser. Ruang penyimpanan mungkin penuh. Ekspor data lalu hapus sebagian data lama.'
    );
    error.penyebab = kesalahan;
    throw error;
  }
  window.dispatchEvent(new CustomEvent('data-berubah', { detail: { sumber: 'lokal' } }));
  return rapi;
}

/** Simpan snapshot sebelum operasi berisiko (impor/reset). */
export function simpanBackup(data) {
  try {
    localStorage.setItem(KUNCI_BACKUP, JSON.stringify(data || bacaDataset()));
    return true;
  } catch {
    return false;
  }
}

export function bacaBackup() {
  try {
    const mentah = localStorage.getItem(KUNCI_BACKUP);
    if (!mentah) return null;
    return normalisasiDataset(JSON.parse(mentah));
  } catch {
    return null;
  }
}

export function hapusBackup() {
  try {
    localStorage.removeItem(KUNCI_BACKUP);
  } catch {
    /* abaikan */
  }
}

export function kosongkanData() {
  simpanBackup(bacaDataset());
  return simpanDataset(datasetKosong());
}

export function idBerikutnya(daftar) {
  return daftar.reduce((maks, baris) => Math.max(maks, Number(baris.id) || 0), 0) + 1;
}

/* -------------------------------------------------------------------------
   File template yang diimpor

   Disimpan sebagai teks base64 di kunci terpisah agar struktur dan format file
   milik pengguna dipakai kembali saat mengekspor.
   ------------------------------------------------------------------------- */
export function simpanTemplate(meta) {
  try {
    localStorage.setItem(KUNCI_TEMPLATE, JSON.stringify(meta));
    return true;
  } catch (kesalahan) {
    const error = new Error(
      'File template terlalu besar untuk disimpan di browser. Ekspor akan memakai template bawaan aplikasi.'
    );
    error.penyebab = kesalahan;
    throw error;
  }
}

export function bacaTemplate() {
  try {
    const mentah = localStorage.getItem(KUNCI_TEMPLATE);
    if (!mentah) return null;
    const data = JSON.parse(mentah);
    if (!data || typeof data.base64 !== 'string' || !data.base64) return null;
    return {
      nama: typeof data.nama === 'string' ? data.nama : 'template.xlsx',
      base64: data.base64,
      bytes: Number(data.bytes) || Math.floor((data.base64.length * 3) / 4),
      disimpan: typeof data.disimpan === 'string' ? data.disimpan : null,
    };
  } catch {
    return null;
  }
}

export function hapusTemplate() {
  try {
    localStorage.removeItem(KUNCI_TEMPLATE);
  } catch {
    /* abaikan */
  }
}

/** Perkiraan ukuran data aktif (data + file template) dalam byte. */
export function ukuranData() {
  try {
    return (
      (localStorage.getItem(KUNCI_DATA) || '').length +
      (localStorage.getItem(KUNCI_TEMPLATE) || '').length
    );
  } catch {
    return 0;
  }
}

/** Daftarkan pendengar perubahan data dari tab lain. */
export function pantauPerubahanLintasTab(callback) {
  window.addEventListener('storage', (event) => {
    if (event.key === KUNCI_DATA) callback(event);
  });
}
