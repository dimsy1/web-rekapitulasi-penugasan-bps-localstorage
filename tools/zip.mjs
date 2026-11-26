/**
 * Pembuat file ZIP kecil tanpa dependensi.
 *
 * Dipakai `tools/siap-hosting.mjs` agar paket hosting punya pemisah path `/`
 * (bukan `\` seperti hasil ZipFile .NET di Windows) sehingga bisa diekstrak
 * dengan benar di server Linux InfinityFree.
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const TABEL_CRC = (() => {
  const tabel = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let nilai = i;
    for (let bit = 0; bit < 8; bit += 1) {
      nilai = nilai & 1 ? 0xedb88320 ^ (nilai >>> 1) : nilai >>> 1;
    }
    tabel[i] = nilai >>> 0;
  }
  return tabel;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = TABEL_CRC[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Tanggal & jam format MS-DOS dari mtime berkas. */
function waktuDos(mtime) {
  const tanggal = new Date(mtime);
  const tahun = Math.max(1980, tanggal.getFullYear());
  return {
    jam: (tanggal.getHours() << 11) | (tanggal.getMinutes() << 5) | (tanggal.getSeconds() >> 1),
    tanggal: ((tahun - 1980) << 9) | ((tanggal.getMonth() + 1) << 5) | tanggal.getDate(),
  };
}

/** Mengumpulkan semua berkas di dalam folder sebagai path relatif ber-`/`. */
function daftarBerkas(folder, awal = folder, hasil = []) {
  for (const entri of fs.readdirSync(folder, { withFileTypes: true })) {
    const lengkap = path.join(folder, entri.name);
    if (entri.isDirectory()) {
      daftarBerkas(lengkap, awal, hasil);
    } else if (entri.isFile()) {
      hasil.push(path.relative(awal, lengkap).split(path.sep).join('/'));
    }
  }
  return hasil.sort();
}

/**
 * Membuat file zip dari isi sebuah folder.
 *
 * @param {string} folder Folder sumber; isinya menjadi akar zip.
 * @param {string} berkasZip Path file zip yang ditulis.
 * @returns {{jumlah: number, ukuran: number}}
 */
export function buatZip(folder, berkasZip) {
  const daftar = daftarBerkas(folder);
  const bagian = [];
  const pusat = [];
  let offset = 0;

  for (const relatif of daftar) {
    const lengkap = path.join(folder, relatif);
    const asli = fs.readFileSync(lengkap);
    const padat = zlib.deflateRawSync(asli, { level: 9 });
    // Simpan tanpa kompresi bila hasil kompresi justru lebih besar.
    const pakaiPadat = padat.length < asli.length;
    const isi = pakaiPadat ? padat : asli;
    const metode = pakaiPadat ? 8 : 0;
    const crc = crc32(asli);
    const nama = Buffer.from(relatif, 'utf8');
    const { jam, tanggal } = waktuDos(fs.statSync(lengkap).mtime);

    const lokal = Buffer.alloc(30);
    lokal.writeUInt32LE(0x04034b50, 0);
    lokal.writeUInt16LE(20, 4); // versi minimum
    lokal.writeUInt16LE(0x0800, 6); // nama berkas UTF-8
    lokal.writeUInt16LE(metode, 8);
    lokal.writeUInt16LE(jam, 10);
    lokal.writeUInt16LE(tanggal, 12);
    lokal.writeUInt32LE(crc, 14);
    lokal.writeUInt32LE(isi.length, 18);
    lokal.writeUInt32LE(asli.length, 22);
    lokal.writeUInt16LE(nama.length, 26);
    lokal.writeUInt16LE(0, 28); // tanpa extra field

    bagian.push(lokal, nama, isi);

    const sentral = Buffer.alloc(46);
    sentral.writeUInt32LE(0x02014b50, 0);
    sentral.writeUInt16LE(20, 4); // versi pembuat
    sentral.writeUInt16LE(20, 6); // versi minimum
    sentral.writeUInt16LE(0x0800, 8);
    sentral.writeUInt16LE(metode, 10);
    sentral.writeUInt16LE(jam, 12);
    sentral.writeUInt16LE(tanggal, 14);
    sentral.writeUInt32LE(crc, 16);
    sentral.writeUInt32LE(isi.length, 20);
    sentral.writeUInt32LE(asli.length, 24);
    sentral.writeUInt16LE(nama.length, 28);
    sentral.writeUInt16LE(0, 30); // extra
    sentral.writeUInt16LE(0, 32); // komentar
    sentral.writeUInt16LE(0, 34); // nomor disk
    sentral.writeUInt16LE(0, 36); // atribut internal
    sentral.writeUInt32LE((0o100644 << 16) >>> 0, 38); // mode berkas unix
    sentral.writeUInt32LE(offset, 42);
    pusat.push(sentral, nama);

    offset += lokal.length + nama.length + isi.length;
  }

  const isiPusat = Buffer.concat(pusat);
  const akhir = Buffer.alloc(22);
  akhir.writeUInt32LE(0x06054b50, 0);
  akhir.writeUInt16LE(0, 4);
  akhir.writeUInt16LE(0, 6);
  akhir.writeUInt16LE(daftar.length, 8);
  akhir.writeUInt16LE(daftar.length, 10);
  akhir.writeUInt32LE(isiPusat.length, 12);
  akhir.writeUInt32LE(offset, 16);
  akhir.writeUInt16LE(0, 20);

  fs.mkdirSync(path.dirname(berkasZip), { recursive: true });
  fs.writeFileSync(berkasZip, Buffer.concat([...bagian, isiPusat, akhir]));
  return { jumlah: daftar.length, ukuran: fs.statSync(berkasZip).size };
}
