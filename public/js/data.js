import { initLayout, toast, konfirmasiHapus, dialogPesan, setTahunGlobal, bacaTahunAktif } from './layout.js';
import { escapeHtml, formatAngka, formatRupiah } from './format.js';
import { api } from './api.js';
import { adminAktif } from './sesi.js';
import {
  eksporTemplate,
  imporFileExcel,
  ringkasanDataset,
  unduhTemplateKosong,
} from './store/excel.js';

const el = (id) => document.getElementById(id);

const state = {
  hasil: null,
  sibuk: false,
  dataset: null,
  log: null,
};

function teksMode() {
  return api.getStatus?.().mode === 'lokal'
    ? 'Data tersimpan di browser ini (mode demo tanpa server).'
    : 'Data tersimpan di database. Gunakan fitur impor untuk memasukkan data dari file Excel, dan ekspor untuk mengunduhnya kembali.';
}

async function perbaruiStatistik() {
  try {
    const data = await api.getDataset();
    state.dataset = data;
    const ringkasan = ringkasanDataset(data);

    el('stat-baris').textContent = formatAngka(ringkasan.jumlahBaris);
    el('stat-petugas').textContent = formatAngka(ringkasan.jumlahPetugas);
    el('stat-jenis').textContent = formatAngka(ringkasan.jumlahJenis);
    el('stat-honor').textContent = formatRupiah(ringkasan.totalHonor);

    const template = await api.getTemplateInfo();
    const infoTemplate = el('template-aktif');
    if (infoTemplate) {
      if (template?.nama) {
        const ukuran = template.bytes
          ? ` · ${formatAngka(Math.max(1, Math.round(template.bytes / 1024)))} KB`
          : '';
        infoTemplate.textContent = `Template aktif: ${template.nama}${ukuran}`;
      } else {
        infoTemplate.textContent = 'Belum ada template tersimpan. Template bawaan akan dipakai.';
      }
    }

    const intro = el('data-mode');
    if (intro) intro.textContent = teksMode();
    renderAdmin();
  } catch (kesalahan) {
    toast(`Data gagal dimuat: ${kesalahan.message}`, 'error');
  }
}

function renderAdmin() {
  const admin = adminAktif();
  const nama = el('admin-nama');
  if (nama) nama.textContent = admin?.username ? `@${admin.username}` : 'Mode lokal';
}

function setSibuk(aktif, membaca = false) {
  state.sibuk = aktif;
  el('impor-loading').hidden = !membaca;
  el('impor-loading').querySelector('p').textContent = membaca
    ? 'Membaca file Excel…'
    : 'Menyimpan ke database…';
  el('batal-impor').disabled = aktif;
  el('terapkan-impor').disabled = aktif || !state.hasil?.sumber.length;
  el('dropzone').classList.toggle('is-busy', aktif);
  el('dropzone').setAttribute('aria-busy', aktif ? 'true' : 'false');
}

function resetPratinjau() {
  state.hasil = null;
  el('import-preview').hidden = true;
  el('import-errors').hidden = true;
  el('import-warnings').hidden = true;
  el('import-warnings').innerHTML = '';
  el('error-list').innerHTML = '';
  el('import-summary').innerHTML = '';
  el('file-excel').value = '';
}

