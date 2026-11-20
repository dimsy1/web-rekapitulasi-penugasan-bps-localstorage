import { api } from './api.js';
import { escapeHtml } from './format.js';
import { keluar, periksaSesi } from './sesi.js';
import { pantauPerubahanLintasTab } from './store/penyimpanan.js';

const IKON = {
  dashboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.6"/><rect x="14" y="3" width="7" height="7" rx="1.6"/><rect x="3" y="14" width="7" height="7" rx="1.6"/><rect x="14" y="14" width="7" height="7" rx="1.6"/></svg>`,
  penugasan: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5h6"/><path d="M9 3h6a1 1 0 0 1 1 1v2H8V4a1 1 0 0 1 1-1Z"/><rect x="4" y="5" width="16" height="16" rx="2.5"/><path d="M8 11h8M8 15h5"/></svg>`,
  bulanan: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M8 3v4M16 3v4M3 10h18"/><path d="M7.5 14h2M12 14h2M16.5 14h.5M7.5 17.5h2M12 17.5h2"/></svg>`,
  jenis: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 1 0 9 9h-9V3Z"/><path d="M15 3.6A9 9 0 0 1 20.4 9H15V3.6Z"/></svg>`,
  master: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M4 12h16M4 17h10"/><circle cx="19" cy="17" r="2.5"/></svg>`,
  petugas: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0"/><path d="M16 9.5a3 3 0 1 1 0 6"/><path d="M16.5 15.2a5.5 5.5 0 0 1 4 4.3"/></svg>`,
  data: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v10"/><path d="m8 9 4 4 4-4"/><path d="M4 15v4.5h16V15"/><path d="M7 19.5h10"/></svg>`,
  menu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`,
  chevron: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
  sukses: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.5 12.2 2.3 2.3 4.7-4.8"/></svg>`,
  error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/></svg>`,
  info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5h.01"/></svg>`,
};

const NAV = [
  { kunci: 'dashboard', href: '/', label: 'Dashboard', ikon: IKON.dashboard },
  { kunci: 'penugasan', href: '/penugasan.html', label: 'Daftar Penugasan', ikon: IKON.penugasan },
  { kunci: 'rekap-bulanan', href: '/rekap-bulanan.html', label: 'Rekap per Bulan', ikon: IKON.bulanan },
  { kunci: 'rekap-jenis', href: '/rekap-jenis.html', label: 'Rekap per Jenis Kegiatan', ikon: IKON.jenis },
  { kunci: 'master-petugas', href: '/petugas.html', label: 'Daftar Petugas', ikon: IKON.petugas },
  { kunci: 'master-jenis', href: '/master-jenis.html', label: 'Daftar Jenis Kegiatan', ikon: IKON.master },
  { kunci: 'data', href: '/data.html', label: 'Data & Excel', ikon: IKON.data },
];

const KUNCI_TAHUN = 'tahunAktif';

export function bacaTahunAktif() {
  const sekarang = new Date().getFullYear();
  try {
    const tersimpan = Number(localStorage.getItem(KUNCI_TAHUN));
    if (Number.isInteger(tersimpan) && tersimpan >= 2020) return tersimpan;
  } catch {
    /* localStorage tidak tersedia */
  }
  return sekarang;
}

function simpanTahun(tahun) {
  try {
    localStorage.setItem(KUNCI_TAHUN, String(tahun));
  } catch {
    /* abaikan bila localStorage diblokir */
  }
}

function renderSidebar(aktif) {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  const menu = NAV.map(
    (item) => `
      <a class="nav-item${item.kunci === aktif ? ' active' : ''}" href="${item.href}"
         ${item.kunci === aktif ? 'aria-current="page"' : ''}>
        ${item.ikon}<span>${item.label}</span>
      </a>`
  ).join('');

  sidebar.innerHTML = `
    <div class="sidebar-brand">
      <div class="brand-mark" aria-hidden="true">BPS</div>
      <div class="brand-text">
        <strong>Dashboard Honor</strong>
        <span>Penugasan Petugas</span>
      </div>
    </div>
    <nav class="sidebar-nav" aria-label="Navigasi utama">
      <p class="nav-label">Menu</p>
      ${menu}
    </nav>
    <div class="sidebar-foot">
      <div class="sidebar-year">
        <span>Tahun aktif</span>
        <strong id="sidebar-tahun">—</strong>
      </div>
      <p>BADAN PUSAT STATISTIK</p>
    </div>`;
}

function opsiTahun(meta, tahun) {
  const set = new Set((meta?.tahun_tersedia || []).map((nilai) => Number(nilai)));
  set.add(Number(tahun));
  set.add(new Date().getFullYear());
  return [...set]
    .filter((nilai) => Number.isInteger(nilai) && nilai >= 2020)
    .sort((a, b) => b - a);
}

function renderTopbar({ judul, deskripsi, tahun, daftarTahun }) {
  const topbar = document.getElementById('topbar');
  if (!topbar) return;

  const opsi = daftarTahun
    .map((nilai) => `<option value="${nilai}" ${nilai === tahun ? 'selected' : ''}>${nilai}</option>`)
    .join('');

  topbar.innerHTML = `
    <button type="button" class="icon-button menu-toggle" id="menu-toggle" aria-label="Buka menu" aria-expanded="false">
      ${IKON.menu}
    </button>
    <div class="topbar-title">
      <p class="eyebrow">Dashboard Rekapitulasi</p>
      <h1>${escapeHtml(judul)}</h1>
      <p class="topbar-subtitle">${escapeHtml(deskripsi || '')}</p>
    </div>
    <div class="topbar-actions">
      <span class="data-chip" title="Data hanya tersimpan di browser ini">
        <span class="data-chip-dot" aria-hidden="true"></span>Data lokal
      </span>
      <label class="year-picker" for="pilih-tahun">
        <span>Tahun</span>
        <select id="pilih-tahun" aria-label="Pilih tahun aktif">${opsi}</select>
      </label>
      <button type="button" class="btn btn-secondary" id="keluar">Keluar</button>
    </div>`;
}

