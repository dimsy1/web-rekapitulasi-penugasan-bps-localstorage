/**
 * Aturan validasi input, dipakai bersama oleh adapter lokal (uji) dan
 * adapter server (halaman web). Backend PHP mengulang aturan yang sama.
 */

import { ApiError } from './kesalahan.js';
import { idBerikutnya, rapikanTeks } from './penyimpanan.js';

export const TAHUN_MIN = 2020;
export const TAHUN_MAKS = 65535;
// Nilai khusus untuk grup "Tanpa tahun (—)": baris berkolom tahun kosong (null).
export const TAHUN_KOSONG = 'kosong';

export function tahunDari(nilai) {
  if (nilai === TAHUN_KOSONG) return TAHUN_KOSONG;
  if (nilai === undefined || nilai === null || nilai === '') return new Date().getFullYear();
  const tahun = Number(nilai);
  if (!Number.isInteger(tahun) || tahun < TAHUN_MIN || tahun > TAHUN_MAKS) {
    throw new ApiError(400, 'Tahun tidak valid.', {
      tahun: `Tahun harus bilangan bulat minimal ${TAHUN_MIN}.`,
    });
  }
  return tahun;
}

/** Cocokkan tahun baris dengan tahun aktif, termasuk grup "Tanpa tahun". */
export function cocokTahun(tahunBaris, aktif) {
  if (aktif === TAHUN_KOSONG) return tahunBaris === null || tahunBaris === undefined;
  return Number(tahunBaris) === aktif;
}

export function angkaField(nilai, field, label, { min = null, maks = null } = {}) {
  if (nilai === undefined || nilai === null || nilai === '') {
    throw new ApiError(400, `${label} wajib diisi.`, { [field]: `${label} wajib diisi.` });
  }
  const angka = Number(nilai);
  if (!Number.isInteger(angka)) {
    throw new ApiError(400, `${label} tidak valid.`, {
      [field]: `${label} harus berupa bilangan bulat.`,
    });
  }
  if (min !== null && angka < min) {
    throw new ApiError(400, `${label} tidak valid.`, { [field]: `${label} minimal ${min}.` });
  }
  if (maks !== null && angka > maks) {
    throw new ApiError(400, `${label} tidak valid.`, { [field]: `${label} maksimal ${maks}.` });
  }
  return angka;
}

export function teksField(nilai, field, label, { maks = 255 } = {}) {
  const teks = rapikanTeks(nilai);
  if (!teks) {
    throw new ApiError(400, `${label} wajib diisi.`, { [field]: `${label} wajib diisi.` });
  }
  if (teks.length > maks) {
    throw new ApiError(400, `${label} terlalu panjang.`, {
      [field]: `${label} maksimal ${maks} karakter.`,
    });
  }
  return teks;
}

export function teksOpsional(nilai, field, label, { maks = 255 } = {}) {
  const teks = rapikanTeks(nilai);
  if (teks.length > maks) {
    throw new ApiError(400, `${label} terlalu panjang.`, {
      [field]: `${label} maksimal ${maks} karakter.`,
    });
  }
  return teks;
}

export function bilanganOpsional(nilai, field, label, { min = 1, maks = 12 } = {}) {
  if (nilai === undefined || nilai === null || nilai === '') return null;
  const angka = Number(nilai);
  if (!Number.isInteger(angka) || angka < min || angka > maks) {
    throw new ApiError(400, `${label} tidak valid.`, {
      [field]: `${label} harus bilangan bulat ${min}–${maks}.`,
    });
  }
  return angka;
}

export function honorField(nilai) {
  if (nilai === undefined || nilai === null || nilai === '') {
    throw new ApiError(400, 'Honor wajib diisi.', { honor: 'Honor wajib diisi.' });
  }
  let angka;
  if (typeof nilai === 'number') {
    angka = nilai;
  } else {
    const bersih = String(nilai).trim().replace(/\./g, '');
    if (!/^\d+$/.test(bersih)) {
      throw new ApiError(400, 'Honor tidak valid.', {
        honor: 'Honor harus berupa angka bulat minimal 0.',
      });
    }
    angka = Number(bersih);
  }
  if (!Number.isInteger(angka) || angka < 0) {
    throw new ApiError(400, 'Honor tidak valid.', {
      honor: 'Honor harus berupa angka bulat minimal 0.',
    });
  }
  if (!Number.isSafeInteger(angka)) {
    throw new ApiError(400, 'Honor tidak valid.', { honor: 'Nilai honor terlalu besar.' });
  }
  return angka;
}

export function honorOpsional(nilai) {
  if (nilai === undefined || nilai === null || nilai === '') return null;
  return honorField(nilai);
}

// Tahun boleh kosong: baris disimpan tanpa tahun dan tampil di grup "Tanpa tahun".
export function tahunOpsional(nilai) {
  if (nilai === undefined || nilai === null || nilai === '') return null;
  return angkaField(nilai, 'tahun', 'Tahun', { min: TAHUN_MIN, maks: TAHUN_MAKS });
}

export function resolveJenis(ds, id) {
  const angka = angkaField(id, 'jenis_kegiatan_id', 'Jenis kegiatan', { min: 1 });
  const jenis = ds.jenis.find((baris) => Number(baris.id) === angka);
  if (!jenis) {
    throw new ApiError(400, 'Jenis kegiatan tidak ditemukan.', {
      jenis_kegiatan_id: 'Jenis kegiatan tidak ditemukan.',
    });
  }
  return jenis;
}

export function jenisOpsional(ds, nilai) {
  if (nilai === undefined || nilai === null || nilai === '') return null;
  return Number(resolveJenis(ds, nilai).id);
}

export function urutanPetugasBaru(ds) {
  return ds.petugas.reduce((maks, baris) => Math.max(maks, Number(baris.urutan) || 0), 0) + 1;
}

export function resolvePetugas(ds, body) {
  const punyaId =
    body.petugas_id !== undefined && body.petugas_id !== null && body.petugas_id !== '';

  if (punyaId) {
    const id = angkaField(body.petugas_id, 'petugas_id', 'Petugas', { min: 1 });
    const petugas = ds.petugas.find((baris) => Number(baris.id) === id);
    if (!petugas) {
      throw new ApiError(400, 'Petugas tidak ditemukan.', {
        petugas_id: 'Petugas tidak ditemukan.',
      });
    }
    return petugas;
  }

  const nama = teksField(body.petugas_nama, 'petugas_id', 'Nama petugas', { maks: 150 });
  const normal = nama.toLowerCase();
  const ada = ds.petugas.find((baris) => baris.nama.toLowerCase() === normal);
  if (ada) return ada;

  const petugas = { id: idBerikutnya(ds.petugas), nama, urutan: urutanPetugasBaru(ds) };
  ds.petugas.push(petugas);
  return petugas;
}

/** Validasi payload penugasan (kolom selain nama petugas boleh kosong). */
export function validasiPayloadPenugasan(ds, body) {
  const namaPekerjaan = teksOpsional(
    body.nama_pekerjaan !== undefined ? body.nama_pekerjaan : body.nama_kegiatan_nama,
    'nama_pekerjaan',
    'Nama pekerjaan/kegiatan',
    { maks: 255 }
  );

  return {
    jenis_kegiatan_id: jenisOpsional(ds, body.jenis_kegiatan_id),
    nama_pekerjaan: namaPekerjaan,
    bulan: bilanganOpsional(body.bulan, 'bulan', 'Bulan', { min: 1, maks: 12 }),
    tahun: tahunOpsional(body.tahun),
    honor: honorOpsional(body.honor),
    petugas: resolvePetugas(ds, body),
  };
}
