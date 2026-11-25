/**
 * Adapter data lokal (localStorage).
 *
 * Tetap dipakai untuk `npm test` dan mode demo tanpa PHP:
 * buka situs dengan `?mode=lokal`. Di produksi, adapter server yang aktif.
 */

import {
  bacaDataset,
  bacaTemplate,
  datasetKosong,
  gabungkanDataset,
  idBerikutnya,
  kosongkanData,
  pantauPerubahanLintasTab,
  simpanDataset,
  simpanTemplate as simpanTemplateLokal,
  rapikanTeks,
} from './penyimpanan.js';
import {
  resolveJenis,
  resolvePetugas,
  teksField,
  angkaField,
  validasiPayloadPenugasan,
} from './validasi.js';
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
import { ApiError } from './kesalahan.js';

const ADMIN_LOKAL = { id: 0, nama: 'Mode lokal', username: 'lokal' };

/** Batas honor sebuah posisi pada tahun tertentu; null berarti belum diatur. */
function setLimitPosisi(ds, posisiId, tahun, limit) {
  ds.posisiLimit = (ds.posisiLimit || []).filter(
    (baris) => !(Number(baris.posisi_id) === Number(posisiId) && Number(baris.tahun) === Number(tahun))
  );
  if (limit !== null) {
    ds.posisiLimit.push({ posisi_id: Number(posisiId), tahun: Number(tahun), limit_honor: limit });
  }
}

/** Validasi daftar posisi dari payload jenis kegiatan (padanan aturan PHP). */
function validasiPosisiJenis(ds, body, jenisId, { wajib } = {}) {
  const daftar = body.posisi;
  if (daftar === undefined) {
    if (wajib) {
      throw new ApiError(400, 'Tambahkan minimal satu posisi petugas.', {
        posisi: 'Tambahkan minimal satu posisi petugas.',
      });
    }
    return null;
  }
  if (!Array.isArray(daftar)) {
    throw new ApiError(400, 'Daftar posisi petugas tidak valid.', {
      posisi: 'Daftar posisi petugas tidak valid.',
    });
  }
  if (wajib && daftar.length === 0) {
    throw new ApiError(400, 'Tambahkan minimal satu posisi petugas.', {
      posisi: 'Tambahkan minimal satu posisi petugas.',
    });
  }

  const tahun = angkaField(body.tahun, 'tahun', 'Tahun limit honor', { min: 2020 });
  const namaTerpakai = new Set();
  const hasil = daftar.map((item, indeks) => {
    const nama = teksField(item?.nama, 'posisi', 'Nama posisi petugas', { maks: 100 });
    const kunci = nama.toLowerCase();
    if (namaTerpakai.has(kunci)) {
      throw new ApiError(400, 'Nama posisi tidak boleh sama dalam satu jenis.', {
        posisi: 'Nama posisi petugas tidak boleh sama dalam satu jenis kegiatan.',
      });
    }
    namaTerpakai.add(kunci);

    let id = null;
    if (item?.id !== undefined && item?.id !== null && item?.id !== '') {
      id = angkaField(item.id, 'posisi', 'Posisi petugas', { min: 1 });
    }

    const mentah = item?.limit_honor;
    let limit = null;
    if (mentah !== undefined && mentah !== null && mentah !== '') {
      limit = angkaField(mentah, 'posisi', 'Limit honor', { min: 0 });
    } else if (wajib) {
      throw new ApiError(
        400,
        `Limit honor posisi "${nama}" tahun ${tahun} wajib diisi.`,
        { posisi: `Limit honor posisi "${nama}" tahun ${tahun} wajib diisi.` }
      );
    }

    return { id, nama, urutan: indeks + 1, limit_honor: limit };
  });

  if (wajib && hasil.length === 0) {
    throw new ApiError(400, 'Tambahkan minimal satu posisi petugas.', {
      posisi: 'Tambahkan minimal satu posisi petugas.',
    });
  }
  return hasil;
}

