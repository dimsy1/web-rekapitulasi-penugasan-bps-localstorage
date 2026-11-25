import { api } from './api.js';
import { initLayout, toast, konfirmasiHapus, dialogPesan } from './layout.js';
import { angkaDariInput, escapeHtml, formatAngka, formatRupiah } from './format.js';

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
  document.querySelectorAll('#form-jenis .field').forEach((field) => field.classList.remove('has-error'));
  document.querySelectorAll('#daftar-posisi-form .posisi-form-row').forEach((row) => row.classList.remove('has-error'));
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

/* -------------------------------------------------------------------------
   Posisi petugas
   ------------------------------------------------------------------------- */
function posisiHtml(row) {
  const daftar = Array.isArray(row.posisi) ? row.posisi : [];
  if (daftar.length === 0) {
    return '<span class="cell-muted">Belum ada posisi</span>';
  }
  return `<div class="posisi-chips">${daftar
    .map(
      (posisi) => `<span class="posisi-chip">
        <span class="posisi-chip-nama">${escapeHtml(posisi.nama)}</span>
        <span class="posisi-chip-limit${posisi.limit_honor === null ? ' kosong' : ''}">${
          posisi.limit_honor === null ? 'Limit belum diatur' : formatRupiah(posisi.limit_honor)
        }</span>
      </span>`
    )
    .join('')}</div>`;
}

function barisPosisiHtml(item, indeks) {
  const pemakaian = Number(item.jumlah_pemakaian_total ?? item.jumlah_pemakaian ?? 0);
  const terkunci = item.id !== null && item.id !== undefined && item.bisa_dihapus === false;
  return `<div class="posisi-form-row" data-id="${item.id ?? ''}">
    <div class="posisi-form-main">
      <input type="text" class="f-posisi-nama" maxlength="100" autocomplete="off"
             placeholder="Nama posisi (mis. PPL)" aria-label="Nama posisi ${indeks + 1}"
             value="${escapeHtml(item.nama || '')}">
      <div class="input-prefix posisi-form-limit">
        <span>Rp</span>
        <input type="text" class="f-posisi-limit" inputmode="numeric" autocomplete="off"
               placeholder="0" aria-label="Limit honor posisi ${indeks + 1}"
               value="${
                 item.limit_honor === null || item.limit_honor === undefined
                   ? ''
                   : formatAngka(item.limit_honor)
               }">
      </div>
    </div>
    <div class="posisi-form-meta">
      ${pemakaian > 0 ? `<span class="usage-note">Dipakai ${formatAngka(pemakaian)} penugasan</span>` : ''}
      <button type="button" class="btn-icon danger" data-aksi="hapus-baris-posisi"
              title="${terkunci ? 'Posisi sudah dipakai penugasan' : 'Hapus posisi'}"
              aria-label="Hapus posisi" ${terkunci ? 'disabled' : ''}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4.8h6V7M6.5 7l.8 13h9.4l.8-13"/><path d="M10 11v5M14 11v5"/></svg>
      </button>
    </div>
  </div>`;
}

function renderPosisiForm(daftar = []) {
  const wadah = el('daftar-posisi-form');
  if (daftar.length === 0) {
    wadah.innerHTML =
      '<p class="posisi-kosong">Belum ada posisi. Tambahkan minimal satu posisi bila jenis ini akan dipakai pada penugasan.</p>';
    return;
  }
  wadah.innerHTML = daftar.map((item, indeks) => barisPosisiHtml(item, indeks)).join('');
}

function tambahBarisPosisi(item = { id: null, nama: '', limit_honor: null }) {
  const wadah = el('daftar-posisi-form');
  if (wadah.querySelector('.posisi-kosong')) wadah.innerHTML = '';
  const indeks = wadah.querySelectorAll('.posisi-form-row').length;
  wadah.insertAdjacentHTML('beforeend', barisPosisiHtml(item, indeks));
  wadah.lastElementChild?.querySelector('.f-posisi-nama')?.focus();
}

