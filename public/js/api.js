/**
 * Adapter data untuk aplikasi statis.
 *
 * Bentuk respons sengaja dipertahankan sama dengan API Express versi lama,
 * sehingga halaman-halaman lama hanya perlu mengganti sumber datanya.
 * Tidak ada fetch: semua operasi membaca/menulis localStorage.
 */

import {
  bacaDataset,
  simpanDataset,
  simpanBackup,
  idBerikutnya,
  rapikanTeks,
  urutkanJenis,
  urutkanPetugas,
} from './store/penyimpanan.js';
import { buatRekapBulanan, buatRekapJenis } from './store/pivot.js';
import { BULAN } from './bulan.js';
import { SARAN_PEKERJAAN } from './store/saran-pekerjaan.js';

const TAHUN_MIN = 2020;
const TAHUN_MAKS = 65535;

export class ApiError extends Error {
  constructor(status, pesan, errors = null, data = null) {
    super(pesan);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
    this.data = data;
  }
}

/* -------------------------------------------------------------------------
   Validasi (padanan server/lib/validasi.js)
   ------------------------------------------------------------------------- */
function tahunDari(nilai) {
  if (nilai === undefined || nilai === null || nilai === '') return new Date().getFullYear();
  const tahun = Number(nilai);
  if (!Number.isInteger(tahun) || tahun < TAHUN_MIN || tahun > TAHUN_MAKS) {
    throw new ApiError(400, 'Tahun tidak valid.', {
      tahun: `Tahun harus bilangan bulat minimal ${TAHUN_MIN}.`,
    });
  }
  return tahun;
}