function renderPratinjau(hasil) {
  const ringkasan = hasil.ringkasan;
  const valid = ringkasan.jumlahBaris;
  const dilewati = hasil.errors.length;
  const tahun = ringkasan.tahun.length ? ringkasan.tahun.join(', ') : '—';
  const labelSiap = hasil.sumber.length ? `${formatAngka(valid)} baris siap` : 'Tidak ada data';

  el('import-summary').innerHTML = `
    <div class="import-summary-head">
      <div>
        <strong>${formatAngka(hasil.sumber.length)} dari ${formatAngka(hasil.jumlahFile)} file siap diimpor</strong>
        ${hasil.sumber.map(({ nama, ringkasan: info }) => `<span>${escapeHtml(nama)} · ${formatAngka(info.jumlahBaris)} baris${
          info.tahunAnalisis ? ` · Tahun B3 ${info.tahunAnalisis}` : ''
        }</span>`).join('')}
      </div>
      <span class="badge ${valid > 0 ? 'badge-ok' : 'badge-muted'}">${labelSiap}</span>
    </div>
    <dl class="import-facts">
      <div><dt>Petugas terbaca</dt><dd>${formatAngka(ringkasan.jumlahPetugas)}</dd></div>
      <div><dt>Jenis kegiatan terbaca</dt><dd>${formatAngka(ringkasan.jumlahJenis)}</dd></div>
      <div><dt>Tahun penugasan</dt><dd>${escapeHtml(tahun)}</dd></div>
      <div><dt>Total honor</dt><dd>${formatRupiah(ringkasan.totalHonor)}</dd></div>
      <div><dt>Belum lengkap</dt><dd>${
        Number(ringkasan.jumlahBelumLengkap) > 0
          ? `${formatAngka(ringkasan.jumlahBelumLengkap)} baris`
          : '—'
      }</dd></div>
      <div><dt>Baris dilewati</dt><dd>${formatAngka(dilewati)}</dd></div>
    </dl>`;

  if (hasil.peringatan && hasil.peringatan.length > 0) {
    el('import-warnings').innerHTML = `
      <h4>Perlu diperhatikan</h4>
      <ul>${hasil.peringatan.map((pesan) => `<li>${escapeHtml(pesan)}</li>`).join('')}</ul>`;
    el('import-warnings').hidden = false;
  } else {
    el('import-warnings').hidden = true;
    el('import-warnings').innerHTML = '';
  }

  if (dilewati > 0) {
    const tampil = hasil.errors.slice(0, 80);
    el('error-list').innerHTML = tampil
      .map(
        (baris) => `
          <div class="error-row">
            <span class="error-row-no">Baris ${baris.baris}</span>
            <span><strong>${escapeHtml(baris.nama)}.</strong> ${escapeHtml(baris.masalah.join(' '))}</span>
          </div>`
      )
      .join('');
    if (dilewati > tampil.length) {
      el('error-list').innerHTML += `
        <p class="error-more">…dan ${formatAngka(dilewati - tampil.length)} baris bermasalah lainnya.</p>`;
    }
    el('import-errors').hidden = false;
  } else {
    el('import-errors').hidden = true;
  }

  el('import-preview').hidden = false;
}

async function pilihFile(daftarFile) {
  const files = Array.from(daftarFile || []);
  if (!files.length || state.sibuk) return;
  resetPratinjau();
  setSibuk(true, true);

  try {
    const hasil = { sumber: [], errors: [], peringatan: [], template: null, jumlahFile: files.length };
    for (const file of files) {
      try {
        if (!/\.xlsx$/i.test(file.name)) throw new Error('Pilih file berformat .xlsx.');
        const impor = await imporFileExcel(file);
        for (const baris of impor.errors) hasil.errors.push({ ...baris, nama: file.name });
        for (const pesan of impor.peringatan) hasil.peringatan.push(`${file.name}: ${pesan}`);
        if (!impor.data.petugas.length && !impor.data.jenis.length && !impor.data.penugasan.length) {
          hasil.peringatan.push(`${file.name}: Tidak ada data yang bisa digabungkan.`);
          continue;
        }
        const { data, ringkasan } = impor;
        hasil.sumber.push({ nama: file.name, data, ringkasan });
        if (impor.template) hasil.template = { file: impor.template, ringkasan };
      } catch (kesalahan) {
        hasil.peringatan.push(`${file.name}: ${kesalahan.message}`);
      }
    }

    const dataImpor = hasil.sumber.map(({ data }) => data);
    hasil.ringkasan = ringkasanDataset(gabungkanRingkas(dataImpor));

    state.hasil = hasil;
    renderPratinjau(hasil);
  } catch (kesalahan) {
    await dialogPesan('Gagal membaca Excel', kesalahan.message, 'error');
  } finally {
    setSibuk(false);
  }
}

/** Gabungan ringan khusus pratinjau (tanpa menyentuh data tersimpan). */
function gabungkanRingkas(daftar) {
  const petugas = [];
  const jenis = [];
  const penugasan = [];

  for (const data of daftar) {
    const petaPetugas = new Map();
    for (const baris of data.petugas || []) {
      const kunci = String(baris.nama).trim().toLowerCase();
      if (!kunci) continue;
      let baru = petugas.find((item) => item.nama.toLowerCase() === kunci);
      if (!baru) {
        baru = { id: petugas.length + 1, nama: baris.nama, urutan: petugas.length + 1 };
        petugas.push(baru);
      }
      petaPetugas.set(Number(baris.id), baru.id);
    }

    const petaJenis = new Map();
    for (const baris of data.jenis || []) {
      const kunci = String(baris.nama).trim().toLowerCase();
      if (!kunci) continue;
      let baru = jenis.find((item) => item.nama.toLowerCase() === kunci);
      if (!baru) {
        baru = { id: jenis.length + 1, nama: baris.nama, urutan: jenis.length + 1 };
        jenis.push(baru);
      }
      petaJenis.set(Number(baris.id), baru.id);
    }

    for (const baris of data.penugasan || []) {
      penugasan.push({
        id: penugasan.length + 1,
        petugas_id: petaPetugas.get(Number(baris.petugas_id)) || null,
        jenis_kegiatan_id: petaJenis.get(Number(baris.jenis_kegiatan_id)) || null,
        nama_pekerjaan: baris.nama_pekerjaan || '',
        bulan: baris.bulan,
        tahun: baris.tahun,
        honor: baris.honor,
      });
    }
  }

  return { versi: 3, petugas, jenis, penugasan };
}