/** Terapkan daftar posisi (tambah/ubah/hapus) ke dataset lokal. */
function terapkanPosisi(ds, jenisId, daftar, tahun) {
  const lama = ds.posisi.filter((baris) => Number(baris.jenis_kegiatan_id) === Number(jenisId));
  const dipertahankan = new Set(
    daftar.filter((item) => item.id !== null).map((item) => Number(item.id))
  );

  for (const posisi of lama) {
    if (dipertahankan.has(Number(posisi.id))) continue;
    if (ds.penugasan.some((baris) => Number(baris.posisi_id) === Number(posisi.id))) {
      throw new ApiError(
        409,
        `Posisi "${posisi.nama}" sudah dipakai pada data penugasan sehingga tidak dapat dihapus.`
      );
    }
  }

  for (const item of daftar) {
    if (item.id !== null) {
      const posisi = ds.posisi.find(
        (baris) =>
          Number(baris.id) === Number(item.id) &&
          Number(baris.jenis_kegiatan_id) === Number(jenisId)
      );
      if (!posisi) {
        throw new ApiError(400, 'Posisi petugas tidak valid.', {
          posisi: 'Posisi petugas tidak valid.',
        });
      }
      posisi.nama = item.nama;
      posisi.urutan = item.urutan;
      setLimitPosisi(ds, posisi.id, tahun, item.limit_honor);
    } else {
      const id = idBerikutnya(ds.posisi);
      ds.posisi.push({
        id,
        jenis_kegiatan_id: Number(jenisId),
        nama: item.nama,
        urutan: item.urutan,
      });
      setLimitPosisi(ds, id, tahun, item.limit_honor);
    }
  }

  for (const posisi of lama) {
    if (dipertahankan.has(Number(posisi.id))) continue;
    ds.posisi = ds.posisi.filter((baris) => Number(baris.id) !== Number(posisi.id));
    ds.posisiLimit = ds.posisiLimit.filter(
      (baris) => Number(baris.posisi_id) !== Number(posisi.id)
    );
  }
}

