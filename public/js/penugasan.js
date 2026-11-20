import { api } from './api.js';
import { initLayout, toast, konfirmasiHapus, setTahunGlobal } from './layout.js';
import { angkaDariInput, escapeHtml, formatAngka, formatInputHonor, formatRupiah, unduhCSV } from './format.js';
import { DAFTAR_BULAN, namaBulan } from './bulan.js';

const el = (id) => document.getElementById(id);

const state = {
  tahun: new Date().getFullYear(),
  meta: null,
  rows: [],
  table: null,
  mode: 'tambah',
  editId: null,
  cbPetugas: null,
  timerCari: null,
};

/* -------------------------------------------------------------------------
   Combobox searchable (hanya boleh memilih dari daftar)
   ------------------------------------------------------------------------- */
function labelOpsi(item) {
  return item.kode ? `(${item.kode}) ${item.nama}` : item.nama;
}

function buatCombobox({
  wrapper,
  input,
  hidden,
  list,
  toggle,
  pesanKosong = 'Tidak ada pilihan yang cocok.',
  idPrefix = 'cb',
  bolehBaru = false,
}) {
  let items = [];
  let terpilih = null;
  let aktif = -1;
  let hasil = [];

  function tutup() {
    list.hidden = true;
    wrapper.classList.remove('open');
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    aktif = -1;
  }

  function buka() {
    const nilai = terpilih && input.value === labelOpsi(terpilih) ? '' : input.value;
    render(nilai);
    list.hidden = false;
    wrapper.classList.add('open');
    input.setAttribute('aria-expanded', 'true');
    const indeks = terpilih ? hasil.findIndex((item) => Number(item.id) === Number(terpilih.id)) : -1;
    aktif = indeks >= 0 ? indeks : -1;
    tandaiAktif(false);
  }

  function render(filter = '') {
    const kunci = String(filter || '').trim().toLowerCase();
    hasil = items.filter((item) => {
      if (!kunci) return true;
      return `${item.kode || ''} ${item.nama}`.toLowerCase().includes(kunci);
    });

    if (hasil.length === 0) {
      list.innerHTML = `<li class="combobox-empty">${escapeHtml(pesanKosong)}</li>`;
      return;
    }

    list.innerHTML = hasil
      .map(
        (item, indeks) => `
          <li class="combobox-option" role="option" id="${idPrefix}-opt-${item.id}" data-indeks="${indeks}" data-id="${item.id}">
            ${item.kode ? `<span class="kode">${escapeHtml(item.kode)}</span>` : ''}
            <span>${escapeHtml(item.nama)}</span>
          </li>`
      )
      .join('');

    list.querySelectorAll('.combobox-option').forEach((opsi) => {
      opsi.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        const indeks = Number(opsi.dataset.indeks);
        pilih(hasil[indeks]);
      });
    });
  }

  function tandaiAktif(gulir = true) {
    list.querySelectorAll('.combobox-option').forEach((opsi) => {
      opsi.classList.toggle('aktif', Number(opsi.dataset.indeks) === aktif);
    });
    if (aktif >= 0) {
      const opsi = list.querySelector(`.combobox-option[data-indeks="${aktif}"]`);
      if (opsi) {
        input.setAttribute('aria-activedescendant', opsi.id);
        if (gulir) opsi.scrollIntoView({ block: 'nearest' });
      }
    }
  }

  function pilih(item) {
    if (!item) return;
    terpilih = item;
    hidden.value = String(item.id);
    input.value = labelOpsi(item);
    tutup();
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function setItems(daftar) {
    items = Array.isArray(daftar) ? daftar.slice() : [];
    if (terpilih) {
      const masihAda = items.find((item) => Number(item.id) === Number(terpilih.id));
      if (masihAda) terpilih = masihAda;
    }
  }

  function setValue(id, labelCadangan = '') {
    const item = items.find((baris) => Number(baris.id) === Number(id));
    if (item) {
      terpilih = item;
      hidden.value = String(item.id);
      input.value = labelOpsi(item);
    } else if (id) {
      terpilih = null;
      hidden.value = String(id);
      input.value = labelCadangan;
    } else {
      clear();
    }
  }

  function clear() {
    terpilih = null;
    hidden.value = '';
    input.value = '';
    tutup();
  }

  input.addEventListener('input', () => {
    terpilih = null;
    hidden.value = '';
    aktif = -1;
    if (list.hidden) buka();
    else render(input.value);
  });

  input.addEventListener('focus', () => {
    if (list.hidden) buka();
  });

  input.addEventListener('blur', () => {
    setTimeout(() => {
      tutup();
      if (!hidden.value && !bolehBaru) input.value = '';
    }, 120);
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (list.hidden) buka();
      if (hasil.length > 0) {
        aktif = Math.min(aktif + 1, hasil.length - 1);
        tandaiAktif();
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (list.hidden) buka();
      if (hasil.length > 0) {
        aktif = Math.max(aktif - 1, 0);
        tandaiAktif();
      }
    } else if (event.key === 'Enter') {
      if (!list.hidden && aktif >= 0 && hasil[aktif]) {
        event.preventDefault();
        pilih(hasil[aktif]);
      }
    } else if (event.key === 'Escape') {
      tutup();
    } else if (event.key === 'Tab') {
      tutup();
    }
  });

  toggle.addEventListener('click', () => {
    if (list.hidden) buka();
    else tutup();
  });

  return { setItems, setValue, clear, getValue: () => (hidden.value ? Number(hidden.value) : null) };
}

