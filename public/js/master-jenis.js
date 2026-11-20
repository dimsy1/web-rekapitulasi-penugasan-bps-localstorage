import { api } from './api.js';
import { initLayout, toast, konfirmasiHapus, dialogPesan } from './layout.js';
import { escapeHtml } from './format.js';

const el = (id) => document.getElementById(id);

const state = {
  data: [],
  cari: '',
  editId: null,
  tahun: null,
  muatToken: 0,
};

function bersihkanError() {
  document.querySelectorAll('#form-jenis .field').forEach((field) => field.classList.remove('has-error'));
  document.querySelectorAll('#form-jenis .field-error').forEach((pesan) => {
    pesan.textContent = '';
  });
  const alert = el('alert-jenis');
  alert.classList.remove('show');
  alert.textContent = '';
}

function errorField(kunci, pesan) {
  const target = document.querySelector(`#form-jenis .field-error[data-error="${kunci}"]`);
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
  const alert = el('alert-jenis');
  alert.textContent = ada ? 'Periksa kembali isian yang ditandai merah.' : error.message;
  alert.classList.add('show');
}

function render() {
  const tbody = el('tbody-jenis');
  const kueri = state.cari.trim().toLowerCase();
  const tampil = kueri
    ? state.data.filter((row) => row.nama.toLowerCase().includes(kueri))
    : state.data;

  el('jumlah-jenis').textContent = kueri
    ? `${tampil.length} dari ${state.data.length} jenis`
    : `${state.data.length} jenis`;

  if (tampil.length === 0) {
    const pesan =
      state.data.length === 0
        ? 'Belum ada jenis kegiatan. Impor file Excel di halaman Data & Excel, atau tambahkan jenis di sini.'
        : 'Tidak ada jenis kegiatan yang cocok dengan pencarian.';
    tbody.innerHTML = `<tr><td colspan="3"><div class="dt-empty">${pesan}</div></td></tr>`;
    return;
  }

  tbody.innerHTML = tampil
    .map((row) => {
      const terkunci = !row.bisa_dihapus;
      const pemakaian = Number(row.jumlah_pemakaian) || 0;
      const totalPemakaian = Number(row.jumlah_pemakaian_total ?? row.jumlah_pemakaian) || 0;
      const tahunLain = Math.max(0, totalPemakaian - pemakaian);
      const aksi = terkunci
        ? `<span class="locked-note">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
               <rect x="5" y="10" width="14" height="10" rx="2.2"></rect>
               <path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10"></path>
             </svg>
             Tidak dapat dihapus
           </span>`
        : `<button type="button" class="btn-icon danger" data-aksi="hapus" data-id="${row.id}" title="Hapus jenis" aria-label="Hapus jenis ${escapeHtml(row.nama)}">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4.8h6V7M6.5 7l.8 13h9.4l.8-13"/><path d="M10 11v5M14 11v5"/></svg>
           </button>`;

      return `<tr>
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
            <button type="button" class="btn-icon" data-aksi="ubah" data-id="${row.id}" title="Ubah jenis" aria-label="Ubah jenis ${escapeHtml(row.nama)}">
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
    const data = await api.getJenisKegiatan(state.tahun);
    if (token !== state.muatToken) return;
    state.data = data;
    render();
  } catch (kesalahan) {
    if (token !== state.muatToken) return;
    state.data = [];
    render();
    toast(`Gagal memuat jenis kegiatan: ${kesalahan.message}`, 'error');
  }
}

function bukaModal(row = null) {
  const modal = el('modal-jenis');
  el('form-jenis').reset();
  bersihkanError();

  state.editId = row ? Number(row.id) : null;
  el('judul-modal-jenis').textContent = row ? 'Ubah Jenis Kegiatan' : 'Tambah Jenis Kegiatan';
  el('simpan-jenis').textContent = row ? 'Simpan Perubahan' : 'Simpan';

  el('f-nama-jenis').value = row?.nama || '';

  modal.showModal();
  document.body.classList.add('modal-terbuka');
  setTimeout(() => el('f-nama-jenis').focus(), 40);
}

function tutupModal() {
  const modal = el('modal-jenis');
  if (modal.open) modal.close();
  document.body.classList.remove('modal-terbuka');
  bersihkanError();
}

function validasi() {
  bersihkanError();
  let valid = true;
  const nama = el('f-nama-jenis').value.trim();

  if (!nama) {
    errorField('nama', 'Nama jenis kegiatan wajib diisi.');
    valid = false;
  } else if (nama.length > 100) {
    errorField('nama', 'Nama jenis kegiatan maksimal 100 karakter.');
    valid = false;
  }

  if (!valid) return null;
  return { nama };
}

async function simpan(event) {
  event.preventDefault();
  const payload = validasi();
  if (!payload) return;

  const tombol = el('simpan-jenis');
  const teksAsli = tombol.textContent;
  tombol.disabled = true;
  tombol.textContent = 'Menyimpan…';

  try {
    const hasil =
      state.editId !== null
        ? await api.ubahJenisKegiatan(state.editId, payload)
        : await api.buatJenisKegiatan(payload);

    tutupModal();
    toast(hasil.message || 'Jenis kegiatan berhasil disimpan.');
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
    judul: 'Hapus jenis kegiatan?',
    html: `<p style="margin:0"><strong>${escapeHtml(row.nama)}</strong> akan dihapus dari daftar jenis kegiatan.<br>
      Jenis yang sudah dipakai pada data penugasan tidak dapat dihapus.</p>`,
  });
  if (!konfirmasi) return;

  try {
    const hasil = await api.hapusJenisKegiatan(row.id);
    toast(hasil.message || 'Jenis kegiatan berhasil dihapus.');
    await muat();
  } catch (kesalahan) {
    await dialogPesan('Tidak dapat menghapus', kesalahan.message, 'error');
  }
}

const app = await initLayout({
  active: 'master-jenis',
  judul: 'Daftar Jenis Kegiatan',
  deskripsi: 'Kelola jenis kegiatan yang membentuk kolom pada rekap.',
});

state.tahun = app.tahun;

document.addEventListener('tahun-berubah', async (event) => {
  state.tahun = Number(event.detail.tahun);
  await muat();
});

el('btn-tambah-jenis').addEventListener('click', () => bukaModal());
el('cari-jenis').addEventListener('input', () => {
  state.cari = el('cari-jenis').value;
  render();
});
el('form-jenis').addEventListener('submit', simpan);
el('tutup-modal-jenis').addEventListener('click', tutupModal);
el('batal-modal-jenis').addEventListener('click', tutupModal);

const modal = el('modal-jenis');
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

el('tbody-jenis').addEventListener('click', (event) => {
  const tombol = event.target.closest('button[data-aksi]');
  if (!tombol) return;
  const id = Number(tombol.dataset.id);
  const row = state.data.find((baris) => Number(baris.id) === id);
  if (!row) return;
  if (tombol.dataset.aksi === 'ubah') bukaModal(row);
  else if (tombol.dataset.aksi === 'hapus') hapus(row);
});

await muat();