async function terapkanImpor() {
  const hasil = state.hasil;
  if (!hasil?.sumber.length || state.sibuk) return;

  const jumlahBaris = hasil.ringkasan.jumlahBaris;
  if (jumlahBaris === 0) {
    toast('Tidak ada baris valid untuk diimpor.', 'info');
    return;
  }

  setSibuk(true, true);
  try {
    const tahunAnalisis = hasil.sumber
      .map(({ ringkasan }) => ringkasan.tahunAnalisis)
      .reverse()
      .find(Boolean);

    const { jumlah } = await api.impor(
      hasil.sumber.map(({ data }) => data),
      { tahunAnalisis }
    );

    let catatanTemplate = '';
    if (hasil.template) {
      try {
        await api.simpanTemplate({
          ...hasil.template.file,
          disimpan: new Date().toISOString(),
        });
      } catch (kesalahan) {
        catatanTemplate =
          'Cetakan ekspor baru gagal disimpan. Aplikasi memakai cetakan sebelumnya jika tersedia.';
      }
    }

    const dataBaru = await api.getDataset();
    const tahunGabungan = ringkasanDataset(dataBaru).tahun;
    const tahunAktif = bacaTahunAktif();
    const tahunImpor = tahunGabungan.includes(tahunAnalisis)
      ? tahunAnalisis
      : hasil.ringkasan.tahun[0] ?? tahunGabungan[0] ?? tahunAnalisis;
    if (tahunImpor && !tahunGabungan.includes(tahunAktif)) setTahunGlobal(tahunImpor);

    toast(
      `Impor berhasil. Ditambahkan ${formatAngka(jumlah.penugasan)} penugasan, ${formatAngka(
        jumlah.petugas
      )} petugas baru, dan ${formatAngka(jumlah.jenis)} jenis baru.`
    );
    if (hasil.ringkasan.jumlahBelumLengkap > 0) {
      toast(
        `${formatAngka(hasil.ringkasan.jumlahBelumLengkap)} baris belum lengkap. Buka Daftar Penugasan lalu pilih filter "Belum lengkap" untuk melengkapinya.`,
        'info'
      );
    }
    if (catatanTemplate) toast(catatanTemplate, 'error');
    resetPratinjau();
    await perbaruiStatistik();
    state.log = null;
    if (!el('log-panel').hidden) await muatLog();
  } catch (kesalahan) {
    await dialogPesan('Gagal menyimpan data', kesalahan.message, 'error');
  } finally {
    setSibuk(false);
  }
}

async function eksporDenganTemplate() {
  const tombol = el('btn-ekspor-template');
  if (tombol.disabled) return;

  const isiAsli = tombol.innerHTML;
  tombol.disabled = true;
  tombol.textContent = 'Menyiapkan file…';

  try {
    const data = await api.getDataset();
    if (data.penugasan.length === 0 && data.petugas.length === 0) {
      toast('Belum ada data untuk diekspor.', 'info');
      return;
    }
    const template = await api.ambilTemplate();
    await eksporTemplate(data, {
      tahun: bacaTahunAktif(),
      templateBase64: template?.base64,
    });
    toast('File sesuai template berhasil diunduh.');
  } catch (kesalahan) {
    await dialogPesan('Gagal mengekspor template', kesalahan.message, 'error');
  } finally {
    tombol.disabled = false;
    tombol.innerHTML = isiAsli;
  }
}

async function unduhTemplate() {
  const tombol = el('btn-template-kosong');
  if (tombol.disabled) return;
  const isiAsli = tombol.textContent;
  tombol.disabled = true;
  tombol.textContent = 'Menyiapkan file…';
  try {
    await unduhTemplateKosong();
    toast('Template kosong berhasil diunduh. Isi nama petugas di kolom A sheet rekap.');
  } catch (kesalahan) {
    await dialogPesan('Gagal mengunduh template', kesalahan.message, 'error');
  } finally {
    tombol.disabled = false;
    tombol.textContent = isiAsli;
  }
}

