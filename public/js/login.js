import { masuk, sesiAktif, tujuanLogin } from './sesi.js';

const tujuan = tujuanLogin();
const form = document.getElementById('form-login');
const nama = document.getElementById('nama-pengguna');
const sandi = document.getElementById('kata-sandi');
const tombol = document.getElementById('masuk');
const pesan = document.getElementById('pesan-login');

if (sesiAktif()) {
  location.replace(tujuan);
} else {
  tombol.disabled = false;
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
      pesan.textContent = error.name === 'SecurityError'
        ? 'Browser tidak mengizinkan penyimpanan sesi.'
        : error.message;
    }

    pesan.hidden = false;
    sandi.value = '';
    sandi.focus();
    tombol.disabled = false;
  });
}