function render() {
  const tbody = el('tbody-jenis');
  const kueri = state.cari.trim().toLowerCase();
  const tampil = kueri
    ? state.data.filter(
        (row) =>
          row.nama.toLowerCase().includes(kueri) ||
          (row.posisi || []).some((posisi) => posisi.nama.toLowerCase().includes(kueri))
      )
    : state.data;

  el('jumlah-jenis').textContent = kueri
    ? `${tampil.length} dari ${state.data.length} jenis`
    : `${state.data.length} jenis`;

  if (tampil.length === 0) {
    const pesan =
      state.data.length === 0
        ? 'Belum ada jenis kegiatan. Impor file Excel di halaman Data & Excel, atau tambahkan jenis di sini.'
        : 'Tidak ada jenis kegiatan yang cocok dengan pencarian.';
    tbody.innerHTML = `<tr><td colspan="4"><div class="dt-empty">${pesan}</div></td></tr>`;
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
        <td>${posisiHtml(row)}</td>
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
  state.editVersi = row ? Number(row.versi) || 0 : 0;
  el('judul-modal-jenis').textContent = row ? 'Ubah Jenis Kegiatan' : 'Tambah Jenis Kegiatan';
  el('simpan-jenis').textContent = row ? 'Simpan Perubahan' : 'Simpan';

  el('f-nama-jenis').value = row?.nama || '';

  el('tahun-limit').textContent = String(state.tahun);
  const daftarPosisi = (Array.isArray(row?.posisi) ? row.posisi : []).map((posisi) => ({
    id: posisi.id,
    nama: posisi.nama,
    limit_honor: posisi.limit_honor,
    jumlah_pemakaian: posisi.jumlah_pemakaian,
    jumlah_pemakaian_total: posisi.jumlah_pemakaian_total,
    bisa_dihapus: posisi.bisa_dihapus,
  }));
  if (!row) daftarPosisi.push({ id: null, nama: '', limit_honor: null });
  renderPosisiForm(daftarPosisi);

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

/** Baca baris posisi dari formulir; kembalikan daftar + pesan kesalahan pertama. */
function bacaPosisiForm() {
  const baris = [...document.querySelectorAll('#daftar-posisi-form .posisi-form-row')];
  const daftar = [];
  const namaTerpakai = new Set();

  for (const row of baris) {
    const nama = row.querySelector('.f-posisi-nama').value.trim();
    const limitMentah = row.querySelector('.f-posisi-limit').value.trim();
    const idMentah = row.dataset.id;
    const id = idMentah ? Number(idMentah) : null;

    // Baris yang benar-benar kosong (mis. baris tambahan yang tidak diisi) diabaikan.
    if (!nama && !limitMentah) continue;

    if (!nama) {
      row.classList.add('has-error');
      return { daftar, error: 'Nama posisi petugas wajib diisi.' };
    }
    if (nama.length > 100) {
      row.classList.add('has-error');
      return { daftar, error: 'Nama posisi petugas maksimal 100 karakter.' };
    }
    const kunci = nama.toLowerCase();
    if (namaTerpakai.has(kunci)) {
      row.classList.add('has-error');
      return {
        daftar,
        error: 'Nama posisi petugas tidak boleh sama dalam satu jenis kegiatan.',
      };
    }
    namaTerpakai.add(kunci);

    if (!limitMentah) {
      row.classList.add('has-error');
      return {
        daftar,
        error: `Limit honor posisi “${nama}” tahun ${state.tahun} wajib diisi.`,
      };
    }
    const limit = angkaDariInput(limitMentah);
    if (limit === null) {
      row.classList.add('has-error');
      return { daftar, error: `Limit honor posisi “${nama}” belum valid.` };
    }

    daftar.push({ id, nama, limit_honor: limit });
  }

  return { daftar, error: '' };
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

  const { daftar, error } = bacaPosisiForm();
  if (error) {
    errorField('posisi', error);
    valid = false;
  } else if (daftar.length === 0) {
    errorField('posisi', 'Tambahkan minimal satu posisi petugas.');
    valid = false;
  }

  if (!valid) return null;
  return { nama, tahun: state.tahun, posisi: daftar };
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
    const payloadUbah =
      state.editId !== null && state.editVersi > 0
        ? { ...payload, versi: state.editVersi }
        : payload;
    const hasil =
      state.editId !== null
        ? await api.ubahJenisKegiatan(state.editId, payloadUbah)
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
  deskripsi: 'Tambah dan ubah jenis kegiatan.',
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
el('btn-tambah-posisi').addEventListener('click', () => tambahBarisPosisi());

el('daftar-posisi-form').addEventListener('click', (event) => {
  const tombol = event.target.closest('button[data-aksi="hapus-baris-posisi"]');
  if (!tombol || tombol.disabled) return;
  const wadah = el('daftar-posisi-form');
  tombol.closest('.posisi-form-row')?.remove();
  if (!wadah.querySelector('.posisi-form-row')) {
    wadah.innerHTML =
      '<p class="posisi-kosong">Belum ada posisi. Tambahkan minimal satu posisi untuk jenis kegiatan ini.</p>';
  }
});

el('daftar-posisi-form').addEventListener('input', (event) => {
  const baris = event.target.closest('.posisi-form-row');
  if (baris) baris.classList.remove('has-error');

  if (event.target.classList.contains('f-posisi-limit')) {
    const digit = event.target.value.replace(/\D/g, '');
    event.target.value = digit ? formatAngka(Number(digit)) : '';
  }
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
