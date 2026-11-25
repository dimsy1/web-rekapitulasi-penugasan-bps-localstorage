/**
 * Penyimpanan data lokal (localStorage).
 * Semua data aplikasi disimpan pada satu kunci agar mudah dibackup.
 * Tidak ada server: data hanya ada di browser yang dipakai.
 */

export const KUNCI_DATA = 'dashboard-honor-v2';
export const KUNCI_BACKUP = 'dashboard-honor-v2-backup';
export const KUNCI_TEMPLATE = 'dashboard-honor-v2-template';
export const VERSI_DATA = 3;

/** Hapus seluruh data aplikasi yang pernah disimpan oleh mode lokal. */
export function hapusDataLokal() {
  try {
    localStorage.removeItem(KUNCI_DATA);
    localStorage.removeItem(KUNCI_BACKUP);
    localStorage.removeItem(KUNCI_TEMPLATE);
  } catch {
    /* abaikan bila localStorage tidak tersedia */
  }
}

/**
 * Daftar jenis kegiatan TIDAK diisi bawaan. Sesuai alur kerja, daftar jenis
 * berasal dari file Excel pengguna (sheet `Referensi` / `Rekap Jenis Kegiatan`)
 * atau ditambahkan manual di halaman Daftar Jenis Kegiatan.
 */