/* -------------------------------------------------------------------------
   Filter & select
   ------------------------------------------------------------------------- */
function isiFilterBulan() {
  const select = el('filter-bulan');
  select.innerHTML =
    '<option value="">Semua bulan</option>' +
    DAFTAR_BULAN.map((bulan) => `<option value="${bulan.angka}">${bulan.nama}</option>`).join('');
}

function isiFilterJenis() {
  const select = el('filter-jenis');
  const lama = select.value;
  const daftar = state.meta?.jenis_kegiatan || [];
  select.innerHTML =
    '<option value="">Semua jenis</option>' +
    daftar
      .map((jenis) => `<option value="${jenis.id}">${escapeHtml(jenis.nama)}</option>`)
      .join('');
  if ([...select.options].some((opsi) => opsi.value === lama)) select.value = lama;
}

function isiSelectJenis(idTerpilih = null, cadangan = '') {
  const select = el('f-jenis');
  const daftar = state.meta?.jenis_kegiatan || [];
  select.innerHTML =
    '<option value="">— Belum diisi —</option>' +
    daftar
      .map((jenis) => `<option value="${jenis.id}">${escapeHtml(jenis.nama)}</option>`)
      .join('');

  if (idTerpilih && !daftar.some((jenis) => Number(jenis.id) === Number(idTerpilih)) && cadangan) {
    const opsi = document.createElement('option');
    opsi.value = String(idTerpilih);
    opsi.textContent = cadangan;
    select.appendChild(opsi);
  }
  select.value = idTerpilih ? String(idTerpilih) : '';

  // Bila belum ada jenis (misalnya belum pernah impor Excel), tampilkan petunjuk.
  const hint = el('hint-jenis');
  if (hint) hint.hidden = daftar.length > 0;
}

function isiComboboxPetugas(idTerpilih = null, cadangan = '') {
  if (!state.cbPetugas) return;
  state.cbPetugas.setItems(state.meta?.petugas || []);
  if (idTerpilih) state.cbPetugas.setValue(idTerpilih, cadangan);
  else state.cbPetugas.clear();
}

function isiSaranPekerjaan() {
  const daftar = el('daftar-pekerjaan');
  if (!daftar) return;
  const saran = (state.meta?.nama_kegiatan || []).map((item) => item.nama);
  daftar.innerHTML = [...new Set(saran)]
    .sort((a, b) => a.localeCompare(b, 'id'))
    .map((nama) => `<option value="${escapeHtml(nama)}"></option>`)
    .join('');
}

/* -------------------------------------------------------------------------
   Validasi form
   ------------------------------------------------------------------------- */
function bersihkanError() {
  document.querySelectorAll('#form-penugasan .field').forEach((field) => field.classList.remove('has-error'));
  document.querySelectorAll('#form-penugasan .field-error').forEach((pesan) => {
    pesan.textContent = '';
  });
  const alert = el('alert-form');
  alert.classList.remove('show');
  alert.textContent = '';
}

function errorField(kunci, pesan) {
  const target = document.querySelector(`#form-penugasan .field-error[data-error="${kunci}"]`);
  if (!target) return false;
  target.textContent = pesan;
  target.closest('.field')?.classList.add('has-error');
  return true;
}

