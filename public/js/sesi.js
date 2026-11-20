const KUNCI_SESI = 'dashboard-honor-v2-sesi';
const KUNCI_TUJUAN = 'dashboard-honor-v2-tujuan-login';
const HALAMAN_LOGIN = '/login.html';
const PENGGUNA = 'Ampuh3519';
const SANDI_SHA256 = '995066a4e033dafffb757ea2f85ab2576e5b759651472f38485cfb1e410ff79c';

const HALAMAN_APLIKASI = new Set([
  '/', '/index', '/penugasan', '/rekap-bulanan', '/rekap-jenis',
  '/petugas', '/master-jenis', '/data',
]);

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

export function sesiAktif() {
  try {
    return sessionStorage.getItem(KUNCI_SESI) === PENGGUNA;
  } catch {
    return false;
  }
}

/** Pemeriksaan lokal untuk akses melalui antarmuka situs statis. */
export async function masuk(nama, sandi) {
  if (nama.trim() !== PENGGUNA) return false;
  if (!globalThis.crypto?.subtle) throw new Error('Buka situs melalui HTTPS atau localhost untuk masuk.');
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sandi));
  const hex = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
  if (hex !== SANDI_SHA256) return false;

  sessionStorage.setItem(KUNCI_SESI, PENGGUNA);
  return true;
}

export function periksaSesi() {
  if (sesiAktif()) return true;
  document.body.hidden = true;
  try {
    sessionStorage.setItem(KUNCI_TUJUAN, location.pathname);
  } catch {
    // Halaman login tetap bisa menampilkan pesan saat penyimpanan diblokir.
  }
  location.replace(HALAMAN_LOGIN);
  return false;
}

export function keluar() {
  sessionStorage.removeItem(KUNCI_SESI);
  sessionStorage.removeItem(KUNCI_TUJUAN);
  document.body.hidden = true;
  location.replace(HALAMAN_LOGIN);
}