export const lokal = {
  /* --- Baca --------------------------------------------------------------- */
  getDataset() {
    return bacaDataset();
  },

  getMeta(tahun) {
    return metaDataset(bacaDataset(), tahun);
  },

  getPenugasan(params = {}) {
    return penugasanDataset(bacaDataset(), params);
  },

  getDashboard(tahun) {
    return dashboardDataset(bacaDataset(), tahun);
  },

  getRekapBulanan(tahun) {
    return rekapBulananDataset(bacaDataset(), tahun);
  },

  getRekapJenis(tahun) {
    return rekapJenisDataset(bacaDataset(), tahun);
  },

  getPetugas(tahun) {
    return petugasDataset(bacaDataset(), tahun);
  },

  getJenisKegiatan(tahun) {
    return jenisKegiatanDataset(bacaDataset(), tahun);
  },

  getNamaKegiatan() {
    return metaDataset(bacaDataset(), new Date().getFullYear()).nama_kegiatan;
  },

  /* --- Tulis penugasan ---------------------------------------------------- */
  buatPenugasan(body = {}) {
    const ds = bacaDataset();
    const data = validasiPayloadPenugasan(ds, body);
    const baris = {
      id: ds.penugasan.reduce((maks, item) => Math.max(maks, Number(item.id) || 0), 0) + 1,
      petugas_id: Number(data.petugas.id),
      jenis_kegiatan_id: data.jenis_kegiatan_id,
      posisi_id: data.posisi_id,
      nama_pekerjaan: data.nama_pekerjaan,
      bulan: data.bulan,
      tahun: data.tahun,
      honor: data.honor,
    };
    ds.penugasan.push(baris);
    const tersimpan = simpanDataset(ds);
    return {
      message: 'Penugasan berhasil ditambahkan.',
      data: barisUntukApi(tersimpan, baris),
    };
  },

  ubahPenugasan(id, body = {}) {
    const angka = Number(id);
    const ds = bacaDataset();
    const lama = ds.penugasan.find((baris) => Number(baris.id) === angka);
    if (!lama) throw new ApiError(404, 'Penugasan tidak ditemukan.');

    const data = validasiPayloadPenugasan(ds, body);
    lama.petugas_id = Number(data.petugas.id);
    lama.jenis_kegiatan_id = data.jenis_kegiatan_id;
    lama.posisi_id = data.posisi_id;
    lama.nama_pekerjaan = data.nama_pekerjaan;
    lama.bulan = data.bulan;
    lama.tahun = data.tahun;
    lama.honor = data.honor;

    const tersimpan = simpanDataset(ds);
    return {
      message: 'Penugasan berhasil diperbarui.',
      data: barisUntukApi(tersimpan, lama),
    };
  },

  hapusPenugasan(id) {
    const angka = Number(id);
    const ds = bacaDataset();
    const jumlahAwal = ds.penugasan.length;
    ds.penugasan = ds.penugasan.filter((baris) => Number(baris.id) !== angka);
    if (ds.penugasan.length === jumlahAwal) {
      throw new ApiError(404, 'Penugasan tidak ditemukan.');
    }
    simpanDataset(ds);
    return { message: 'Penugasan berhasil dihapus.' };
  },

  /* --- Tulis petugas ------------------------------------------------------ */
  buatPetugas(body = {}) {
    const nama = teksField(body.nama, 'nama', 'Nama petugas', { maks: 150 });
    const ds = bacaDataset();
    if (ds.petugas.some((baris) => baris.nama.toLowerCase() === nama.toLowerCase())) {
      throw new ApiError(400, 'Nama petugas sudah ada.', {
        nama: 'Nama petugas sudah ada.',
      });
    }
    const urutan =
      body.urutan === undefined || body.urutan === null || body.urutan === ''
        ? ds.petugas.reduce((maks, baris) => Math.max(maks, Number(baris.urutan) || 0), 0) + 1
        : angkaField(body.urutan, 'urutan', 'Urutan', { min: 0, maks: 65535 });
    const petugas = {
      id: ds.petugas.reduce((maks, baris) => Math.max(maks, Number(baris.id) || 0), 0) + 1,
      nama: rapikanTeks(nama),
      urutan,
    };
    ds.petugas.push(petugas);
    simpanDataset(ds);
    return { message: 'Petugas berhasil ditambahkan.', data: petugas };
  },

  ubahPetugas(id, body = {}) {
    const angka = Number(id);
    const ds = bacaDataset();
    const petugas = ds.petugas.find((baris) => Number(baris.id) === angka);
    if (!petugas) throw new ApiError(404, 'Petugas tidak ditemukan.');

    const nama = teksField(body.nama, 'nama', 'Nama petugas', { maks: 150 });
    if (
      ds.petugas.some(
        (baris) => Number(baris.id) !== angka && baris.nama.toLowerCase() === nama.toLowerCase()
      )
    ) {
      throw new ApiError(400, 'Nama petugas sudah ada.', { nama: 'Nama petugas sudah ada.' });
    }
    const urutan =
      body.urutan === undefined || body.urutan === null || body.urutan === ''
        ? Number(petugas.urutan) || 0
        : angkaField(body.urutan, 'urutan', 'Urutan', { min: 0, maks: 65535 });

    petugas.nama = nama;
    petugas.urutan = urutan;
    simpanDataset(ds);
    return { message: 'Petugas berhasil diperbarui.', data: { id: angka, nama, urutan } };
  },

  hapusPetugas(id) {
    const angka = Number(id);
    const ds = bacaDataset();
    const petugas = ds.petugas.find((baris) => Number(baris.id) === angka);
    if (!petugas) throw new ApiError(404, 'Petugas tidak ditemukan.');
    if (ds.penugasan.some((baris) => Number(baris.petugas_id) === angka)) {
      throw new ApiError(409, 'Petugas ini masih punya data penugasan.');
    }
    ds.petugas = ds.petugas.filter((baris) => Number(baris.id) !== angka);
    simpanDataset(ds);
    return { message: 'Petugas berhasil dihapus.' };
  },

  /* --- Tulis jenis kegiatan --------------------------------------------- */
  buatJenisKegiatan(body = {}) {
    const nama = teksField(body.nama, 'nama', 'Nama jenis kegiatan', { maks: 100 });
    const ds = bacaDataset();
    if (ds.jenis.some((baris) => baris.nama.toLowerCase() === nama.toLowerCase())) {
      throw new ApiError(400, 'Nama jenis kegiatan sudah digunakan.', {
        nama: 'Nama jenis kegiatan sudah digunakan.',
      });
    }
    const daftarPosisi = validasiPosisiJenis(ds, body, null, { wajib: true });
    const urutan =
      body.urutan === undefined || body.urutan === null || body.urutan === ''
        ? ds.jenis.reduce((maks, baris) => Math.max(maks, Number(baris.urutan) || 0), 0) + 1
        : angkaField(body.urutan, 'urutan', 'Urutan', { min: 0, maks: 65535 });
    const jenis = {
      id: ds.jenis.reduce((maks, baris) => Math.max(maks, Number(baris.id) || 0), 0) + 1,
      nama,
      urutan,
      versi: 1,
    };
    ds.jenis.push(jenis);
    terapkanPosisi(ds, jenis.id, daftarPosisi, Number(body.tahun));
    simpanDataset(ds);
    return { message: 'Jenis kegiatan berhasil ditambahkan.', data: jenis };
  },

  ubahJenisKegiatan(id, body = {}) {
    const angka = Number(id);
    const ds = bacaDataset();
    const jenis = ds.jenis.find((baris) => Number(baris.id) === angka);
    if (!jenis) throw new ApiError(404, 'Jenis kegiatan tidak ditemukan.');

    const nama = teksField(body.nama, 'nama', 'Nama jenis kegiatan', { maks: 100 });
    if (
      ds.jenis.some(
        (baris) => Number(baris.id) !== angka && baris.nama.toLowerCase() === nama.toLowerCase()
      )
    ) {
      throw new ApiError(400, 'Nama jenis kegiatan sudah digunakan.', {
        nama: 'Nama jenis kegiatan sudah digunakan.',
      });
    }
    const daftarPosisi = validasiPosisiJenis(ds, body, angka, { wajib: false });
    const urutan =
      body.urutan === undefined || body.urutan === null || body.urutan === ''
        ? Number(jenis.urutan)
        : angkaField(body.urutan, 'urutan', 'Urutan', { min: 0, maks: 65535 });

    jenis.nama = nama;
    jenis.urutan = urutan;
    jenis.versi = (Number(jenis.versi) || 0) + 1;
    if (daftarPosisi !== null) {
      terapkanPosisi(ds, angka, daftarPosisi, Number(body.tahun));
    }
    simpanDataset(ds);
    return { message: 'Jenis kegiatan berhasil diperbarui.', data: { id: angka, nama, urutan } };
  },

  hapusJenisKegiatan(id) {
    const angka = Number(id);
    const ds = bacaDataset();
    const jenis = ds.jenis.find((baris) => Number(baris.id) === angka);
    if (!jenis) throw new ApiError(404, 'Jenis kegiatan tidak ditemukan.');
    if (ds.penugasan.some((baris) => Number(baris.jenis_kegiatan_id) === angka)) {
      throw new ApiError(409, 'Jenis ini sudah dipakai pada data penugasan.');
    }
    const idPosisi = new Set(
      ds.posisi.filter((baris) => Number(baris.jenis_kegiatan_id) === angka).map((baris) => baris.id)
    );
    if (
      ds.penugasan.some((baris) => baris.posisi_id !== null && idPosisi.has(Number(baris.posisi_id)))
    ) {
      throw new ApiError(409, 'Posisi pada jenis ini masih dipakai data penugasan.');
    }
    ds.jenis = ds.jenis.filter((baris) => Number(baris.id) !== angka);
    ds.posisi = ds.posisi.filter((baris) => Number(baris.jenis_kegiatan_id) !== angka);
    ds.posisiLimit = ds.posisiLimit.filter(
      (baris) => !idPosisi.has(Number(baris.posisi_id))
    );
    simpanDataset(ds);
    return { message: 'Jenis kegiatan berhasil dihapus.' };
  },

  /* --- Impor / reset ------------------------------------------------------ */
  impor(sumberImpor = [], { tahunAnalisis = null } = {}) {
    const lama = bacaDataset();
    const gabungan = gabungkanDataset(lama, sumberImpor);
    if (Number.isInteger(Number(tahunAnalisis)) && Number(tahunAnalisis) >= 2020) {
      gabungan.tahunAnalisis = Number(tahunAnalisis);
    }
    const tersimpan = simpanDataset(gabungan);
    return {
      jumlah: {
        petugas: tersimpan.petugas.length - lama.petugas.length,
        jenis: tersimpan.jenis.length - lama.jenis.length,
        penugasan: tersimpan.penugasan.length - lama.penugasan.length,
        dilewati: 0,
      },
      dataset: tersimpan,
    };
  },

  reset() {
    const kosong = kosongkanData();
    return { message: 'Data berhasil dikosongkan.', dataset: kosong };
  },

  /* --- Template Excel ----------------------------------------------------- */
  getTemplateInfo() {
    const template = bacaTemplate();
    if (!template) return null;
    return { nama: template.nama, bytes: template.bytes, disimpan: template.disimpan };
  },

  ambilTemplate() {
    return bacaTemplate();
  },

  simpanTemplate(meta) {
    simpanTemplateLokal(meta);
    return { nama: meta.nama, bytes: meta.bytes, disimpan: meta.disimpan || new Date().toISOString() };
  },

  /* --- Sesi (mode lokal tidak memakai login) ------------------------------ */
  getSesi() {
    return { masuk: true, admin: ADMIN_LOKAL };
  },

  login() {
    return { masuk: true, admin: ADMIN_LOKAL };
  },

  logout() {
    return { ok: true };
  },

  getAdmin() {
    return ADMIN_LOKAL;
  },

  getLog() {
    return [];
  },

  getStatus() {
    return { mode: 'lokal', admin: ADMIN_LOKAL };
  },

  pantauSumber(callback) {
    pantauPerubahanLintasTab(callback);
  },
};

export { ApiError };
export { resolveJenis, resolvePetugas };