function tampilkanErrorServer(error) {
  let ada = false;
  if (error.errors && typeof error.errors === 'object') {
    for (const [kunci, pesan] of Object.entries(error.errors)) {
      const teks = Array.isArray(pesan) ? pesan[0] : String(pesan);
      if (errorField(kunci, teks)) ada = true;
    }
  }
  const alert = el('alert-form');
  alert.textContent = ada ? 'Periksa kembali isian yang ditandai merah.' : error.message;
  alert.classList.add('show');
  const pertama = document.querySelector(
    '#form-penugasan .field.has-error input:not([type="hidden"]), #form-penugasan .field.has-error select'
  );
  pertama?.focus();
}

function validasiForm() {
  bersihkanError();
  let valid = true;

  const petugasId = el('f-petugas-id').value;
  const petugasNama = el('f-petugas').value.trim();
  if (!petugasNama) {
    errorField('petugas_id', 'Nama petugas wajib diisi.');
    valid = false;
  } else if (petugasNama.length > 150) {
    errorField('petugas_id', 'Nama petugas maksimal 150 karakter.');
    valid = false;
  }

  // Jenis, pekerjaan, bulan, dan honor boleh kosong. Baris seperti itu tetap
  // disimpan dan ditandai "Belum lengkap" di tabel.
  const jenisMentah = el('f-jenis').value;
  const jenisId = jenisMentah ? Number(jenisMentah) : null;
  if (jenisMentah && (!Number.isInteger(jenisId) || jenisId <= 0)) {
    errorField('jenis_kegiatan_id', 'Jenis kegiatan tidak valid.');
    valid = false;
  }

  const namaPekerjaan = el('f-nama-pekerjaan').value.trim();
  if (namaPekerjaan.length > 255) {
    errorField('nama_pekerjaan', 'Nama pekerjaan/kegiatan maksimal 255 karakter.');
    valid = false;
  }

  const bulanMentah = el('f-bulan').value;
  const bulan = bulanMentah ? Number(bulanMentah) : null;
  if (bulanMentah && (!Number.isInteger(bulan) || bulan < 1 || bulan > 12)) {
    errorField('bulan', 'Bulan tidak valid.');
    valid = false;
  }

  const tahunMentah = el('f-tahun').value.trim();
  const tahun = Number(tahunMentah);
  if (!tahunMentah) {
    errorField('tahun', 'Tahun wajib diisi.');
    valid = false;
  } else if (!Number.isInteger(tahun) || tahun < 2020) {
    errorField('tahun', 'Tahun harus bilangan bulat minimal 2020.');
    valid = false;
  }

  const honorMentah = el('f-honor').value.trim();
  let honor = null;
  if (honorMentah !== '') {
    honor = angkaDariInput(honorMentah);
    if (honor === null || honor < 0) {
      errorField('honor', 'Honor harus berupa angka bulat minimal 0.');
      valid = false;
    }
  }

  if (!valid) {
    document
      .querySelector(
        '#form-penugasan .field.has-error input:not([type="hidden"]), #form-penugasan .field.has-error select'
      )
      ?.focus();
    return null;
  }

  const payload = {
    jenis_kegiatan_id: jenisId,
    nama_pekerjaan: namaPekerjaan,
    bulan,
    tahun,
    honor,
  };

  if (petugasId) payload.petugas_id = Number(petugasId);
  else payload.petugas_nama = petugasNama;

  return payload;
}

/* -------------------------------------------------------------------------
   Tabel
   ------------------------------------------------------------------------- */
function aksiHtml(row) {
  return `
    <div class="row-actions">
      <button type="button" class="btn-icon" data-aksi="ubah" data-id="${row.id}" title="Ubah penugasan" aria-label="Ubah penugasan">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m4 20 4.5-1 9.8-9.8a2.1 2.1 0 0 0-3-3L5.5 16 4 20Z"/><path d="m13.8 6.7 3 3"/></svg>
      </button>
      <button type="button" class="btn-icon danger" data-aksi="hapus" data-id="${row.id}" title="Hapus penugasan" aria-label="Hapus penugasan">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4.8h6V7M6.5 7l.8 13h9.4l.8-13"/><path d="M10 11v5M14 11v5"/></svg>
      </button>
    </div>`;
}

function badgeBelumDiisi() {
  return '<span class="badge badge-warn">Belum diisi</span>';
}

function jenisHtml(row) {
  return row.jenis_nama ? escapeHtml(row.jenis_nama) : badgeBelumDiisi();
}

function honorHtml(row) {
  return row.honor === null || row.honor === undefined
    ? badgeBelumDiisi()
    : formatRupiah(row.honor);
}

