import { api } from './api.js';
import { initLayout, toast, labelTahunAktif } from './layout.js';
import { escapeHtml, formatAngka, formatRupiah, formatSel, unduhCSV } from './format.js';

const el = (id) => document.getElementById(id);

const state = {
  tahun: new Date().getFullYear(),
  data: null,
};

const LEBAR_NAMA = 230;
const LEBAR_BULAN = 104;
const LEBAR_TOTAL = 126;
const LEBAR_JUMLAH = 110;

function selHtml(nilai) {
  const angka = Number(nilai) || 0;
  return `<td class="num${angka === 0 ? ' sel-nol' : ''}">${formatSel(angka)}</td>`;
}

function tampilkanKosong(judul, pesan) {
  el('empty-judul').textContent = judul;
  el('empty-pesan').textContent = pesan;
  el('rekap-empty').hidden = false;
  el('rekap-card').hidden = true;
}

function render(data) {
  const kolom = data.kolom || [];
  const totalLebar = LEBAR_NAMA + kolom.length * LEBAR_BULAN + LEBAR_TOTAL + LEBAR_JUMLAH;

  el('colgroup-rekap').innerHTML = [
    `<col style="width:${LEBAR_NAMA}px">`,
    ...kolom.map(() => `<col style="width:${LEBAR_BULAN}px">`),
    `<col style="width:${LEBAR_TOTAL}px">`,
    `<col style="width:${LEBAR_JUMLAH}px">`,
  ].join('');

  el('thead-rekap').innerHTML = `<tr>
    <th class="col-nama">Nama Petugas</th>
    ${kolom.map((k) => `<th class="num">${escapeHtml(k.label)}</th>`).join('')}
    <th class="num total-col">Total Setahun</th>
    <th class="num total-col">Jumlah Penugasan</th>
  </tr>`;

  const baris = (data.baris || [])
    .map(
      (orang) => `<tr>
        <td class="col-nama" title="${escapeHtml(orang.nama)}">${escapeHtml(orang.nama)}</td>
        ${kolom.map((k) => selHtml(orang.sel?.[k.key])).join('')}
        <td class="num total-col${Number(orang.total) === 0 ? ' sel-nol' : ''}">${formatSel(orang.total)}</td>
        <td class="num total-col">${formatAngka(orang.jumlah_penugasan)}</td>
      </tr>`
    )
    .join('');

  const totalBaris = `<tr class="row-total">
    <td class="col-nama">TOTAL</td>
    ${kolom.map((k) => selHtml(data.total_per_kolom?.[k.key])).join('')}
    <td class="num total-col${Number(data.total_keseluruhan) === 0 ? ' sel-nol' : ''}">${formatSel(data.total_keseluruhan)}</td>
    <td class="num total-col">${formatAngka(data.total_penugasan)}</td>
  </tr>`;

  el('tbody-rekap').innerHTML = baris + totalBaris;
  el('tabel-rekap').style.width = `${totalLebar}px`;

  el('ringkasan-rekap').textContent =
    `Total honor ${formatRupiah(data.total_keseluruhan)} • ` +
    `${formatAngka(data.total_penugasan)} penugasan • ${data.baris.length} petugas`;
  const label = labelTahunAktif(data.tahun);
  el('foot-tahun').textContent = label === '-' ? 'Belum ada data penugasan.' : `Sumber: data penugasan tahun ${label}`;
  el('print-tahun').textContent = label;

  el('rekap-card').hidden = false;
  el('rekap-empty').hidden = true;
}

async function muat(tahun) {
  state.tahun = Number(tahun) || state.tahun;
  el('rekap-loading').hidden = false;
  el('rekap-card').hidden = true;
  el('rekap-empty').hidden = true;
  el('ringkasan-rekap').textContent = 'Memuat data…';
  el('print-tahun').textContent = labelTahunAktif(state.tahun);

  try {
    const data = await api.getRekapBulanan(state.tahun);
    state.data = data;
    el('rekap-loading').hidden = true;

    if (!data.baris || data.baris.length === 0) {
      state.data = data;
      const label = labelTahunAktif(state.tahun);
      el('ringkasan-rekap').textContent = label === '-'
        ? 'Belum ada data penugasan.'
        : `Belum ada data penugasan pada tahun ${label}.`;
      tampilkanKosong(
        'Belum ada data untuk tahun ini',
        'Tambahkan penugasan pada halaman Daftar Penugasan, lalu pilih tahun yang sesuai.'
      );
      return;
    }

    render(data);
  } catch (kesalahan) {
    el('rekap-loading').hidden = true;
    el('ringkasan-rekap').textContent = 'Data rekap tidak dapat dimuat.';
    tampilkanKosong('Gagal memuat data rekap', kesalahan.message);
    toast(`Gagal memuat rekap bulanan: ${kesalahan.message}`, 'error');
  }
}

/*
function ekspor() {
  if (!state.data || !state.data.baris || state.data.baris.length === 0) {
    toast('Tidak ada data untuk diekspor pada tahun ini.', 'info');
    return;
  }

  const { kolom, baris, total_per_kolom, total_keseluruhan, total_penugasan, tahun } = state.data;
  const header = [
    'Nama Petugas',
    ...kolom.map((k) => k.label),
    'Total Setahun',
    'Jumlah Penugasan',
  ];
  const isi = baris.map((orang) => [
    orang.nama,
    ...kolom.map((k) => orang.sel?.[k.key] ?? 0),
    orang.total,
    orang.jumlah_penugasan,
  ]);
  isi.push([
    'TOTAL',
    ...kolom.map((k) => total_per_kolom?.[k.key] ?? 0),
    total_keseluruhan,
    total_penugasan,
  ]);

  unduhCSV(`rekap-bulanan-${tahun}.csv`, header, isi);
  toast('Rekap bulanan berhasil diekspor.', 'sukses');
}

function cetak() {
  if (!state.data || !state.data.baris || state.data.baris.length === 0) {
    toast('Tidak ada data untuk dicetak pada tahun ini.', 'info');
    return;
  }
  window.print();
}
*/

const app = await initLayout({
  active: 'rekap-bulanan',
  judul: 'Rekap per Bulan',
  deskripsi: 'Honor petugas per bulan.',
});

state.tahun = app.tahun;
// el('btn-cetak').addEventListener('click', cetak);
// el('btn-csv').addEventListener('click', ekspor);

document.addEventListener('tahun-berubah', (event) => {
  muat(event.detail.tahun);
});

await muat(state.tahun);