function sinkronTahun(tahun) {
  const teks = document.getElementById('sidebar-tahun');
  if (teks) teks.textContent = String(tahun);
}

function pasangMenuMobile() {
  const tombol = document.getElementById('menu-toggle');
  const overlay = document.getElementById('mobile-overlay');
  const tutup = () => {
    document.body.classList.remove('menu-terbuka');
    if (overlay) overlay.hidden = true;
    if (tombol) tombol.setAttribute('aria-expanded', 'false');
  };
  const buka = () => {
    document.body.classList.add('menu-terbuka');
    if (overlay) overlay.hidden = false;
    if (tombol) tombol.setAttribute('aria-expanded', 'true');
  };

  if (tombol) {
    tombol.addEventListener('click', () => {
      if (document.body.classList.contains('menu-terbuka')) tutup();
      else buka();
    });
  }
  if (overlay) overlay.addEventListener('click', tutup);
  document.querySelectorAll('.nav-item').forEach((tautan) => tautan.addEventListener('click', tutup));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') tutup();
  });
}

/** Ubah tahun global: simpan, perbarui kontrol, lalu beri tahu halaman. */
export function setTahunGlobal(tahun) {
  const angka = Number(tahun);
  if (!Number.isInteger(angka) || angka < 2020) return;

  simpanTahun(angka);
  sinkronTahun(angka);

  const pilih = document.getElementById('pilih-tahun');
  if (pilih) {
    if (![...pilih.options].some((opsi) => Number(opsi.value) === angka)) {
      const opsi = document.createElement('option');
      opsi.value = String(angka);
      opsi.textContent = String(angka);
      pilih.prepend(opsi);
    }
    pilih.value = String(angka);
  }

  document.dispatchEvent(new CustomEvent('tahun-berubah', { detail: { tahun: angka } }));
}

export async function initLayout({ active, judul, deskripsi }) {
  if (!periksaSesi()) {
    // Hentikan bootstrap halaman sampai navigasi ke login selesai.
    return new Promise(() => {});
  }
  window.addEventListener('pageshow', periksaSesi);
  renderSidebar(active);
  const tahun = bacaTahunAktif();
  simpanTahun(tahun);

  let meta = null;
  let error = null;
  try {
    meta = await api.getMeta(tahun);
  } catch (kesalahan) {
    error = kesalahan;
  }

  renderTopbar({
    judul,
    deskripsi,
    tahun,
    daftarTahun: opsiTahun(meta, tahun),
  });
  sinkronTahun(tahun);
  pasangMenuMobile();
  document.getElementById('keluar')?.addEventListener('click', keluar);
  document.body.hidden = false;

  pantauPerubahanLintasTab(() => {
    document.dispatchEvent(
      new CustomEvent('tahun-berubah', { detail: { tahun: bacaTahunAktif() } })
    );
    toast('Data diperbarui dari tab lain.', 'info');
  });

  const pilih = document.getElementById('pilih-tahun');
  if (pilih) {
    pilih.addEventListener('change', () => setTahunGlobal(Number(pilih.value)));
  }

  if (error) {
    toast(`Data awal gagal dimuat: ${error.message}`, 'error');
  }

  return { tahun, meta, error };
}

export function toast(pesan, tipe = 'sukses') {
  let wadah = document.getElementById('toast-stack');
  if (!wadah) {
    wadah = document.createElement('div');
    wadah.id = 'toast-stack';
    wadah.className = 'toast-stack';
    wadah.setAttribute('aria-live', 'polite');
    document.body.appendChild(wadah);
  }

  const item = document.createElement('div');
  item.className = `toast ${tipe}`;
  item.innerHTML = `${IKON[tipe] || IKON.info}<span></span>`;
  item.querySelector('span').textContent = pesan;
  wadah.appendChild(item);

  const durasi = tipe === 'error' ? 6000 : 3800;
  setTimeout(() => {
    item.classList.add('keluar');
    setTimeout(() => item.remove(), 220);
  }, durasi);
}

function tanpaHtml(teks) {
  const sementara = document.createElement('div');
  sementara.innerHTML = teks;
  return sementara.textContent || '';
}

export async function konfirmasiHapus({ judul, html, teksTombol = 'Ya, hapus' }) {
  if (window.Swal) {
    const hasil = await window.Swal.fire({
      title: judul,
      html,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: teksTombol,
      cancelButtonText: 'Batal',
      confirmButtonColor: '#cf3f3f',
      cancelButtonColor: '#64748b',
      reverseButtons: true,
      focusCancel: true,
    });
    return hasil.isConfirmed;
  }
  return window.confirm(`${judul}\n\n${tanpaHtml(html || '')}`);
}

export async function dialogPesan(judul, pesan, tipe = 'error') {
  if (window.Swal) {
    await window.Swal.fire({
      title: judul,
      text: pesan,
      icon: tipe,
      confirmButtonText: 'Mengerti',
      confirmButtonColor: '#1267b8',
    });
  } else {
    window.alert(`${judul}\n\n${pesan}`);
  }
}