function statusHtml(row) {
  if (row.lengkap) return '<span class="badge badge-ok">Lengkap</span>';
  const rincian = Array.isArray(row.kosong_label) && row.kosong_label.length
    ? `Kosong: ${row.kosong_label.join(', ')}`
    : 'Ada kolom yang masih kosong';
  return `<span class="badge badge-warn" title="${escapeHtml(rincian)}">Belum lengkap</span>`;
}

function pekerjaanHtml(row) {
  if (!row.nama_pekerjaan) {
    return `<div class="pekerjaan-cell">${badgeBelumDiisi()}</div>`;
  }
  const kode = row.kode_kegiatan
    ? `<span class="kode">${escapeHtml(row.kode_kegiatan)}</span>`
    : '';
  return `
    <div class="pekerjaan-cell">
      <span class="nama" title="${escapeHtml(row.nama_pekerjaan)}">${escapeHtml(row.nama_pekerjaan)}</span>
      ${kode}
    </div>`;
}

function barisFallback(row, indeks) {
  return `<tr>
    <td>${indeks + 1}</td>
    <td><span class="cell-primary">${escapeHtml(row.nama_petugas)}</span></td>
    <td>${jenisHtml(row)}</td>
    <td>${pekerjaanHtml(row)}</td>
    <td>${namaBulan(row.bulan)}</td>
    <td>${row.tahun}</td>
    <td class="num">${honorHtml(row)}</td>
    <td>${statusHtml(row)}</td>
    <td>${aksiHtml(row)}</td>
  </tr>`;
}

function initTabel() {
  if (!window.jQuery || !window.jQuery.fn?.DataTable) {
    toast('Pustaka DataTables gagal dimuat. Tabel ditampilkan tanpa paging.', 'error');
    return;
  }

  state.table = window.jQuery('#tabel-penugasan').DataTable({
    data: [],
    columns: [
      {
        data: null,
        orderable: false,
        searchable: false,
        width: '56px',
        render: (data, type, row, meta) =>
          meta.row + 1 + Number(meta.settings?._iDisplayStart || 0),
      },
      {
        data: 'nama_petugas',
        render: (data) => `<span class="cell-primary">${escapeHtml(data)}</span>`,
      },
      {
        data: 'jenis_nama',
        render: (data, type, row) =>
          type === 'sort' || type === 'type' ? row.jenis_nama || '' : jenisHtml(row),
      },
      {
        data: null,
        render: (data, type, row) => pekerjaanHtml(row),
      },
      {
        data: 'bulan',
        render: (data, type, row) => {
          if (type === 'sort' || type === 'type') return Number(row.bulan) || 0;
          return namaBulan(row.bulan);
        },
      },
      { data: 'tahun' },
      {
        data: 'honor',
        className: 'num',
        render: (data, type, row) => {
          if (type === 'sort' || type === 'type') return Number(row.honor) || 0;
          return honorHtml(row);
        },
      },
      {
        data: 'lengkap',
        render: (data, type, row) => statusHtml(row),
      },
      {
        data: null,
        orderable: false,
        searchable: false,
        className: 'num',
        render: (data, type, row) => aksiHtml(row),
      },
    ],
    order: [],
    pageLength: 10,
    lengthMenu: [
      [10, 25, 50, -1],
      [10, 25, 50, 'Semua'],
    ],
    searching: false,
    autoWidth: false,
    language: {
      emptyTable:
        '<div class="dt-empty">Belum ada penugasan untuk filter ini.<br><span>Tambahkan data melalui tombol Tambah Penugasan, atau ubah filter status.</span></div>',
      zeroRecords:
        '<div class="dt-empty">Data tidak ditemukan.<br><span>Coba ubah kata kunci atau filter.</span></div>',
      info: 'Menampilkan _START_–_END_ dari _TOTAL_ data',
      infoEmpty: 'Tidak ada data',
      infoFiltered: '(difilter dari _MAX_ total data)',
      lengthMenu: 'Tampilkan _MENU_ data',
      paginate: {
        first: 'Pertama',
        previous: 'Sebelumnya',
        next: 'Berikutnya',
        last: 'Terakhir',
      },
    },
  });
}

function renderTabel() {
  if (state.table) {
    state.table.clear();
    state.table.rows.add(state.rows);
    state.table.draw();
    return;
  }
  const tbody = document.querySelector('#tabel-penugasan tbody');
  if (!tbody) return;
  tbody.innerHTML = state.rows.length
    ? state.rows.map(barisFallback).join('')
    : '<tr><td colspan="9"><div class="dt-empty">Belum ada penugasan untuk filter ini.</div></td></tr>';
}

