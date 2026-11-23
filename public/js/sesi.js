/**
 * Sesi login. Token disimpan server (cookie HttpOnly), jadi JavaScript tidak
 * pernah memegang token. Pemeriksaan sesi dilakukan lewat API.
 */

import { api } from './api.js';

const KUNCI_TUJUAN = 'dashboard-honor-tujuan-login';
const HALAMAN_LOGIN = '/login.html';

const HALAMAN_APLIKASI = new Set([
  '/',
  '/index',
  '/penugasan',
  '/rekap-bulanan',
  '/rekap-jenis',
  '/petugas',
  '/master-jenis',
  '/data',
]);

let admin = null;

export function tujuanLogin() {
  try {
    const tujuan = sessionStorage.getItem(KUNCI_TUJUAN);
    if (tujuan && tujuan !== '/.html' && HALAMAN_APLIKASI.has(tujuan.replace(/\.html$/, ''))) {
      return tujuan;
    }
  } catch {
    // Dashboard menjadi tujuan bila penyimpanan sesi tidak tersedia.
  }
  return '/';
}

export function adminAktif() {
  return admin;
}

/** True bila server menyatakan sesi masih berlaku. */
export async function sesiAktif() {
  try {
    const sesi = await api.getSesi();
    if (sesi?.masuk) {
      admin = sesi.admin;
      return true;
    }
  } catch {
    /* diperlakukan sebagai belum masuk */
  }
  return false;
}

/** Periksa sesi ke server; arahkan ke halaman login bila belum masuk. */
export async function periksaSesi() {
  try {
    const sesi = await api.getSesi();
    if (sesi?.masuk) {
      admin = sesi.admin;
      return true;
    }
  } catch {
    // Jaringan bermasalah: biarkan halaman login menampilkan pesan.
  }

  document.body.hidden = true;
  try {
    sessionStorage.setItem(KUNCI_TUJUAN, location.pathname);
  } catch {
    // Halaman login tetap bisa ditampilkan.
  }
  location.replace(HALAMAN_LOGIN);
  return false;
}

/** Masuk memakai username + password. Melempar ApiError bila gagal. */
export async function masuk(nama, sandi) {
  const hasil = await api.login(nama, sandi);
  admin = hasil?.admin || null;
  try {
    sessionStorage.removeItem(KUNCI_TUJUAN);
  } catch {
    /* abaikan */
  }
  return true;
}

export async function keluar() {
  try {
    await api.logout();
  } catch {
    /* tetap lanjut ke halaman login */
  }
  admin = null;
  document.body.hidden = true;
  location.replace(HALAMAN_LOGIN);
}
