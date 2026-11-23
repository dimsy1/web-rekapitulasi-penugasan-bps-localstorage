import { api } from './api.js';
import { initLayout, toast, konfirmasiHapus, dialogPesan } from './layout.js';
import { escapeHtml } from './format.js';

const el = (id) => document.getElementById(id);

const state = {
  data: [],
  cari: '',
  editId: null,
  editVersi: 0,
  tahun: null,
  muatToken: 0,
};

function bersihkanError() {
  document
    .querySelectorAll('#form-petugas .field')
    .forEach((field) => field.classList.remove('has-error'));
  document.querySelectorAll('#form-petugas .field-error').forEach((pesan) => {
    pesan.textContent = '';
  });
  const alert = el('alert-petugas');
  alert.classList.remove('show');
  alert.textContent = '';
}

function errorField(kunci, pesan) {
  const target = document.querySelector(`#form-petugas .field-error[data-error="${kunci}"]`);
  if (!target) return false;
  target.textContent = pesan;
  target.closest('.field')?.classList.add('has-error');
  return true;
}

function tampilkanError(error) {
  let ada = false;
  if (error.errors && typeof error.errors === 'object') {
    for (const [kunci, pesan] of Object.entries(error.errors)) {
      const teks = Array.isArray(pesan) ? pesan[0] : String(pesan);
      if (errorField(kunci, teks)) ada = true;
    }
  }
  const alert = el('alert-petugas');
  alert.textContent = ada ? 'Periksa kembali isian yang ditandai merah.' : error.message;
  alert.classList.add('show');
}

function render() {
  const tbody = el('tbody-petugas');
  const kueri = state.cari.trim().toLowerCase();
  const tampil = kueri
    ? state.data.filter((row) => row.nama.toLowerCase().includes(kueri))
    : state.data;

  el('jumlah-petugas').textContent = kueri
    ? `${tampil.length} dari ${state.data.length} petugas`
    : `${state.data.length} petugas`;

  if (tampil.length === 0) {
    const pesan =
      state.data.length === 0
        ? 'Belum ada petugas. Tambahkan nama, atau impor file template yang kolom A sheet rekapnya sudah diisi.'
        : 'Tidak ada petugas yang cocok dengan pencarian.';
    tbody.innerHTML = `<tr><td colspan="4"><div class="dt-empty">${pesan}</div></td></tr>`;
    return;
  }

  tbody.innerHTML = tampil
    .map((row, indeks) => {
      const terkunci = !row.bisa_dihapus;
      const pemakaian = Number(row.jumlah_penugasan) || 0;
      const totalPemakaian = Number(row.jumlah_penugasan_total ?? row.jumlah_penugasan) || 0;
      const tahunLain = Math.max(0, totalPemakaian - pemakaian);
      const aksi = terkunci
        ? `<span class="locked-note">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
               <rect x="5" y="10" width="14" height="10" rx="2.2"></rect>
               <path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10"></path>
             </svg>
             Tidak dapat dihapus
           </span>`
        : `<button type="button" class="btn-icon danger" data-aksi="hapus" data-id="${row.id}" title="Hapus petugas" aria-label="Hapus petugas ${escapeHtml(row.nama)}">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4.8h6V7M6.5 7l.8 13h9.4l.8-13"/><path d="M10 11v5M14 11v5"/></svg>
           </button>`;

      return `<tr>
        <td><span class="cell-muted">${Number(row.urutan) || indeks + 1}</span></td>
        <td>
          <span class="cell-primary">${escapeHtml(row.nama)}</span>
        </td>
        <td>
          ${
            pemakaian > 0
              ? `<span class="badge badge-muted">${pemakaian.toLocaleString('id-ID')} penugasan</span>`
              : totalPemakaian > 0
                ? '<span class="cell-muted">Tidak dipakai tahun ini</span>'
                : '<span class="cell-muted">Belum dipakai</span>'
          }
          ${
            tahunLain > 0
              ? `<span class="usage-note">${totalPemakaian.toLocaleString('id-ID')} total di semua tahun</span>`
              : ''
          }
        </td>
        <td>
          <div class="row-actions">
            <button type="button" class="btn-icon" data-aksi="ubah" data-id="${row.id}" title="Ubah petugas" aria-label="Ubah petugas ${escapeHtml(row.nama)}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m4 20 4.5-1 9.8-9.8a2.1 2.1 0 0 0-3-3L5.5 16 4 20Z"/><path d="m13.8 6.7 3 3"/></svg>
            </button>
            ${aksi}
          </div>
        </td>
      </tr>`;
    })
    .join('');
}

async function muat() {
  const token = ++state.muatToken;
  try {
    const data = await api.getPetugas(state.tahun);
    if (token !== state.muatToken) return;
    state.data = data;
    render();
  } catch (kesalahan) {
    if (token !== state.muatToken) return;
    state.data = [];
    render();
    toast(`Gagal memuat petugas: ${kesalahan.message}`, 'error');
  }
}

