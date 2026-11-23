/**
 * Titik masuk data untuk halaman web.
 *
 * Produksi  : adapter server (PHP + MySQL) — default.
 * Mode lokal: `?mode=lokal` (disimpan di browser) untuk demo tanpa PHP
 *             dan untuk `npm test`.
 *
 * Semua metode adapter mengembalikan Promise kecuali adapter lokal yang
 * sinkron; halaman selalu memakai `await` sehingga keduanya kompatibel.
 */

import { lokal } from './store/lokal.js';
import { server } from './store/server.js';

export { ApiError } from './store/kesalahan.js';
export { hapusDataLokal, simpanBackup } from './store/penyimpanan.js';
import { hapusDataLokal } from './store/penyimpanan.js';

const KUNCI_MODE = 'dashboard-honor-mode';

function pilihMode() {
  // Uji Node (npm test) tidak punya DOM; pakai adapter lokal.
  if (globalThis.__MODE_LOKAL__ === true) return 'lokal';
  if (typeof document === 'undefined' || typeof window === 'undefined') return 'lokal';

  let paksa = null;
  try {
    paksa = new URLSearchParams(location.search).get('mode');
  } catch {
    paksa = null;
  }

  if (paksa === 'lokal' || paksa === 'server') {
    try {
      if (paksa === 'lokal') localStorage.setItem(KUNCI_MODE, 'lokal');
      else localStorage.removeItem(KUNCI_MODE);
    } catch {
      /* abaikan bila localStorage diblokir */
    }
    return paksa;
  }

  // Pada alamat lokal, npm run dev menjalankan PHP router + MySQL. Jangan
  // biarkan pilihan mode lokal lama mengalihkan aplikasi dari database.
  const alamatLokal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!alamatLokal) {
    try {
      if (localStorage.getItem(KUNCI_MODE) === 'lokal') return 'lokal';
    } catch {
      /* abaikan */
    }
  }

  return typeof fetch === 'function' ? 'server' : 'lokal';
}

export const modeAplikasi = pilihMode();

// Mode server hanya membaca MySQL. Bersihkan sisa data aplikasi dari mode
// lokal agar browser tidak menyimpan salinan dataset atau template lama.
if (modeAplikasi === 'server' && typeof window !== 'undefined') {
  hapusDataLokal();
}

export const api = modeAplikasi === 'server' ? server : lokal;
