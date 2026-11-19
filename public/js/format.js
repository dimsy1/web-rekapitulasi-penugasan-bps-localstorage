/**
 * Format angka & Rupiah terpusat.
 * Semua halaman memakai fungsi dari file ini.
 */

const rupiah = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

const angka = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const ringkas = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });

export function formatRupiah(nilai) {
  const n = Number(nilai);
  return rupiah.format(Number.isFinite(n) ? n : 0).replace(/\u00a0/g, ' ');
}

export function formatAngka(nilai) {
  const n = Number(nilai);
  return angka.format(Number.isFinite(n) ? n : 0);
}

/** Sel rekap: 0 ditampilkan sebagai tanda hubung. */
export function formatSel(nilai) {
  const n = Number(nilai);
  return Number.isFinite(n) && n !== 0 ? angka.format(n) : '-';
}

/** Angka ringkas untuk sumbu grafik (1.500.000 -> 1,5 jt). */
export function formatRingkas(nilai) {
  const n = Number(nilai) || 0;
  if (Math.abs(n) >= 1_000_000_000) return `${ringkas.format(n / 1_000_000_000)} M`;
  if (Math.abs(n) >= 1_000_000) return `${ringkas.format(n / 1_000_000)} jt`;
  if (Math.abs(n) >= 1_000) return `${ringkas.format(n / 1_000)} rb`;
  return angka.format(n);
}

/** Isi input honor dengan pemisah ribuan titik. */
export function formatInputHonor(nilai) {
  const n = Number(nilai);
  return Number.isFinite(n) && n > 0 ? angka.format(n) : nilai === 0 ? '0' : '';
}

/** Baca input honor; null bila bukan angka bulat >= 0. */
export function angkaDariInput(nilai) {
  const bersih = String(nilai ?? '').replace(/\./g, '').trim();
  if (!/^\d+$/.test(bersih)) return null;
  const n = Number(bersih);
  return Number.isSafeInteger(n) ? n : null;
}

export function escapeHtml(nilai) {
  return String(nilai ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Unduh CSV (pemisah titik koma agar ramah Excel locale Indonesia).
 * @param {string} namaFile
 * @param {string[]} header
 * @param {Array<Array<string|number>>} baris
 */
export function unduhCSV(namaFile, header, baris) {
  const sel = (nilai) => {
    const teks = String(nilai ?? '');
    return /[";\r\n]/.test(teks) ? `"${teks.replace(/"/g, '""')}"` : teks;
  };
  const isi = [header, ...baris].map((barisData) => barisData.map(sel).join(';')).join('\r\n');
  const blob = new Blob([`\ufeff${isi}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const tautan = document.createElement('a');
  tautan.href = url;
  tautan.download = namaFile;
  document.body.appendChild(tautan);
  tautan.click();
  tautan.remove();
  URL.revokeObjectURL(url);
}