function setMemuat(aktif) {
  document.querySelector('.table-card')?.classList.toggle('is-loading', aktif);
}

async function muat() {
  setMemuat(true);
  const status = el('filter-status').value;
  const params = {
    tahun: state.tahun,
    bulan: el('filter-bulan').value,
    jenis_id: el('filter-jenis').value,
    status,
    q: el('cari').value.trim(),
  };

  try {
    const hasil = await api.getPenugasan(params);
    state.rows = Array.isArray(hasil.data) ? hasil.data : [];
    const belum = Number(hasil.belum_lengkap) || 0;
    el('jumlah-data').textContent =
      !status && belum > 0
        ? `${state.rows.length} baris · ${belum} belum lengkap`
        : `${state.rows.length} baris`;
    el('badge-tahun').textContent = `Tahun ${state.tahun}`;
    renderTabel();
  } catch (kesalahan) {
    state.rows = [];
    el('jumlah-data').textContent = '0 baris';
    renderTabel();
    toast(`Gagal memuat penugasan: ${kesalahan.message}`, 'error');
  } finally {
    setMemuat(false);
  }
}

/* -------------------------------------------------------------------------
   Modal
   ------------------------------------------------------------------------- */
function bukaModal(row = null) {
  const modal = el('modal-penugasan');
  const form = el('form-penugasan');
  form.reset();
  bersihkanError();

  state.mode = row ? 'ubah' : 'tambah';
  state.editId = row ? Number(row.id) : null;

  el('judul-modal-penugasan').textContent = row ? 'Ubah Penugasan' : 'Tambah Penugasan';
  el('simpan-modal').textContent = row ? 'Simpan Perubahan' : 'Simpan Penugasan';

  isiComboboxPetugas(row?.petugas_id || null, row?.nama_petugas || '');
  isiSelectJenis(row?.jenis_kegiatan_id || null, row?.jenis_nama || '');

  const selectBulan = el('f-bulan');
  selectBulan.innerHTML =
    '<option value="">— Pilih bulan —</option>' +
    DAFTAR_BULAN.map((bulan) => `<option value="${bulan.angka}">${bulan.nama}</option>`).join('');
  selectBulan.value = row && row.bulan ? String(row.bulan) : '';

  el('f-nama-pekerjaan').value = row?.nama_pekerjaan || '';

  el('f-tahun').value = String(row?.tahun || state.tahun);
  el('f-honor').value = row ? formatInputHonor(row.honor) : '';

  modal.showModal();
  document.body.classList.add('modal-terbuka');

  setTimeout(() => {
    el('f-petugas').focus();
  }, 40);
}

function tutupModal() {
  const modal = el('modal-penugasan');
  if (modal.open) modal.close();
  document.body.classList.remove('modal-terbuka');
  bersihkanError();
}

async function segarkanMeta() {
  try {
    const meta = await api.getMeta(state.tahun);
    state.meta = meta;
    state.cbPetugas?.setItems(meta.petugas || []);
    isiSaranPekerjaan();
    isiFilterJenis();
  } catch {
    /* meta lama tetap dipakai */
  }
}

async function simpan(event) {
  event.preventDefault();
  const payload = validasiForm();
  if (!payload) return;

  const tombol = el('simpan-modal');
  const teksAsli = tombol.textContent;
  tombol.disabled = true;
  tombol.textContent = 'Menyimpan…';

  try {
    const hasil =
      state.mode === 'ubah'
        ? await api.ubahPenugasan(state.editId, payload)
        : await api.buatPenugasan(payload);

    const tahunBaru = Number(hasil.data?.tahun || payload.tahun);
    tutupModal();
    toast(hasil.message || 'Penugasan berhasil disimpan.');
    await segarkanMeta();

    if (tahunBaru !== state.tahun) {
      setTahunGlobal(tahunBaru);
    } else {
      await muat();
    }
  } catch (kesalahan) {
    tampilkanErrorServer(kesalahan);
  } finally {
    tombol.disabled = false;
    tombol.textContent = teksAsli;
  }
}