function angkaField(nilai, field, label, { min = null, maks = null } = {}) {
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

function teksField(nilai, field, label, { maks = 255 } = {}) {
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

function honorField(nilai) {
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

/* -------------------------------------------------------------------------
   Master data
   ------------------------------------------------------------------------- */
function resolveJenis(ds, id) {
  const angka = angkaField(id, 'jenis_kegiatan_id', 'Jenis kegiatan', { min: 1 });
  const jenis = ds.jenis.find((baris) => Number(baris.id) === angka);
  if (!jenis) {
    throw new ApiError(400, 'Jenis kegiatan tidak ditemukan.', {
      jenis_kegiatan_id: 'Jenis kegiatan tidak ditemukan.',
    });
  }
  return jenis;
}

function resolvePetugas(ds, body) {
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

  const petugas = { id: idBerikutnya(ds.petugas), nama };
  ds.petugas.push(petugas);
  return petugas;
}

function daftarSaran(ds) {
  const terpakai = new Set();
  const hasil = [];
  const tambah = (nama) => {
    const teks = rapikanTeks(nama);
    if (!teks) return;
    const kunci = teks.toLowerCase();
    if (terpakai.has(kunci)) return;
    terpakai.add(kunci);
    hasil.push(teks);
  };

  for (const nama of SARAN_PEKERJAAN) tambah(nama);
  const dipakai = [...new Set(ds.penugasan.map((baris) => baris.nama_pekerjaan))]
    .sort((a, b) => a.localeCompare(b, 'id'));
  for (const nama of dipakai) tambah(nama);
  return hasil;
}

function barisUntukApi(ds, baris) {
  const petugas = ds.petugas.find((item) => Number(item.id) === Number(baris.petugas_id));
  const jenis = ds.jenis.find((item) => Number(item.id) === Number(baris.jenis_kegiatan_id));
  return {
    id: Number(baris.id),
    petugas_id: Number(baris.petugas_id),
    nama_petugas: petugas?.nama || '-',
    jenis_kegiatan_id: Number(baris.jenis_kegiatan_id),
    jenis_nama: jenis?.nama || '-',
    nama_kegiatan_id: null,
    kode_kegiatan: null,
    nama_pekerjaan: baris.nama_pekerjaan,
    bulan: Number(baris.bulan),
    tahun: Number(baris.tahun),
    honor: Number(baris.honor),
  };
}

function validasiPayload(ds, body) {
  const jenis = resolveJenis(ds, body.jenis_kegiatan_id);
  const namaPekerjaan =
    body.nama_pekerjaan !== undefined
      ? teksField(body.nama_pekerjaan, 'nama_pekerjaan', 'Nama pekerjaan/kegiatan', { maks: 255 })
      : teksField(
          body.nama_kegiatan_nama,
          'nama_pekerjaan',
          'Nama pekerjaan/kegiatan',
          { maks: 255 }
        );

  return {
    jenis_kegiatan_id: Number(jenis.id),
    nama_pekerjaan: namaPekerjaan,
    bulan: angkaField(body.bulan, 'bulan', 'Bulan', { min: 1, maks: 12 }),
    tahun: angkaField(body.tahun, 'tahun', 'Tahun', { min: TAHUN_MIN, maks: TAHUN_MAKS }),
    honor: honorField(body.honor),
    petugas: resolvePetugas(ds, body),
  };
}

/* -------------------------------------------------------------------------
   Publik
   ------------------------------------------------------------------------- */
export const api = {
  getMeta(tahun) {
    const aktif = tahunDari(tahun);
    const ds = bacaDataset();
    const setTahun = new Set(ds.penugasan.map((baris) => Number(baris.tahun)));
    setTahun.add(aktif);
    setTahun.add(new Date().getFullYear());

    const saran = daftarSaran(ds);
    return {
      tahun: aktif,
      tahun_berjalan: new Date().getFullYear(),
      tahun_tersedia: [...setTahun]
        .filter((nilai) => Number.isInteger(nilai) && nilai >= TAHUN_MIN)
        .sort((a, b) => b - a),
      jenis_kegiatan: urutkanJenis(ds.jenis).map((baris) => ({
        id: Number(baris.id),
        nama: baris.nama,
        urutan: Number(baris.urutan),
      })),
      petugas: urutkanPetugas(ds.petugas).map((baris) => ({
        id: Number(baris.id),
        nama: baris.nama,
      })),
      nama_kegiatan: saran.map((nama, indeks) => ({
        id: indeks + 1,
        kode: null,
        nama,
        tahun: null,
      })),
    };
  },

  getPenugasan(params = {}) {
    const tahun = tahunDari(params.tahun);
    const ds = bacaDataset();
    let rows = ds.penugasan.filter((baris) => Number(baris.tahun) === tahun);

    if (params.bulan !== undefined && params.bulan !== '') {
      const bulan = angkaField(params.bulan, 'bulan', 'Bulan', { min: 1, maks: 12 });
      rows = rows.filter((baris) => Number(baris.bulan) === bulan);
    }

    if (params.jenis_id !== undefined && params.jenis_id !== '') {
      const jenisId = angkaField(params.jenis_id, 'jenis_id', 'Jenis kegiatan', { min: 1 });
      rows = rows.filter((baris) => Number(baris.jenis_kegiatan_id) === jenisId);
    }

    const cari = rapikanTeks(params.q).toLowerCase();
    if (cari) {
      rows = rows.filter((baris) => {
        const petugas = ds.petugas.find((item) => Number(item.id) === Number(baris.petugas_id));
        const jenis = ds.jenis.find((item) => Number(item.id) === Number(baris.jenis_kegiatan_id));
        return [baris.nama_pekerjaan, petugas?.nama, jenis?.nama]
          .filter(Boolean)
          .some((teks) => teks.toLowerCase().includes(cari));
      });
    }

    rows = rows.slice().sort((a, b) => a.bulan - b.bulan || a.id - b.id);
    return { tahun, total: rows.length, data: rows.map((baris) => barisUntukApi(ds, baris)) };
  },

  buatPenugasan(body = {}) {
    const ds = bacaDataset();
    const data = validasiPayload(ds, body);
    const baris = {
      id: idBerikutnya(ds.penugasan),
      petugas_id: Number(data.petugas.id),
      jenis_kegiatan_id: data.jenis_kegiatan_id,
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

    const data = validasiPayload(ds, body);
    lama.petugas_id = Number(data.petugas.id);
    lama.jenis_kegiatan_id = data.jenis_kegiatan_id;
    lama.nama_pekerjaan = data.nama_pekerjaan;
    lama.bulan = data.bulan;
    lama.tahun = data.tahun;
    lama.honor = data.honor;

    const tersimpan = simpanDataset(ds);
    return { message: 'Penugasan berhasil diperbarui.', data: barisUntukApi(tersimpan, lama) };
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

  getDashboard(tahun) {
    const aktif = tahunDari(tahun);
    const ds = bacaDataset();
    const rows = ds.penugasan.filter((baris) => Number(baris.tahun) === aktif);

    const totalHonor = rows.reduce((total, baris) => total + Number(baris.honor), 0);
    const jumlahPetugas = new Set(rows.map((baris) => Number(baris.petugas_id))).size;

    const perBulan = new Map();
    for (const baris of rows) {
      const bulan = Number(baris.bulan);
      const data = perBulan.get(bulan) || { total: 0, jumlah: 0 };
      data.total += Number(baris.honor);
      data.jumlah += 1;
      perBulan.set(bulan, data);
    }

    const perJenis = new Map();
    for (const baris of rows) {
      const jenis = Number(baris.jenis_kegiatan_id);
      const data = perJenis.get(jenis) || { total: 0, jumlah: 0 };
      data.total += Number(baris.honor);
      data.jumlah += 1;
      perJenis.set(jenis, data);
    }

    return {
      tahun: aktif,
      total_honor: totalHonor,
      jumlah_penugasan: rows.length,
      jumlah_petugas: jumlahPetugas,
      per_bulan: Array.from({ length: 12 }, (_, i) => {
        const bulan = i + 1;
        const data = perBulan.get(bulan);
        return {
          bulan,
          label: BULAN[bulan],
          total: data?.total || 0,
          jumlah_penugasan: data?.jumlah || 0,
        };
      }),
      per_jenis: urutkanJenis(ds.jenis).map((baris) => {
        const data = perJenis.get(Number(baris.id));
        return {
          id: Number(baris.id),
          nama: baris.nama,
          urutan: Number(baris.urutan),
          total: data?.total || 0,
          jumlah_penugasan: data?.jumlah || 0,
        };
      }),
    };
  },

  getRekapBulanan(tahun) {
    const aktif = tahunDari(tahun);
    const ds = bacaDataset();
    const rows = ds.penugasan.filter((baris) => Number(baris.tahun) === aktif);
    const idAda = new Set(rows.map((baris) => Number(baris.petugas_id)));
    const petugas = urutkanPetugas(ds.petugas.filter((baris) => idAda.has(Number(baris.id))));
    return buatRekapBulanan({ tahun: aktif, petugas, penugasan: ds.penugasan });
  },

  getRekapJenis(tahun) {
    const aktif = tahunDari(tahun);
    const ds = bacaDataset();
    const rows = ds.penugasan.filter((baris) => Number(baris.tahun) === aktif);
    const idAda = new Set(rows.map((baris) => Number(baris.petugas_id)));
    const petugas = urutkanPetugas(ds.petugas.filter((baris) => idAda.has(Number(baris.id))));
    return buatRekapJenis({
      tahun: aktif,
      petugas,
      jenis: ds.jenis,
      penugasan: ds.penugasan,
    });
  },

  getJenisKegiatan(tahun) {
    const aktif = tahunDari(tahun);
    const ds = bacaDataset();
    return urutkanJenis(ds.jenis)
      .map((jenis) => {
        const dipakai = ds.penugasan.filter(
          (baris) => Number(baris.jenis_kegiatan_id) === Number(jenis.id)
        );
        const jumlahTahun = dipakai.filter(
          (baris) => Number(baris.tahun) === aktif
        ).length;
        return {
          id: Number(jenis.id),
          nama: jenis.nama,
          urutan: Number(jenis.urutan),
          jumlah_pemakaian: jumlahTahun,
          jumlah_pemakaian_total: dipakai.length,
          bisa_dihapus: dipakai.length === 0,
        };
      })
      .sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
  },

  buatJenisKegiatan(body = {}) {
    const nama = teksField(body.nama, 'nama', 'Nama jenis kegiatan', { maks: 100 });
    const ds = bacaDataset();
    if (ds.jenis.some((baris) => baris.nama.toLowerCase() === nama.toLowerCase())) {
      throw new ApiError(400, 'Nama jenis kegiatan sudah digunakan.', {
        nama: 'Nama jenis kegiatan sudah digunakan.',
      });
    }
    const urutan =
      body.urutan === undefined || body.urutan === null || body.urutan === ''
        ? ds.jenis.reduce((maks, baris) => Math.max(maks, Number(baris.urutan) || 0), 0) + 1
        : angkaField(body.urutan, 'urutan', 'Urutan', { min: 0, maks: 65535 });
    const jenis = { id: idBerikutnya(ds.jenis), nama, urutan };
    ds.jenis.push(jenis);
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
    const urutan =
      body.urutan === undefined || body.urutan === null || body.urutan === ''
        ? Number(jenis.urutan)
        : angkaField(body.urutan, 'urutan', 'Urutan', { min: 0, maks: 65535 });

    jenis.nama = nama;
    jenis.urutan = urutan;
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
    ds.jenis = ds.jenis.filter((baris) => Number(baris.id) !== angka);
    simpanDataset(ds);
    return { message: 'Jenis kegiatan berhasil dihapus.' };
  },

  getNamaKegiatan() {
    return daftarSaran(bacaDataset()).map((nama, indeks) => ({
      id: indeks + 1,
      kode: null,
      nama,
      tahun: null,
    }));
  },
};

export { simpanBackup };
