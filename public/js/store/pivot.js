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

  // Urutan baris mengikuti urutan petugas yang diberikan (kolom A sheet rekap).
  return {
    tahun,
    kolom,
    baris,
    ...hitungTotal(baris, kolom),
  };
}

/**
 * Rekap per jenis kegiatan dengan subkolom posisi petugas.
 *
 * @param {object} opsi
 * @param {number} opsi.tahun
 * @param {Array<{id:number,nama:string}>} opsi.petugas
 * @param {Array<{id:number,nama:string,urutan:number}>} opsi.jenis
 * @param {Array<{id:number,jenis_kegiatan_id:number,nama:string,urutan:number}>} opsi.posisi
 * @param {Array<object>} opsi.penugasan
 */
export function buatRekapJenis({ tahun, petugas, jenis, posisi = [], penugasan }) {
  const jenisUrut = jenis
    .slice()
    .sort((a, b) => Number(a.urutan) - Number(b.urutan) || Number(a.id) - Number(b.id));
  const posisiUrut = posisi
    .slice()
    .sort(
      (a, b) =>
        Number(a.jenis_kegiatan_id) - Number(b.jenis_kegiatan_id) ||
        Number(a.urutan) - Number(b.urutan) ||
        Number(a.id) - Number(b.id)
    );

  // Jenis yang masih punya baris tanpa posisi pada tahun ini mendapat
  // subkolom khusus agar honor lama tetap terhitung.
  const jenisTanpaPosisi = new Set();
  for (const data of penugasan) {
    if (Number(data.tahun) !== Number(tahun)) continue;
    const jenisId = Number(data.jenis_kegiatan_id);
    if (!Number.isInteger(jenisId) || jenisId <= 0) continue;
    if (data.posisi_id === null || data.posisi_id === undefined) {
      jenisTanpaPosisi.add(jenisId);
    }
  }

  const kolom = [];
  const grup = [];
  for (const j of jenisUrut) {
    const jenisId = Number(j.id);
    const sub = posisiUrut
      .filter((p) => Number(p.jenis_kegiatan_id) === jenisId)
      .map((p) => ({
        key: `${jenisId}-${Number(p.id)}`,
        label: p.nama,
        jenis_id: jenisId,
        jenis_nama: j.nama,
        posisi_id: Number(p.id),
        tanpa_posisi: false,
      }));

    if (sub.length === 0 || jenisTanpaPosisi.has(jenisId)) {
      sub.push({
        key: `${jenisId}-tanpa`,
        label: 'Tanpa posisi',
        jenis_id: jenisId,
        jenis_nama: j.nama,
        posisi_id: null,
        tanpa_posisi: true,
      });
    }

    grup.push({
      key: `jenis-${jenisId}`,
      label: j.nama,
      jenis_id: jenisId,
      kolom: sub,
    });
    kolom.push(...sub);
  }

  const baris = barisDasar(petugas, kolom);
  const peta = new Map(baris.map((item) => [item.petugas_id, item]));

  for (const data of penugasan) {
    if (Number(data.tahun) !== Number(tahun)) continue;
    const target = peta.get(Number(data.petugas_id));
    if (!target) continue;

    const jenisId = Number(data.jenis_kegiatan_id);
    if (!Number.isInteger(jenisId) || jenisId <= 0) continue;
    const posisiId =
      data.posisi_id === null || data.posisi_id === undefined ? null : Number(data.posisi_id);
    const key = posisiId === null ? `${jenisId}-tanpa` : `${jenisId}-${posisiId}`;
    if (!(key in target.sel)) continue;

    const honor = Number(data.honor) || 0;
    target.sel[key] += honor;
    target.total += honor;
    target.jumlah_penugasan += 1;
  }

  // Urutan baris mengikuti urutan petugas yang diberikan (kolom A sheet rekap).
  return {
    tahun,
    kolom,
    grup,
    baris,
    ...hitungTotal(baris, kolom),
  };
}
