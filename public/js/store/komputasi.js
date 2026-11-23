/**
 * Perhitungan data yang dipakai kedua adapter (lokal dan server).
 * Semua fungsi menerima dataset yang sudah dinormalisasi.
 */

import { BULAN } from '../bulan.js';
import {
  kolomKosong,
  labelKolomKosong,
  rapikanTeks,
  urutkanJenis,
  urutkanPetugas,
} from './penyimpanan.js';
import { SARAN_PEKERJAAN } from './saran-pekerjaan.js';
import { buatRekapBulanan, buatRekapJenis } from './pivot.js';
import { TAHUN_KOSONG, angkaField, cocokTahun, tahunDari } from './validasi.js';

export function daftarSaran(ds) {
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

  const master = Array.isArray(ds.namaKegiatan) ? ds.namaKegiatan : [];
  for (const item of master) tambah(typeof item === 'string' ? item : item?.nama);
  // Adapter lokal/test lama tetap memiliki fallback bawaan saat belum ada DB.
  if (master.length === 0) {
    for (const nama of SARAN_PEKERJAAN) tambah(nama);
  }
  const dipakai = [...new Set(ds.penugasan.map((baris) => baris.nama_pekerjaan))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'id'));
  for (const nama of dipakai) tambah(nama);
  return hasil;
}

export function barisUntukApi(ds, baris) {
  if (!baris) return null;
  const petugas = ds.petugas.find((item) => Number(item.id) === Number(baris.petugas_id));
  const jenis = ds.jenis.find((item) => Number(item.id) === Number(baris.jenis_kegiatan_id));
  const kosong = kolomKosong(baris);
  return {
    id: Number(baris.id),
    petugas_id: Number(baris.petugas_id),
    nama_petugas: petugas?.nama || '-',
    jenis_kegiatan_id:
      baris.jenis_kegiatan_id === null || baris.jenis_kegiatan_id === undefined
        ? null
        : Number(baris.jenis_kegiatan_id),
    jenis_nama: jenis?.nama || '',
    nama_kegiatan_id: null,
    kode_kegiatan: null,
    nama_pekerjaan: baris.nama_pekerjaan || '',
    bulan: baris.bulan === null || baris.bulan === undefined ? null : Number(baris.bulan),
    tahun: baris.tahun === null || baris.tahun === undefined ? null : Number(baris.tahun),
    honor: baris.honor === null || baris.honor === undefined ? null : Number(baris.honor),
    versi: Number(baris.versi) || 0,
    lengkap: kosong.length === 0,
    kosong,
    kosong_label: kosong.map((kunci) => labelKolomKosong(kunci)),
  };
}

export function metaDataset(ds, tahun) {
  const aktif = tahunDari(tahun);
  const setTahun = new Set(ds.penugasan.map((baris) => Number(baris.tahun)));
  if (aktif !== TAHUN_KOSONG) setTahun.add(aktif);
  setTahun.add(new Date().getFullYear());
  const adaTanpaTahun = ds.penugasan.some(
    (baris) => baris.tahun === null || baris.tahun === undefined
  );

  return {
    tahun: aktif,
    tahun_analisis: ds.tahunAnalisis ?? null,
    tahun_berjalan: new Date().getFullYear(),
    ada_tanpa_tahun: adaTanpaTahun,
    tahun_tersedia: [...setTahun]
      .filter((nilai) => Number.isInteger(nilai) && nilai >= 2020)
      .sort((a, b) => b - a),
    jenis_kegiatan: urutkanJenis(ds.jenis).map((baris) => ({
      id: Number(baris.id),
      nama: baris.nama,
      urutan: Number(baris.urutan),
    })),
    petugas: urutkanPetugas(ds.petugas).map((baris) => ({
      id: Number(baris.id),
      nama: baris.nama,
      urutan: Number(baris.urutan),
      versi: Number(baris.versi) || 0,
    })),
    nama_kegiatan: daftarSaran(ds).map((nama, indeks) => ({
      id: masterNamaKegiatanId(ds, nama, indeks),
      kode: null,
      nama,
      tahun: null,
    })),
  };
}

function masterNamaKegiatanId(ds, nama, indeks) {
  const item = (ds.namaKegiatan || []).find((baris) => baris?.nama === nama);
  return item ? Number(item.id) : indeks + 1;
}

export function penugasanDataset(ds, params = {}) {
  const tahun = tahunDari(params.tahun);
  let rows = ds.penugasan.filter((baris) => cocokTahun(baris.tahun, tahun));

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

  const belumLengkap = rows.filter((baris) => kolomKosong(baris).length > 0).length;
  if (params.status === 'belum') {
    rows = rows.filter((baris) => kolomKosong(baris).length > 0);
  } else if (params.status === 'lengkap') {
    rows = rows.filter((baris) => kolomKosong(baris).length === 0);
  }

  rows = rows
    .slice()
    .sort((a, b) => (a.bulan ?? 13) - (b.bulan ?? 13) || a.id - b.id);

  return {
    tahun,
    total: rows.length,
    belum_lengkap: belumLengkap,
    data: rows.map((baris) => barisUntukApi(ds, baris)),
  };
}

export function dashboardDataset(ds, tahun) {
  const aktif = tahunDari(tahun);
  const rows = ds.penugasan.filter((baris) => cocokTahun(baris.tahun, aktif));

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
}

export function rekapBulananDataset(ds, tahun) {
  const aktif = tahunDari(tahun);
  return buatRekapBulanan({
    tahun: aktif,
    petugas: urutkanPetugas(ds.petugas),
    penugasan: ds.penugasan,
  });
}

export function rekapJenisDataset(ds, tahun) {
  const aktif = tahunDari(tahun);
  return buatRekapJenis({
    tahun: aktif,
    petugas: urutkanPetugas(ds.petugas),
    jenis: ds.jenis,
    penugasan: ds.penugasan,
  });
}

export function petugasDataset(ds, tahun) {
  const aktif = tahunDari(tahun);
  return urutkanPetugas(ds.petugas).map((orang) => {
    const dipakai = ds.penugasan.filter(
      (baris) => Number(baris.petugas_id) === Number(orang.id)
    );
    const jumlahTahun = dipakai.filter((baris) => cocokTahun(baris.tahun, aktif)).length;
    return {
      id: Number(orang.id),
      nama: orang.nama,
      urutan: Number(orang.urutan),
      versi: Number(orang.versi) || 0,
      jumlah_penugasan: jumlahTahun,
      jumlah_penugasan_total: dipakai.length,
      bisa_dihapus: dipakai.length === 0,
    };
  });
}

export function jenisKegiatanDataset(ds, tahun) {
  const aktif = tahunDari(tahun);
  return urutkanJenis(ds.jenis)
    .map((jenis) => {
      const dipakai = ds.penugasan.filter(
        (baris) => Number(baris.jenis_kegiatan_id) === Number(jenis.id)
      );
      const jumlahTahun = dipakai.filter((baris) => cocokTahun(baris.tahun, aktif)).length;
      return {
        id: Number(jenis.id),
        nama: jenis.nama,
        urutan: Number(jenis.urutan),
        versi: Number(jenis.versi) || 0,
        jumlah_pemakaian: jumlahTahun,
        jumlah_pemakaian_total: dipakai.length,
        bisa_dihapus: dipakai.length === 0,
      };
    })
    .sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
}
