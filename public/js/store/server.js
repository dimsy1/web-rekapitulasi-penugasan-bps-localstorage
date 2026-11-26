/**
 * Adapter data server: PHP + MySQL di InfinityFree.
 *
 * - Satu kali bootstrap per halaman (dataset penuh), lalu semua perhitungan
 *   rekap dilakukan di browser memakai store/komputasi.js.
 * - Setiap tulis langsung dikirim ke API; dataset terbaru dari server dipakai
 *   untuk memperbarui cache, sehingga dua admin tidak saling menimpa.
 */

import { normalisasiDataset, rapikanTeks } from './penyimpanan.js';
import { ApiError } from './kesalahan.js';
import {
  barisUntukApi,
  dashboardDataset,
  jenisKegiatanDataset,
  metaDataset,
  penugasanDataset,
  petugasDataset,
  rekapBulananDataset,
  rekapJenisDataset,
} from './komputasi.js';

const AKAR_API = '/api/api.php';
const BATAS_BAWAAN = 25_000;
const BATAS_IMPOR = 90_000;
const UKURAN_BATCH_IMPOR = 400;

let cache = null; // { dataset, revisi, template, admin }
let admin = null;
let janjiMuat = null;

function alamat(aksi) {
  return `${AKAR_API}?aksi=${encodeURIComponent(aksi)}`;
}

async function panggil(aksi, { metode = 'GET', body = null, batas = BATAS_BAWAAN } = {}) {
  const pengendali = new AbortController();
  const timer = setTimeout(() => pengendali.abort(), batas);

  let respons;
  try {
    respons = await fetch(alamat(aksi), {
      method: metode,
      credentials: 'same-origin',
      cache: 'no-store',
      headers:
        metode === 'POST'
          ? {
              'Content-Type': 'application/json',
              'X-Requested-With': 'dashboard-honor',
            }
          : undefined,
      body: metode === 'POST' ? JSON.stringify(body ?? {}) : undefined,
      signal: pengendali.signal,
    });
  } catch (kesalahan) {
    if (kesalahan.name === 'AbortError') {
      throw new ApiError(0, 'Server terlalu lama merespons. Periksa koneksi lalu coba lagi.');
    }
    throw new ApiError(
      0,
      'Tidak dapat terhubung ke server. Periksa koneksi internet lalu muat ulang halaman.'
    );
  } finally {
    clearTimeout(timer);
  }

  const teks = await respons.text();
  let data = null;
  if (teks.trim() !== '') {
    try {
      data = JSON.parse(teks);
    } catch {
      throw new ApiError(
        0,
        'Respons server tidak dikenali. Pastikan PHP berjalan dan skema database sudah diimpor.'
      );
    }
  }

  if (!respons.ok || (data && data.ok === false)) {
    if (respons.status === 401) {
      cache = null;
      admin = null;
    }
    throw new ApiError(
      respons.status || 500,
      data?.pesan || `Permintaan gagal (kode ${respons.status}).`,
      data?.errors || null,
      data
    );
  }

  return data || {};
}

async function muat(paksa = false) {
  if (cache && !paksa) return cache;
  if (janjiMuat) return janjiMuat;

  janjiMuat = (async () => {
    const data = await panggil('bootstrap');
    cache = {
      dataset: normalisasiDataset(data.dataset),
      revisi: Number(data.revisi) || 0,
      template: data.template || null,
      admin: data.admin || admin,
    };
    admin = data.admin || admin;
    return cache;
  })();

  try {
    return await janjiMuat;
  } finally {
    janjiMuat = null;
  }
}

function beritahu() {
  try {
    window.dispatchEvent(new CustomEvent('data-berubah', { detail: { sumber: 'server' } }));
  } catch {
    /* abaikan */
  }
}

async function tulis(aksi, body = {}) {
  const data = await panggil(aksi, { metode: 'POST', body });
  if (data.dataset) {
    cache = {
      dataset: normalisasiDataset(data.dataset),
      revisi: Number(data.revisi) || 0,
      template: cache?.template || null,
      admin,
    };
  }
  beritahu();
  return data;
}

function barisBaru(id) {
  const dataset = cache?.dataset;
  if (!dataset) return null;
  const baris = dataset.penugasan.find((item) => Number(item.id) === Number(id));
  return barisUntukApi(dataset, baris);
}

/* -------------------------------------------------------------------------
   Sesi
   ------------------------------------------------------------------------- */
async function getSesi() {
  try {
    await muat();
    return { masuk: true, admin };
  } catch (kesalahan) {
    if (kesalahan instanceof ApiError && kesalahan.status === 401) {
      return { masuk: false, admin: null };
    }
    throw kesalahan;
  }
}