async function hapus(row) {
  const konfirmasi = await konfirmasiHapus({
    judul: 'Hapus penugasan?',
    html: `<p style="margin:0 0 6px">Data berikut akan dihapus permanen:</p>
      <p style="margin:0"><strong>${escapeHtml(row.nama_petugas)}</strong><br>
      ${escapeHtml(row.nama_pekerjaan || 'Pekerjaan belum diisi')} — ${namaBulan(row.bulan)} ${row.tahun}<br>
      ${row.honor === null || row.honor === undefined ? 'Honor belum diisi' : formatRupiah(row.honor)}</p>`,
  });
  if (!konfirmasi) return;

  try {
    const hasil = await api.hapusPenugasan(row.id);
    toast(hasil.message || 'Penugasan berhasil dihapus.');
    await muat();
  } catch (kesalahan) {
    toast(`Gagal menghapus penugasan: ${kesalahan.message}`, 'error');
  }
}

/*
function ekspor() {
  if (state.rows.length === 0) {
    toast('Tidak ada data untuk diekspor pada filter ini.', 'info');
    return;
  }

  const header = [
    'No',
    'Nama Petugas',
    'Jenis Kegiatan',
    'Nama Pekerjaan/Kegiatan',
    'Kode Kegiatan',
    'Bulan',
    'Tahun',
    'Honor',
  ];
  const baris = state.rows.map((row, indeks) => [
    indeks + 1,
    row.nama_petugas,
    row.jenis_nama,
    row.nama_pekerjaan,
    row.kode_kegiatan || '',
    namaBulan(row.bulan),
    row.tahun,
    row.honor,
  ]);

  unduhCSV(`penugasan-${state.tahun}.csv`, header, baris);
  toast('Data penugasan berhasil diekspor.', 'sukses');
}
*/

/* -------------------------------------------------------------------------
   Bootstrap halaman
   ------------------------------------------------------------------------- */
const app = await initLayout({
  active: 'penugasan',
  judul: 'Daftar Penugasan',
  deskripsi: 'Menambah, mengubah, dan menghapus data penugasan.',
});

state.tahun = app.tahun;
state.meta = app.meta;

if (!state.meta) {
  try {
    state.meta = await api.getMeta(state.tahun);
  } catch (kesalahan) {
    toast(`Data referensi gagal dimuat: ${kesalahan.message}`, 'error');
    el('btn-tambah').disabled = true;
  }
}

state.cbPetugas = buatCombobox({
  wrapper: el('cb-petugas'),
  input: el('f-petugas'),
  hidden: el('f-petugas-id'),
  list: el('cb-petugas-list'),
  toggle: el('cb-petugas-toggle'),
  pesanKosong: 'Tidak ada nama petugas yang cocok',
  idPrefix: 'cb-petugas',
  bolehBaru: true,
});
state.cbPetugas.setItems(state.meta?.petugas || []);

isiSaranPekerjaan();

isiFilterBulan();
isiFilterJenis();
isiComboboxPetugas();
isiSelectJenis();

initTabel();

el('cari').addEventListener('input', () => {
  clearTimeout(state.timerCari);
  state.timerCari = setTimeout(muat, 300);
});

el('filter-bulan').addEventListener('change', muat);
el('filter-jenis').addEventListener('change', muat);
el('filter-status').addEventListener('change', muat);
el('btn-tambah').addEventListener('click', () => bukaModal());
// el('btn-ekspor').addEventListener('click', ekspor);
el('form-penugasan').addEventListener('submit', simpan);
el('tutup-modal').addEventListener('click', tutupModal);
el('batal-modal').addEventListener('click', tutupModal);
el('f-petugas').addEventListener('change', () => {
  el('f-petugas').dispatchEvent(new Event('input'));
});
el('f-petugas').addEventListener('input', () => {
  const field = document.querySelector('#form-penugasan .field[data-field="petugas_id"]');
  if (field?.classList.contains('has-error')) {
    field.classList.remove('has-error');
    field.querySelector('.field-error').textContent = '';
  }
});
el('f-honor').addEventListener('input', () => {
  const digit = el('f-honor').value.replace(/\D/g, '');
  el('f-honor').value = digit ? formatAngka(Number(digit)) : '';
});

const modal = el('modal-penugasan');
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

document.querySelector('#tabel-penugasan tbody').addEventListener('click', (event) => {
  const tombol = event.target.closest('button[data-aksi]');
  if (!tombol) return;
  const id = Number(tombol.dataset.id);
  const row = state.rows.find((baris) => Number(baris.id) === id);
  if (!row) return;
  if (tombol.dataset.aksi === 'ubah') bukaModal(row);
  else if (tombol.dataset.aksi === 'hapus') hapus(row);
});

document.addEventListener('tahun-berubah', (event) => {
  state.tahun = event.detail.tahun;
  muat();
});

await muat();
