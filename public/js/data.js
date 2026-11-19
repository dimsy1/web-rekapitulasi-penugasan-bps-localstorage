import { initLayout, toast, konfirmasiHapus, dialogPesan, setTahunGlobal, bacaTahunAktif } from './layout.js';
import { escapeHtml, formatAngka, formatRupiah } from './format.js';
import {
  bacaDataset,
  simpanDataset,
  simpanBackup,
  normalisasiDataset,
  kosongkanData,
  ukuranData,
} from './store/penyimpanan.js';
import { eksporDataset, eksporTemplate, imporFileExcel, ringkasanDataset } from './store/excel.js';

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
  el('error-list').innerHTML = '';
  el('import-summary').innerHTML = '';
  el('file-excel').value = '';
}

function renderPratinjau(hasil, namaFile) {
  const ringkasan = hasil.ringkasan;
  const valid = ringkasan.jumlahBaris;
  const dilewati = hasil.errors.length;
  const tahun = ringkasan.tahun.length ? ringkasan.tahun.join(', ') : '—';

  el('import-summary').innerHTML = `
    <div class="import-summary-head">
      <div>
        <strong>${escapeHtml(namaFile)}</strong>
        <span>Sheet: ${escapeHtml(hasil.sheet)}</span>
      </div>
      <span class="badge ${valid > 0 ? 'badge-ok' : 'badge-muted'}">${formatAngka(valid)} baris siap</span>
    </div>
    <dl class="import-facts">
      <div><dt>Petugas</dt><dd>${formatAngka(ringkasan.jumlahPetugas)}</dd></div>
      <div><dt>Jenis kegiatan</dt><dd>${formatAngka(ringkasan.jumlahJenis)}</dd></div>
      <div><dt>Tahun</dt><dd>${escapeHtml(tahun)}</dd></div>
      <div><dt>Total honor</dt><dd>${formatRupiah(ringkasan.totalHonor)}</dd></div>
      <div><dt>Baris dilewati</dt><dd>${formatAngka(dilewati)}</dd></div>
    </dl>`;

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

  const tombol = el('terapkan-impor');
  tombol.disabled = valid === 0;
  tombol.textContent =
    valid > 0 ? `Terapkan ${formatAngka(valid)} Baris` : 'Tidak ada baris untuk diterapkan';

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
    }
  } catch (kesalahan) {
    await dialogPesan('Gagal membaca Excel', kesalahan.message, 'error');
  } finally {
    setSibuk(false);
  }
}

async function terapkanImpor() {
  if (!state.hasil || state.sibuk) return;
  const valid = state.hasil.ringkasan.jumlahBaris;
  if (valid === 0) {
    toast('Tidak ada baris valid untuk diimpor.', 'error');
    return;
  }

  const lama = bacaDataset().penugasan.length;
  if (lama > 0) {
    const lanjut = await konfirmasiHapus({
      judul: 'Timpa semua data?',
      html: `<p style="margin:0 0 8px">Data saat ini <strong>${formatAngka(lama)} baris</strong>
        akan diganti dengan <strong>${formatAngka(valid)} baris</strong> dari
        <strong>${escapeHtml(state.fileNama)}</strong>.</p>
        <p style="margin:0">Backup data lama dibuat otomatis dan bisa dipulihkan dari bagian Pemulihan.</p>`,
      teksTombol: 'Ya, timpa data',
    });
    if (!lanjut) return;
  }

  const backupBerhasil = simpanBackup(bacaDataset());
  try {
    simpanDataset(state.hasil.data);
    const tahunTerbaru = state.hasil.ringkasan.tahun[0];
    if (tahunTerbaru) setTahunGlobal(tahunTerbaru);
    toast(
      `Impor berhasil: ${formatAngka(valid)} baris, ${formatAngka(
        state.hasil.errors.length
      )} baris dilewati.`
    );
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
  if (data.penugasan.length === 0) {
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
  if (data.penugasan.length === 0) {
    toast('Belum ada data untuk diekspor.', 'info');
    return;
  }

  const tombol = el('btn-ekspor-template');
  if (tombol.disabled) return;

  const isiAsli = tombol.innerHTML;
  tombol.disabled = true;
  tombol.textContent = 'Menyiapkan file…';

  try {
    await eksporTemplate(data, { tahun: bacaTahunAktif() });
    toast('File sesuai template berhasil diunduh.');
  } catch (kesalahan) {
    await dialogPesan('Gagal mengekspor template', kesalahan.message, 'error');
  } finally {
    tombol.disabled = false;
    tombol.innerHTML = isiAsli;
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

    if (data.penugasan.length === 0) {
      throw new Error('File backup tidak berisi data penugasan.');
    }

    const lama = bacaDataset().penugasan.length;
    const lanjut = await konfirmasiHapus({
      judul: 'Pulihkan backup?',
      html: `<p style="margin:0 0 8px">Data saat ini <strong>${formatAngka(lama)} baris</strong>
        akan diganti dengan <strong>${formatAngka(data.penugasan.length)} baris</strong>
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
  const jumlah = bacaDataset().penugasan.length;
  if (jumlah === 0) {
    toast('Data sudah kosong.', 'info');
    return;
  }

  const lanjut = await konfirmasiHapus({
    judul: 'Kosongkan semua data?',
    html: `<p style="margin:0 0 8px">Seluruh <strong>${formatAngka(jumlah)} baris</strong>
      penugasan, daftar petugas, dan jenis kegiatan akan dihapus dari browser ini.</p>
      <p style="margin:0">Backup otomatis dibuat, tetapi sebaiknya unduh file Excel atau backup JSON
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
  deskripsi: 'Impor, ekspor, dan cadangkan data penugasan yang tersimpan di browser.',
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
el('btn-ekspor').addEventListener('click', ekspor);
el('btn-ekspor-template').addEventListener('click', eksporDenganTemplate);
el('btn-backup').addEventListener('click', unduhBackup);
el('btn-pulihkan').addEventListener('click', () => el('file-backup').click());
el('file-backup').addEventListener('change', () => {
  const file = el('file-backup').files?.[0];
  if (file) pulihkanBackup(file);
});
el('btn-reset').addEventListener('click', kosongkan);

window.addEventListener('data-berubah', perbaruiStatistik);
document.addEventListener('tahun-berubah', perbaruiStatistik);

perbaruiStatistik();