export function datasetKosong() {
  return {
    versi: VERSI_DATA,
    diperbarui: null,
    jenis: [],
    posisi: [],
    posisiLimit: [],
    petugas: [],
    penugasan: [],
  };
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

/** Versi baris (dipakai untuk mendeteksi perubahan oleh admin lain). */
function angkaVersi(nilai) {
  const angka = Number(nilai);
  return Number.isInteger(angka) && angka > 0 ? angka : 0;
}

/** Rapikan dataset dari localStorage/backup agar bentuknya selalu konsisten. */
export function normalisasiDataset(mentah) {
  const data = mentah && typeof mentah === 'object' ? mentah : {};
  const hasil = datasetKosong();
  hasil.diperbarui = typeof data.diperbarui === 'string' ? data.diperbarui : null;
  if (Number.isInteger(data.tahunAnalisis) && data.tahunAnalisis >= 2020) {
    hasil.tahunAnalisis = data.tahunAnalisis;
  }

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
      versi: angkaVersi(baris.versi),
    });
  }
  hasil.jenis = urutkanJenis(hasil.jenis);

  const posisiTerpakai = new Set();
  for (const baris of Array.isArray(data.posisi) ? data.posisi : []) {
    const jenisId = angkaId(baris?.jenis_kegiatan_id);
    const nama = typeof baris?.nama === 'string' ? rapikanTeks(baris.nama) : '';
    if (!jenisId || !nama) continue;
    if (!hasil.jenis.some((item) => item.id === jenisId)) continue;
    const kunci = `${jenisId}:${nama.toLowerCase()}`;
    if (posisiTerpakai.has(kunci)) continue;
    posisiTerpakai.add(kunci);
    hasil.posisi.push({
      id: angkaId(baris.id) || hasil.posisi.length + 1,
      jenis_kegiatan_id: jenisId,
      nama,
      urutan: Number.isFinite(Number(baris.urutan))
        ? Number(baris.urutan)
        : hasil.posisi.length + 1,
    });
  }
  hasil.posisi = urutkanPosisi(hasil.posisi);

  const idPosisi = new Set(hasil.posisi.map((baris) => baris.id));
  const limitTerpakai = new Set();
  for (const baris of Array.isArray(data.posisiLimit) ? data.posisiLimit : []) {
    const posisiId = angkaId(baris?.posisi_id);
    const tahun = Number(baris?.tahun);
    const limit = Number(baris?.limit_honor);
    if (!posisiId || !idPosisi.has(posisiId)) continue;
    if (!Number.isInteger(tahun) || tahun < 2020) continue;
    if (!Number.isSafeInteger(limit) || limit < 0) continue;
    const kunci = `${posisiId}:${tahun}`;
    if (limitTerpakai.has(kunci)) continue;
    limitTerpakai.add(kunci);
    hasil.posisiLimit.push({ posisi_id: posisiId, tahun, limit_honor: limit });
  }

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
      versi: angkaVersi(baris.versi),
    });
  }
  hasil.petugas = urutkanPetugas(hasil.petugas);

  let idPenugasan = 0;
  for (const baris of Array.isArray(data.penugasan) ? data.penugasan : []) {
    const petugasId = angkaId(baris?.petugas_id);
    // Hanya nama petugas yang wajib: baris setengah jadi (jenis/pekerjaan/
    // bulan/honor kosong) tetap disimpan agar bisa dilengkapi di web.
    if (!petugasId) continue;

    const tahunMentah = baris?.tahun;
    let tahun = null;
    if (tahunMentah !== undefined && tahunMentah !== null && tahunMentah !== '') {
      tahun = Number(tahunMentah);
      if (!Number.isInteger(tahun) || tahun < 2020) continue;
    }

    let bulan = null;
    if (baris?.bulan !== undefined && baris.bulan !== null && baris.bulan !== '') {
      const angkaBulan = Number(baris.bulan);
      if (Number.isInteger(angkaBulan) && angkaBulan >= 1 && angkaBulan <= 12) bulan = angkaBulan;
    }

    let honor = null;
    if (baris?.honor !== undefined && baris.honor !== null && baris.honor !== '') {
      const angkaHonor = Number(baris.honor);
      if (Number.isSafeInteger(angkaHonor) && angkaHonor >= 0) honor = angkaHonor;
    }

    idPenugasan += 1;
    hasil.penugasan.push({
      id: angkaId(baris.id) || idPenugasan,
      petugas_id: petugasId,
      jenis_kegiatan_id: angkaId(baris?.jenis_kegiatan_id),
      posisi_id: angkaId(baris?.posisi_id),
      nama_pekerjaan:
        typeof baris?.nama_pekerjaan === 'string' ? rapikanTeks(baris.nama_pekerjaan) : '',
      bulan,
      tahun,
      honor,
      versi: angkaVersi(baris.versi),
    });
  }

  // Pastikan relasi petugas/jenis/posisi menunjuk ke master yang ada. Relasi
  // yang tidak ditemukan dikosongkan (baris tetap ada agar bisa diperbaiki),
  // bukan dibuang.
  const idPetugas = new Set(hasil.petugas.map((baris) => baris.id));
  const idJenis = new Set(hasil.jenis.map((baris) => baris.id));
  const jenisPosisi = new Map(
    hasil.posisi.map((baris) => [baris.id, baris.jenis_kegiatan_id])
  );
  hasil.penugasan = hasil.penugasan
    .filter((baris) => idPetugas.has(baris.petugas_id))
    .map((baris) => {
      const jenisId =
        baris.jenis_kegiatan_id !== null && !idJenis.has(baris.jenis_kegiatan_id)
          ? null
          : baris.jenis_kegiatan_id;
      let posisiId = baris.posisi_id;
      if (posisiId !== null && (jenisId === null || jenisPosisi.get(posisiId) !== jenisId)) {
        posisiId = null;
      }
      return posisiId === baris.posisi_id && jenisId === baris.jenis_kegiatan_id
        ? baris
        : { ...baris, jenis_kegiatan_id: jenisId, posisi_id: posisiId };
    });

  return hasil;
}

const LABEL_KOLOM_KOSONG = {
  jenis: 'jenis kegiatan',
  posisi: 'posisi petugas',
  pekerjaan: 'nama pekerjaan',
  bulan: 'bulan',
  honor: 'honor',
};