function bukaModal(row = null) {
  const modal = el('modal-petugas');
  el('form-petugas').reset();
  bersihkanError();

  state.editId = row ? Number(row.id) : null;
  state.editVersi = row ? Number(row.versi) || 0 : 0;
  el('judul-modal-petugas').textContent = row ? 'Ubah Petugas' : 'Tambah Petugas';
  el('simpan-petugas').textContent = row ? 'Simpan Perubahan' : 'Simpan';

  el('f-nama-petugas').value = row?.nama || '';
  // Urutan tidak lagi diisi manual: mengikuti file Excel yang diimpor, dan
  // petugas baru otomatis diletakkan di akhir oleh api.buatPetugas().
  // el('f-urutan-petugas').value =
  //   row && row.urutan !== undefined && row.urutan !== null ? String(row.urutan) : '';

  modal.showModal();
  document.body.classList.add('modal-terbuka');
  setTimeout(() => el('f-nama-petugas').focus(), 40);
}

function tutupModal() {
  const modal = el('modal-petugas');
  if (modal.open) modal.close();
  document.body.classList.remove('modal-terbuka');
  bersihkanError();
}

function validasi() {
  bersihkanError();
  let valid = true;
  const nama = el('f-nama-petugas').value.trim();

  if (!nama) {
    errorField('nama', 'Nama petugas wajib diisi.');
    valid = false;
  } else if (nama.length > 150) {
    errorField('nama', 'Nama petugas maksimal 150 karakter.');
    valid = false;
  }

  // Urutan tidak dikirim: api memakai urutan terakhir + 1 untuk petugas baru,
  // dan mempertahankan urutan lama saat mengubah nama.
  if (!valid) return null;
  return { nama };
}

async function simpan(event) {
  event.preventDefault();
  const payload = validasi();
  if (!payload) return;

  const tombol = el('simpan-petugas');
  const teksAsli = tombol.textContent;
  tombol.disabled = true;
  tombol.textContent = 'Menyimpan…';

  try {
    const payloadUbah =
      state.editId !== null && state.editVersi > 0
        ? { ...payload, versi: state.editVersi }
        : payload;
    const hasil =
      state.editId !== null
        ? await api.ubahPetugas(state.editId, payloadUbah)
        : await api.buatPetugas(payload);

    tutupModal();
    toast(hasil.message || 'Petugas berhasil disimpan.');
    await muat();
  } catch (kesalahan) {
    tampilkanError(kesalahan);
  } finally {
    tombol.disabled = false;
    tombol.textContent = teksAsli;
  }
}

async function hapus(row) {
  const konfirmasi = await konfirmasiHapus({
    judul: 'Hapus petugas?',
    html: `<p style="margin:0"><strong>${escapeHtml(row.nama)}</strong> akan dihapus dari daftar petugas.<br>
      Petugas yang sudah punya data penugasan tidak dapat dihapus.</p>`,
  });
  if (!konfirmasi) return;

  try {
    const hasil = await api.hapusPetugas(row.id);
    toast(hasil.message || 'Petugas berhasil dihapus.');
    await muat();
  } catch (kesalahan) {
    await dialogPesan('Tidak dapat menghapus', kesalahan.message, 'error');
  }
}

const app = await initLayout({
  active: 'master-petugas',
  judul: 'Daftar Petugas',
  deskripsi: 'Tambah dan ubah data petugas.',
});

state.tahun = app.tahun;

document.addEventListener('tahun-berubah', async (event) => {
  state.tahun = Number(event.detail.tahun);
  await muat();
});

el('btn-tambah-petugas').addEventListener('click', () => bukaModal());
el('cari-petugas').addEventListener('input', () => {
  state.cari = el('cari-petugas').value;
  render();
});
el('form-petugas').addEventListener('submit', simpan);
el('tutup-modal-petugas').addEventListener('click', tutupModal);
el('batal-modal-petugas').addEventListener('click', tutupModal);

const modal = el('modal-petugas');
modal.addEventListener('click', (event) => {
  const rect = modal.getBoundingClientRect();
  const diDalam =
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom;
  if (!diDalam) tutupModal();
});
modal.addEventListener('cancel', (event) => {
  event.preventDefault();
  tutupModal();
});

el('tbody-petugas').addEventListener('click', (event) => {
  const tombol = event.target.closest('button[data-aksi]');
  if (!tombol) return;
  const id = Number(tombol.dataset.id);
  const row = state.data.find((baris) => Number(baris.id) === id);
  if (!row) return;
  if (tombol.dataset.aksi === 'ubah') bukaModal(row);
  else if (tombol.dataset.aksi === 'hapus') hapus(row);
});

await muat();
