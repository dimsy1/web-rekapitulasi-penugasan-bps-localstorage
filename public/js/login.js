import { masuk, sesiAktif, tujuanLogin } from './sesi.js';

const tujuan = tujuanLogin();
const form = document.getElementById('form-login');
const nama = document.getElementById('nama-pengguna');
const sandi = document.getElementById('kata-sandi');
const tombol = document.getElementById('masuk');
const pesan = document.getElementById('pesan-login');

async function periksa() {
  if (!(await sesiAktif())) {
    tombol.disabled = false;
    return;
  }
  location.replace(tujuan);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (tombol.disabled) return;
  tombol.disabled = true;
  pesan.hidden = true;

  try {
    if (await masuk(nama.value, sandi.value)) {
      location.replace(tujuan);
      return;
    }
    pesan.textContent = 'Username atau password salah.';
  } catch (error) {
    pesan.textContent =
      error?.status === 429
        ? error.message
        : error?.status === 0
          ? 'Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.'
          : error?.message || 'Gagal masuk.';
  }

  pesan.hidden = false;
  sandi.value = '';
  sandi.focus();
  tombol.disabled = false;
});

periksa().catch(() => {
  tombol.disabled = false;
});