async function muatLog() {
  const panel = el('log-panel');
  const daftar = el('log-list');
  if (!panel || !daftar) return;

  panel.hidden = false;
  daftar.innerHTML = '<p class="data-copy">Memuat log…</p>';

  if (api.getStatus?.().mode === 'lokal') {
    daftar.innerHTML = '<p class="data-copy">Mode lokal tidak mencatat log aktivitas.</p>';
    return;
  }

  try {
    const log = await api.getLog();
    state.log = log;
    if (!log.length) {
      daftar.innerHTML = '<p class="data-copy">Belum ada aktivitas tercatat.</p>';
      return;
    }
    daftar.innerHTML = `
      <ul class="log-list">
        ${log
          .map(
            (baris) => `
          <li>
            <span class="log-waktu">${escapeHtml(String(baris.waktu || '').replace('T', ' '))}</span>
            <span class="log-aksi">${escapeHtml(baris.aksi || '-')}</span>
            <span class="log-isi">${escapeHtml(baris.ringkasan || baris.target || '')}</span>
            <span class="log-admin">${escapeHtml(baris.admin_nama || '-')}</span>
          </li>`
          )
          .join('')}
      </ul>`;
  } catch (kesalahan) {
    daftar.innerHTML = `<p class="data-copy">Log gagal dimuat: ${escapeHtml(kesalahan.message)}</p>`;
  }
}

async function kosongkan() {
  try {
    const data = await api.getDataset();
    const jumlah = data.penugasan.length;
    if (jumlah === 0 && data.petugas.length === 0 && data.jenis.length === 0) {
      toast('Data sudah kosong.', 'info');
      return;
    }

    const lanjut = await konfirmasiHapus({
      judul: 'Kosongkan semua data?',
      html: `<p style="margin:0 0 8px">Seluruh <strong>${formatAngka(jumlah)} baris</strong>
        penugasan, <strong>${formatAngka(data.petugas.length)} petugas</strong>, dan
        <strong>${formatAngka(data.jenis.length)} jenis kegiatan</strong> akan dihapus dari
        database.</p>
        <p style="margin:0">Tindakan ini tidak bisa dibatalkan. Sebaiknya unduh file Excel
        terlebih dahulu.</p>`,
      teksTombol: 'Ya, kosongkan',
    });
    if (!lanjut) return;

    await api.reset();
    setTahunGlobal(new Date().getFullYear());
    await perbaruiStatistik();
    state.log = null;
    if (!el('log-panel').hidden) await muatLog();
    toast('Semua data berhasil dikosongkan.');
  } catch (kesalahan) {
    await dialogPesan('Gagal mengosongkan data', kesalahan.message, 'error');
  }
}

/* -------------------------------------------------------------------------
   Bootstrap
   ------------------------------------------------------------------------- */
await initLayout({
  active: 'data',
  judul: 'Data & Excel',
  deskripsi: 'Impor dan unduh data Excel.',
});

const dropzone = el('dropzone');
const inputFile = el('file-excel');

dropzone.addEventListener('click', () => {
  if (!state.sibuk) inputFile.click();
});
dropzone.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    if (!state.sibuk) inputFile.click();
  }
});

inputFile.addEventListener('change', () => {
  pilihFile(inputFile.files);
});

for (const namaEvent of ['dragenter', 'dragover']) {
  dropzone.addEventListener(namaEvent, (event) => {
    event.preventDefault();
    dropzone.classList.add('is-drag');
  });
}
for (const namaEvent of ['dragleave', 'dragend', 'drop']) {
  dropzone.addEventListener(namaEvent, (event) => {
    event.preventDefault();
    dropzone.classList.remove('is-drag');
  });
}
dropzone.addEventListener('drop', (event) => {
  pilihFile(event.dataTransfer?.files);
});

el('batal-impor').addEventListener('click', resetPratinjau);
el('terapkan-impor').addEventListener('click', terapkanImpor);
el('btn-ekspor-template').addEventListener('click', eksporDenganTemplate);
el('btn-template-kosong').addEventListener('click', unduhTemplate);
el('btn-reset').addEventListener('click', kosongkan);
el('btn-log')?.addEventListener('click', muatLog);

window.addEventListener('data-berubah', perbaruiStatistik);
document.addEventListener('tahun-berubah', perbaruiStatistik);

await perbaruiStatistik();
