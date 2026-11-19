/**
 * Pembentuk matriks rekap (baris x kolom) di browser.
 * Rekap tidak disimpan: selalu dihitung dari daftar penugasan.
 */

import { BULAN } from '../bulan.js';

const kolomBulan = () =>
  Array.from({ length: 12 }, (_, i) => ({ key: String(i + 1), label: BULAN[i + 1] }));

function selKosong(kolom) {
  const sel = {};
  for (const k of kolom) sel[k.key] = 0;
  return sel;
}

function totalKolom(kolom) {
  const total = {};
  for (const k of kolom) total[k.key] = 0;
  return total;
}

function barisDasar(petugas, kolom) {
  return petugas.map((orang) => ({
    petugas_id: Number(orang.id),
    nama: orang.nama,
    sel: selKosong(kolom),
    total: 0,
    jumlah_penugasan: 0,
  }));
}

function hitungTotal(baris, kolom) {
  const total_per_kolom = totalKolom(kolom);
  let total_keseluruhan = 0;
  let total_penugasan = 0;

  for (const item of baris) {
    for (const k of kolom) total_per_kolom[k.key] += item.sel[k.key];
    total_keseluruhan += item.total;
    total_penugasan += item.jumlah_penugasan;
  }

  return { total_per_kolom, total_keseluruhan, total_penugasan };
}

/**
 * @param {object} opsi
 * @param {number} opsi.tahun
 * @param {Array<{id:number,nama:string}>} opsi.petugas
 * @param {Array<object>} opsi.penugasan
 */
export function buatRekapBulanan({ tahun, petugas, penugasan }) {
  const kolom = kolomBulan();
  const baris = barisDasar(petugas, kolom);
  const peta = new Map(baris.map((item) => [item.petugas_id, item]));

  for (const data of penugasan) {
    if (Number(data.tahun) !== Number(tahun)) continue;
    const target = peta.get(Number(data.petugas_id));
    if (!target) continue;
    const key = String(data.bulan);
    if (!(key in target.sel)) continue;
    const honor = Number(data.honor) || 0;
    target.sel[key] += honor;
    target.total += honor;
    target.jumlah_penugasan += 1;
  }

  baris.sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
  return {
    tahun,
    kolom,
    baris,
    ...hitungTotal(baris, kolom),
  };
}

/**
 * @param {object} opsi
 * @param {number} opsi.tahun
 * @param {Array<{id:number,nama:string}>} opsi.petugas
 * @param {Array<{id:number,nama:string,urutan:number}>} opsi.jenis
 * @param {Array<object>} opsi.penugasan
 */
export function buatRekapJenis({ tahun, petugas, jenis, penugasan }) {
  const kolom = jenis
    .slice()
    .sort((a, b) => Number(a.urutan) - Number(b.urutan) || Number(a.id) - Number(b.id))
    .map((j) => ({ key: String(j.id), label: j.nama }));

  const baris = barisDasar(petugas, kolom);
  const peta = new Map(baris.map((item) => [item.petugas_id, item]));

  for (const data of penugasan) {
    if (Number(data.tahun) !== Number(tahun)) continue;
    const target = peta.get(Number(data.petugas_id));
    if (!target) continue;
    const key = String(data.jenis_kegiatan_id);
    if (!(key in target.sel)) continue;
    const honor = Number(data.honor) || 0;
    target.sel[key] += honor;
    target.total += honor;
    target.jumlah_penugasan += 1;
  }

  baris.sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
  return {
    tahun,
    kolom,
    baris,
    ...hitungTotal(baris, kolom),
  };
}