/** Daftar kolom yang masih kosong pada satu baris penugasan. */
export function kolomKosong(baris) {
  const kosong = [];
  if (baris?.jenis_kegiatan_id === null || baris?.jenis_kegiatan_id === undefined) {
    kosong.push('jenis');
  }
  if (
    baris?.jenis_kegiatan_id !== null &&
    baris?.jenis_kegiatan_id !== undefined &&
    (baris?.posisi_id === null || baris?.posisi_id === undefined)
  ) {
    kosong.push('posisi');
  }
  if (!rapikanTeks(baris?.nama_pekerjaan)) kosong.push('pekerjaan');
  const bulan = Number(baris?.bulan);
  if (!Number.isInteger(bulan) || bulan < 1 || bulan > 12) kosong.push('bulan');
  const honor = Number(baris?.honor);
  if (
    baris?.honor === null ||
    baris?.honor === undefined ||
    !Number.isSafeInteger(honor) ||
    honor < 0
  ) {
    kosong.push('honor');
  }
  return kosong;
}

export function labelKolomKosong(kunci) {
  return LABEL_KOLOM_KOSONG[kunci] || kunci;
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

/** Urutkan posisi: per jenis, lalu urutan dan id. */
export function urutkanPosisi(daftar) {
  return daftar
    .slice()
    .sort(
      (a, b) =>
        Number(a.jenis_kegiatan_id) - Number(b.jenis_kegiatan_id) ||
        Number(a.urutan) - Number(b.urutan) ||
        Number(a.id) - Number(b.id)
    );
}

/** Posisi milik satu jenis kegiatan, sudah terurut. */
export function posisiUntukJenis(dataset, jenisId) {
  const angka = Number(jenisId);
  if (!Number.isInteger(angka)) return [];
  return urutkanPosisi(
    (dataset?.posisi || []).filter((baris) => Number(baris.jenis_kegiatan_id) === angka)
  );
}

/** Limit honor posisi pada tahun tertentu; null berarti belum diatur. */
export function limitPosisi(dataset, posisiId, tahun) {
  const angkaPosisi = Number(posisiId);
  const angkaTahun = Number(tahun);
  const baris = (dataset?.posisiLimit || []).find(
    (item) => Number(item.posisi_id) === angkaPosisi && Number(item.tahun) === angkaTahun
  );
  return baris ? Number(baris.limit_honor) : null;
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
    // Pemakaian pertama: belum ada data sama sekali (jenis, petugas, penugasan
    // kosong). Daftar jenis menunggu file Excel diimpor atau diisi manual.
    if (!mentah) return datasetKosong();
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

/** Tambahkan hasil impor sambil memetakan ulang ID lokal dari tiap file. */
export function gabungkanDataset(dataLama, sumberImpor) {
  const hasil = normalisasiDataset(dataLama);
  const siapkanMaster = (daftar) => {
    const perNama = new Map(daftar.map((baris) => [rapikanTeks(baris.nama).toLowerCase(), baris.id]));
    let idBaru = idBerikutnya(daftar);
    let urutanBaru = daftar.reduce((maks, baris) => Math.max(maks, baris.urutan), 0) + 1;

    return (daftarImpor) => {
      const petaId = new Map();
      for (const { id, nama } of daftarImpor) {
        const kunci = rapikanTeks(nama).toLowerCase();
        if (!perNama.has(kunci)) {
          perNama.set(kunci, idBaru);
          daftar.push({ id: idBaru++, nama, urutan: urutanBaru++ });
        }
        petaId.set(id, perNama.get(kunci));
      }
      return petaId;
    };
  };

  const tambahPetugas = siapkanMaster(hasil.petugas);
  const tambahJenis = siapkanMaster(hasil.jenis);
  let idPenugasan = idBerikutnya(hasil.penugasan);
  for (const sumber of sumberImpor) {
    const data = normalisasiDataset(sumber);
    const petugas = tambahPetugas(data.petugas);
    const jenis = tambahJenis(data.jenis);
    for (const baris of data.penugasan) {
      hasil.penugasan.push({
        ...baris,
        id: idPenugasan++,
        petugas_id: petugas.get(baris.petugas_id),
        jenis_kegiatan_id: jenis.get(baris.jenis_kegiatan_id) ?? null,
        // Impor Excel tidak membawa posisi; baris masuk ke subkolom "Tanpa posisi".
        posisi_id: null,
      });
    }
  }
  return hasil;
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