async function login(username, password) {
  const data = await panggil('masuk', {
    metode: 'POST',
    body: { username: rapikanTeks(username), password: String(password ?? '') },
  });
  admin = data.admin || null;
  cache = null;
  return { masuk: true, admin };
}

async function logout() {
  try {
    await panggil('keluar', { metode: 'POST' });
  } finally {
    admin = null;
    cache = null;
  }
  return { ok: true };
}

/* -------------------------------------------------------------------------
   Baca
   ------------------------------------------------------------------------- */
async function denganDataset(fn) {
  const { dataset } = await muat();
  return fn(dataset);
}

export const server = {
  getDataset() {
    return denganDataset((dataset) => dataset);
  },

  getMeta(tahun) {
    return denganDataset((dataset) => metaDataset(dataset, tahun));
  },

  getPenugasan(params = {}) {
    return denganDataset((dataset) => penugasanDataset(dataset, params));
  },

  getDashboard(tahun) {
    return denganDataset((dataset) => dashboardDataset(dataset, tahun));
  },

  getRekapBulanan(tahun) {
    return denganDataset((dataset) => rekapBulananDataset(dataset, tahun));
  },

  getRekapJenis(tahun) {
    return denganDataset((dataset) => rekapJenisDataset(dataset, tahun));
  },

  getPetugas(tahun) {
    return denganDataset((dataset) => petugasDataset(dataset, tahun));
  },

  getJenisKegiatan(tahun) {
    return denganDataset((dataset) => jenisKegiatanDataset(dataset, tahun));
  },

  async getNamaKegiatan() {
    const meta = await denganDataset((dataset) =>
      metaDataset(dataset, new Date().getFullYear())
    );
    return meta.nama_kegiatan;
  },

  /* --- Tulis ------------------------------------------------------------- */
  async buatPenugasan(body = {}) {
    const data = await tulis('penugasan.buat', body);
    return { message: data.pesan, data: barisBaru(data.id) };
  },

  async ubahPenugasan(id, body = {}) {
    const data = await tulis('penugasan.ubah', { ...body, id: Number(id) });
    return { message: data.pesan, data: barisBaru(data.id) };
  },

  async hapusPenugasan(id) {
    const data = await tulis('penugasan.hapus', { id: Number(id) });
    return { message: data.pesan };
  },

  async buatPetugas(body = {}) {
    const data = await tulis('petugas.buat', body);
    const petugas = cache?.dataset.petugas.find((item) => Number(item.id) === Number(data.id));
    return { message: data.pesan, data: petugas || null };
  },

  async ubahPetugas(id, body = {}) {
    const data = await tulis('petugas.ubah', { ...body, id: Number(id) });
    const petugas = cache?.dataset.petugas.find((item) => Number(item.id) === Number(data.id));
    return { message: data.pesan, data: petugas || null };
  },

  async hapusPetugas(id) {
    const data = await tulis('petugas.hapus', { id: Number(id) });
    return { message: data.pesan };
  },

  async buatJenisKegiatan(body = {}) {
    const data = await tulis('jenis.buat', body);
    const jenis = cache?.dataset.jenis.find((item) => Number(item.id) === Number(data.id));
    return { message: data.pesan, data: jenis || null };
  },

  async ubahJenisKegiatan(id, body = {}) {
    const data = await tulis('jenis.ubah', { ...body, id: Number(id) });
    const jenis = cache?.dataset.jenis.find((item) => Number(item.id) === Number(data.id));
    return { message: data.pesan, data: jenis || null };
  },

  async hapusJenisKegiatan(id) {
    const data = await tulis('jenis.hapus', { id: Number(id) });
    return { message: data.pesan };
  },

  /* --- Impor / reset ----------------------------------------------------- */
  async impor(sumberImpor = [], { tahunAnalisis = null } = {}) {
    const namaPetugas = [];
    const namaJenis = [];
    const kunciPetugas = new Set();
    const kunciJenis = new Set();
    const baris = [];

    for (const sumber of sumberImpor) {
      const petaPetugas = new Map(
        (sumber.petugas || []).map((item) => [Number(item.id), item.nama])
      );
      const petaJenis = new Map(
        (sumber.jenis || []).map((item) => [Number(item.id), item.nama])
      );
      const petaPosisi = new Map(
        (sumber.posisi || []).map((item) => [Number(item.id), item.nama])
      );

      for (const nama of petaPetugas.values()) {
        const teks = rapikanTeks(nama);
        if (!teks) continue;
        const kunci = teks.toLowerCase();
        if (kunciPetugas.has(kunci)) continue;
        kunciPetugas.add(kunci);
        namaPetugas.push(teks);
      }
      for (const nama of petaJenis.values()) {
        const teks = rapikanTeks(nama);
        if (!teks) continue;
        const kunci = teks.toLowerCase();
        if (kunciJenis.has(kunci)) continue;
        kunciJenis.add(kunci);
        namaJenis.push(teks);
      }

      for (const item of sumber.penugasan || []) {
        baris.push({
          nama_petugas: petaPetugas.get(Number(item.petugas_id)) || '',
          nama_jenis: petaJenis.get(Number(item.jenis_kegiatan_id)) || '',
          nama_posisi: petaPosisi.get(Number(item.posisi_id)) || '',
          nama_pekerjaan: item.nama_pekerjaan || '',
          bulan: item.bulan,
          tahun: item.tahun,
          honor: item.honor,
        });
      }
    }

    const jumlah = { petugas: 0, jenis: 0, penugasan: 0, dilewati: 0 };
    let pertama = true;

    for (let mulai = 0; mulai < baris.length; mulai += UKURAN_BATCH_IMPOR) {
      const potong = baris.slice(mulai, mulai + UKURAN_BATCH_IMPOR);
      const data = await panggil('impor', {
        metode: 'POST',
        batas: BATAS_IMPOR,
        body: {
          petugas: pertama ? namaPetugas : [],
          jenis: pertama ? namaJenis : [],
          penugasan: potong,
          tahunAnalisis: Number.isInteger(Number(tahunAnalisis))
            ? Number(tahunAnalisis)
            : null,
        },
      });
      pertama = false;
      jumlah.petugas += Number(data.jumlah?.petugas) || 0;
      jumlah.jenis += Number(data.jumlah?.jenis) || 0;
      jumlah.penugasan += Number(data.jumlah?.penugasan) || 0;
      jumlah.dilewati += Number(data.jumlah?.dilewati) || 0;
    }

    if (baris.length === 0 && (namaPetugas.length || namaJenis.length)) {
      // Impor yang hanya berisi daftar master (mis. sheet Referensi saja).
      const data = await panggil('impor', {
        metode: 'POST',
        body: {
          petugas: namaPetugas,
          jenis: namaJenis,
          penugasan: [],
          tahunAnalisis: Number.isInteger(Number(tahunAnalisis))
            ? Number(tahunAnalisis)
            : null,
        },
      });
      jumlah.petugas += Number(data.jumlah?.petugas) || 0;
      jumlah.jenis += Number(data.jumlah?.jenis) || 0;
    }

    const { dataset } = await muat(true);
    return { jumlah, dataset };
  },

  async reset() {
    const data = await tulis('reset');
    return { message: data.pesan, dataset: cache?.dataset || null };
  },

  /* --- Template Excel ---------------------------------------------------- */
  async getTemplateInfo() {
    const data = await muat();
    return data.template;
  },

  async ambilTemplate() {
    const data = await panggil('template.ambil', { batas: 60_000 });
    return data.template || null;
  },

  async simpanTemplate(meta) {
    const data = await panggil('template.simpan', {
      metode: 'POST',
      batas: 60_000,
      body: { nama: meta.nama, base64: meta.base64 },
    });
    if (cache) cache.template = data.template;
    return data.template;
  },

  /* --- Sesi & status ----------------------------------------------------- */
  getSesi,
  login,
  logout,

  getAdmin() {
    return admin;
  },

  async getLog() {
    const data = await panggil('log');
    return Array.isArray(data.data) ? data.data : [];
  },

  getStatus() {
    return {
      mode: 'server',
      admin,
      revisi: cache?.revisi ?? null,
      template: cache?.template ?? null,
    };
  },

  /**
   * Periksa revisi saat tab kembali aktif. Bila admin lain menyimpan,
   * cache dimuat ulang lalu callback dipanggil untuk menyegarkan halaman.
   */
  pantauSumber(callback) {
    let timer = null;

    const periksa = async () => {
      if (!cache || document.hidden) return;
      try {
        const data = await panggil('revisi');
        if (Number(data.revisi) !== cache.revisi) {
          await muat(true);
          callback();
        }
      } catch {
        /* diamkan: masalah jaringan akan dilaporkan saat pengguna menyimpan */
      }
    };

    const jadwalkan = () => {
      clearTimeout(timer);
      timer = setTimeout(periksa, 800);
    };

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) jadwalkan();
    });
    window.addEventListener('focus', jadwalkan);
    setInterval(periksa, 5 * 60 * 1000);
  },
};
