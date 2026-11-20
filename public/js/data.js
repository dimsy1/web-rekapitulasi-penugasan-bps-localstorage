import { initLayout, toast, konfirmasiHapus, dialogPesan, setTahunGlobal, bacaTahunAktif } from './layout.js';
import { escapeHtml, formatAngka, formatRupiah } from './format.js';
import {
  bacaDataset,
  simpanDataset,
  simpanBackup,
  normalisasiDataset,
  kosongkanData,
  ukuranData,
  simpanTemplate,
  bacaTemplate,
} from './store/penyimpanan.js';
import {
  eksporDataset,
  eksporTemplate,
  imporFileExcel,
  ringkasanDataset,
  unduhTemplateKosong,
} from './store/excel.js';

const el = (id) => document.getElementById(id);

const state = {
  hasil: null,
  fileNama: '',
  sibuk: false,
};

function formatTanggal(iso) {
  if (!iso) return 'Belum ada data';
  const tanggal = new Date(iso);
  if (Number.isNaN(tanggal.getTime())) return '—';
  return tanggal.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

function perbaruiStatistik() {
  const data = bacaDataset();
  const ringkasan = ringkasanDataset(data);

  el('stat-baris').textContent = formatAngka(ringkasan.jumlahBaris);
  el('stat-petugas').textContent = formatAngka(ringkasan.jumlahPetugas);
  el('stat-jenis').textContent = formatAngka(ringkasan.jumlahJenis);
  el('stat-honor').textContent = formatRupiah(ringkasan.totalHonor);
  el('stat-tahun').textContent = ringkasan.tahun.length
    ? ringkasan.tahun.join(', ')
    : '—';
  el('stat-diperbarui').textContent = formatTanggal(data.diperbarui);

  const ukuran = ukuranData();
  el('status-ukuran').textContent =
    ukuran < 1024 ? `${ukuran} B` : `${(ukuran / 1024).toFixed(1)} KB`;

  const template = bacaTemplate();
  const infoTemplate = el('template-aktif');
  if (infoTemplate) {
    infoTemplate.textContent = template
      ? `Cetakan: ${template.nama} (diimpor ${
          template.disimpan ? formatTanggal(template.disimpan) : 'sebelumnya'
        }).`
      : 'Cetakan: template bawaan aplikasi (100 baris petugas, 300 baris penugasan).';
  }
}

function setSibuk(aktif) {
  state.sibuk = aktif;
  el('impor-loading').hidden = !aktif;
  el('dropzone').classList.toggle('is-busy', aktif);
  el('dropzone').setAttribute('aria-busy', aktif ? 'true' : 'false');
}

function resetPratinjau() {
  state.hasil = null;
  state.fileNama = '';
  el('import-preview').hidden = true;
  el('import-errors').hidden = true;
  el('import-warnings').hidden = true;
  el('import-warnings').innerHTML = '';
  el('error-list').innerHTML = '';
  el('import-summary').innerHTML = '';
  el('file-excel').value = '';
}

function renderPratinjau(hasil, namaFile) {
  const ringkasan = hasil.ringkasan;
  const valid = ringkasan.jumlahBaris;
  const dilewati = hasil.errors.length;
  const tahun = ringkasan.tahun.length ? ringkasan.tahun.join(', ') : '—';
  const petugasRekap = Number(ringkasan.jumlahPetugasRekap) || 0;
  const kapasitas = Number(ringkasan.kapasitasPetugas) || 0;
  const kapasitasJenis = Number(ringkasan.kapasitasJenis) || 0;
  const adaPetugas = Number(ringkasan.jumlahPetugas) > 0;
  const adaJenis = Number(ringkasan.jumlahJenis) > 0;

  const labelSiap =
    valid > 0
      ? `${formatAngka(valid)} baris siap`
      : adaPetugas || adaJenis
        ? 'Tanpa baris penugasan'
        : 'Tidak ada data';

  el('import-summary').innerHTML = `
    <div class="import-summary-head">
      <div>
        <strong>${escapeHtml(namaFile)}</strong>
        <span>Sheet: ${escapeHtml(hasil.sheet)}${
          petugasRekap > 0
            ? ` · ${formatAngka(petugasRekap)} nama petugas terbaca dari kolom A sheet rekap`
            : ''
        }</span>
      </div>
      <span class="badge ${valid > 0 ? 'badge-ok' : 'badge-muted'}">${labelSiap}</span>
    </div>
    <dl class="import-facts">
      <div><dt>Petugas</dt><dd>${formatAngka(ringkasan.jumlahPetugas)}${
        kapasitas > 0 ? ` / ${formatAngka(kapasitas)}` : ''
      }</dd></div>
      <div><dt>Jenis kegiatan</dt><dd>${formatAngka(ringkasan.jumlahJenis)}${
        kapasitasJenis > 0 ? ` / ${formatAngka(kapasitasJenis)}` : ''
      }</dd></div>
      <div><dt>Tahun analisis (B3)</dt><dd>${
        ringkasan.tahunAnalisis ? formatAngka(ringkasan.tahunAnalisis) : '—'
      }</dd></div>
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
            <span>${escapeHtml(baris.masalah.join(' '))}</span>
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

  // Impor tetap boleh walau belum ada penugasan, asalkan file memuat data master
  // (petugas dan/atau jenis kegiatan). Alur kerja: isi nama petugas atau daftar
  // jenis di Excel dulu, penugasan menyusul di web.
  const bolehTerapkan = valid > 0 || adaPetugas || adaJenis;

  let labelTombol = 'Tidak ada data untuk diterapkan';
  if (valid > 0) labelTombol = `Terapkan ${formatAngka(valid)} Baris`;
  else if (adaPetugas && adaJenis) labelTombol = 'Terapkan Petugas & Jenis';
  else if (adaPetugas) labelTombol = 'Terapkan Daftar Petugas';
  else if (adaJenis) labelTombol = 'Terapkan Daftar Jenis';

  const tombol = el('terapkan-impor');
  tombol.disabled = !bolehTerapkan;
  tombol.textContent = labelTombol;

  el('import-preview').hidden = false;
}

async function pilihFile(file) {
  if (!file || state.sibuk) return;
  if (!/\.xlsx$/i.test(file.name)) {
    await dialogPesan(
      'Format tidak didukung',
      'Pilih file berformat .xlsx. File .xls atau .csv belum didukung.',
      'error'
    );
    return;
  }

  resetPratinjau();
  setSibuk(true);

  try {
    const hasil = await imporFileExcel(file);
    state.hasil = hasil;
    state.fileNama = file.name;
    renderPratinjau(hasil, file.name);
    if (hasil.errors.length > 0) {
      toast(
        `${formatAngka(hasil.errors.length)} baris dilewati karena datanya tidak valid.`,
        'info'
      );
    } else if (Number(hasil.ringkasan.jumlahBelumLengkap) > 0) {
      toast(
        `${formatAngka(hasil.ringkasan.jumlahBelumLengkap)} baris belum lengkap dan tetap akan diimpor.`,
        'info'
      );
    }
  } catch (kesalahan) {
    await dialogPesan('Gagal membaca Excel', kesalahan.message, 'error');
  } finally {
    setSibuk(false);
  }
}

async function terapkanImpor() {
  if (!state.hasil || state.sibuk) return;
  const ringkasan = state.hasil.ringkasan;
  const valid = ringkasan.jumlahBaris;
  const adaMaster = ringkasan.jumlahPetugas > 0 || ringkasan.jumlahJenis > 0;
  if (valid === 0 && !adaMaster) {
    toast('Tidak ada data yang bisa diimpor dari file ini.', 'error');
    return;
  }

  const lama = bacaDataset().penugasan.length;
  const lanjut = await konfirmasiHapus({
    judul: 'Timpa semua data?',
    html: `<p style="margin:0 0 8px">Data saat ini <strong>${formatAngka(lama)} baris</strong>
      akan diganti dengan <strong>${formatAngka(valid)} baris penugasan</strong>,
      <strong>${formatAngka(ringkasan.jumlahPetugas)} petugas</strong>, dan
      <strong>${formatAngka(ringkasan.jumlahJenis)} jenis kegiatan</strong> dari
      <strong>${escapeHtml(state.fileNama)}</strong>.</p>
      <p style="margin:0">Data lama dicadangkan otomatis di browser ini sebelum ditimpa.</p>`,
    teksTombol: 'Ya, timpa data',
  });
  if (!lanjut) return;

  const backupBerhasil = simpanBackup(bacaDataset());
  try {
    simpanDataset(state.hasil.data);

    // Simpan file impor sebagai cetakan ekspor berikutnya.
    let catatanTemplate = '';
    if (state.hasil.template) {
      try {
        simpanTemplate({
          nama: state.hasil.template.nama,
          base64: state.hasil.template.base64,
          bytes: state.hasil.template.bytes,
          disimpan: new Date().toISOString(),
        });
      } catch (kesalahan) {
        catatanTemplate = kesalahan.message;
      }
    }

    const tahunTerbaru = state.hasil.ringkasan.tahunAnalisis || state.hasil.ringkasan.tahun[0];
    if (tahunTerbaru) setTahunGlobal(tahunTerbaru);

    toast(
      `Impor berhasil: ${formatAngka(valid)} baris, ${formatAngka(
        ringkasan.jumlahPetugas
      )} petugas, ${formatAngka(ringkasan.jumlahJenis)} jenis, ${formatAngka(
        state.hasil.errors.length
      )} baris dilewati.`
    );
    if (Number(ringkasan.jumlahBelumLengkap) > 0) {
      toast(
        `${formatAngka(ringkasan.jumlahBelumLengkap)} baris belum lengkap. Buka Daftar Penugasan lalu pilih filter "Belum lengkap" untuk melengkapinya.`,
        'info'
      );
    }
    if (catatanTemplate) toast(catatanTemplate, 'error');
    resetPratinjau();
    perbaruiStatistik();
    if (!backupBerhasil) {
      toast('Backup otomatis gagal dibuat. Ekspor data lama segera bila masih diperlukan.', 'error');
    }
  } catch (kesalahan) {
    await dialogPesan('Gagal menyimpan data', kesalahan.message, 'error');
  }
}

async function ekspor() {
  const data = bacaDataset();
  if (data.penugasan.length === 0 && data.petugas.length === 0) {
    toast('Belum ada data untuk diekspor.', 'info');
    return;
  }
  try {
    await eksporDataset(data);
    toast('File Excel berhasil diunduh.');
  } catch (kesalahan) {
    await dialogPesan('Gagal mengekspor', kesalahan.message, 'error');
  }
}

async function eksporDenganTemplate() {
  const data = bacaDataset();
  if (data.penugasan.length === 0 && data.petugas.length === 0) {
    toast('Belum ada data untuk diekspor.', 'info');
    return;
  }

  const tombol = el('btn-ekspor-template');
  if (tombol.disabled) return;

  const isiAsli = tombol.innerHTML;
  tombol.disabled = true;
  tombol.textContent = 'Menyiapkan file…';

  try {
    const template = bacaTemplate();
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

function namaBackup() {
  const tanggal = new Date();
  const cap = [
    tanggal.getFullYear(),
    String(tanggal.getMonth() + 1).padStart(2, '0'),
    String(tanggal.getDate()).padStart(2, '0'),
  ].join('-');
  return `backup-dashboard-honor-${cap}.json`;
}

function unduhBackup() {
  const payload = {
    aplikasi: 'dashboard-honor-petugas-lokal',
    versi: 1,
    diekspor: new Date().toISOString(),
    data: bacaDataset(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const tautan = document.createElement('a');
  tautan.href = url;
  tautan.download = namaBackup();
  document.body.appendChild(tautan);
  tautan.click();
  tautan.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('Backup JSON berhasil diunduh.');
}

async function pulihkanBackup(file) {
  if (!file) return;
  try {
    const teks = await file.text();
    const mentah = JSON.parse(teks);
    const sumber = mentah && typeof mentah === 'object' && mentah.data ? mentah.data : mentah;
    const data = normalisasiDataset(sumber);

    if (data.penugasan.length === 0 && data.petugas.length === 0) {
      throw new Error('File backup tidak berisi data petugas maupun penugasan.');
    }

    const lama = bacaDataset().penugasan.length;
    const lanjut = await konfirmasiHapus({
      judul: 'Pulihkan backup?',
      html: `<p style="margin:0 0 8px">Data saat ini <strong>${formatAngka(lama)} baris</strong>
        akan diganti dengan <strong>${formatAngka(data.penugasan.length)} baris</strong> dan
        <strong>${formatAngka(data.petugas.length)} petugas</strong>
        dari file <strong>${escapeHtml(file.name)}</strong>.</p>
        <p style="margin:0">Backup data saat ini dibuat otomatis.</p>`,
      teksTombol: 'Ya, pulihkan',
    });
    if (!lanjut) return;

    simpanBackup(bacaDataset());
    simpanDataset(data);

    const tahun = [...new Set(data.penugasan.map((baris) => Number(baris.tahun)))].sort(
      (a, b) => b - a
    );
    if (tahun[0]) setTahunGlobal(tahun[0]);

    perbaruiStatistik();
    toast(`Backup dipulihkan: ${formatAngka(data.penugasan.length)} baris.`);
  } catch (kesalahan) {
    await dialogPesan('Gagal memulihkan backup', kesalahan.message, 'error');
  } finally {
    el('file-backup').value = '';
  }
}

async function kosongkan() {
  const data = bacaDataset();
  const jumlah = data.penugasan.length;
  if (jumlah === 0 && data.petugas.length === 0) {
    toast('Data sudah kosong.', 'info');
    return;
  }

  const lanjut = await konfirmasiHapus({
    judul: 'Kosongkan semua data?',
    html: `<p style="margin:0 0 8px">Seluruh <strong>${formatAngka(jumlah)} baris</strong>
      penugasan, <strong>${formatAngka(data.petugas.length)} petugas</strong>, dan
      <strong>${formatAngka(data.jenis.length)} jenis kegiatan</strong> akan dihapus dari
      browser ini.</p>
      <p style="margin:0">Data lama dicadangkan otomatis, tetapi sebaiknya unduh file Excel
      terlebih dahulu.</p>`,
    teksTombol: 'Ya, kosongkan',
  });
  if (!lanjut) return;

  kosongkanData();
  setTahunGlobal(new Date().getFullYear());
  perbaruiStatistik();
  toast('Data berhasil dikosongkan. Backup otomatis tersimpan di browser.');
}

/* -------------------------------------------------------------------------
   Bootstrap
   ------------------------------------------------------------------------- */
await initLayout({
  active: 'data',
  judul: 'Data & Excel',
  deskripsi: 'Impor dan ekspor data penugasan yang tersimpan di browser.',
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
  const file = inputFile.files?.[0];
  if (file) pilihFile(file);
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
  const file = event.dataTransfer?.files?.[0];
  if (file) pilihFile(file);
});

el('batal-impor').addEventListener('click', resetPratinjau);
el('terapkan-impor').addEventListener('click', terapkanImpor);
// Dinonaktifkan: tombol "Ekspor data saja" dan "Cadangan & pemulihan" disembunyikan
// dari halaman Data & Excel (lihat data.html). Pengguna hanya memakai ekspor Excel
// sesuai template. Fungsinya masih ada di bawah bila ingin diaktifkan kembali.
// el('btn-ekspor').addEventListener('click', ekspor);
el('btn-ekspor-template').addEventListener('click', eksporDenganTemplate);
el('btn-template-kosong').addEventListener('click', unduhTemplate);
// el('btn-backup').addEventListener('click', unduhBackup);
// el('btn-pulihkan').addEventListener('click', () => el('file-backup').click());
// el('file-backup').addEventListener('change', () => {
//   const file = el('file-backup').files?.[0];
//   if (file) pulihkanBackup(file);
// });
el('btn-reset').addEventListener('click', kosongkan);

window.addEventListener('data-berubah', perbaruiStatistik);
document.addEventListener('tahun-berubah', perbaruiStatistik);

perbaruiStatistik();
