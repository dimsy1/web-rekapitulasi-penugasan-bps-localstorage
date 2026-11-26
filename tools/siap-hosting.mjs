#!/usr/bin/env node
/**
 * Membangun paket siap upload ke hosting InfinityFree.
 *
 * Hasil:
 *   dist/infinityfree-htdocs/       -> isi folder ini yang diupload ke htdocs
 *   dist/infinityfree-htdocs.zip    -> alternatif upload + extract
 *
 * Pemakaian:
 *   node tools/siap-hosting.mjs             # bangun ulang paket + zip
 *   node tools/siap-hosting.mjs --zip-saja  # hanya buat ulang zip
 *
 * Catatan: dist/api/config.php (berisi kata sandi database) dan
 * dist/api/data-nama-kegiatan.sql dipertahankan saat paket dibangun ulang.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buatZip } from './zip.mjs';

const akar = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const tujuan = path.join(akar, 'dist', 'infinityfree-htdocs');
const berkasZip = path.join(akar, 'dist', 'infinityfree-htdocs.zip');
const argumen = new Set(process.argv.slice(2));
const hanyaZip = argumen.has('--zip-saja');

// Berkas api yang ikut deploy. config.php ditangani terpisah karena berisi
// kata sandi; data-nama-kegiatan.sql dipertahankan dari paket sebelumnya.
const BERKAS_API = [
  '.htaccess',
  'api.php',
  'bootstrap.php',
  'buat-admin.php',
  'config.contoh.php',
  'skema.sql',
  'migrasi-posisi-petugas.sql',
];

const BERKAS_DIPERTAHANKAN = ['api/config.php', 'api/data-nama-kegiatan.sql'];

function tulis(pesan) {
  process.stdout.write(pesan + '\n');
}

function gagal(pesan) {
  process.stderr.write(pesan + '\n');
  process.exit(1);
}

/** Menghitung jumlah berkas dan total ukuran di dalam sebuah folder. */
function ringkasFolder(folder) {
  let jumlah = 0;
  let ukuran = 0;
  const jelajah = (lokasi) => {
    for (const entri of fs.readdirSync(lokasi, { withFileTypes: true })) {
      const lengkap = path.join(lokasi, entri.name);
      if (entri.isDirectory()) jelajah(lengkap);
      else {
        jumlah += 1;
        ukuran += fs.statSync(lengkap).size;
      }
    }
  };
  jelajah(folder);
  return { jumlah, ukuran };
}

function buatZipPaket() {
  if (!fs.existsSync(tujuan)) gagal('Folder dist/infinityfree-htdocs belum ada.');
  fs.mkdirSync(path.dirname(berkasZip), { recursive: true });
  if (fs.existsSync(berkasZip)) fs.rmSync(berkasZip);
  return buatZip(tujuan, berkasZip);
}

function periksaConfig() {
  const berkas = path.join(tujuan, 'api', 'config.php');
  if (!fs.existsSync(berkas)) return;
  const isi = fs.readFileSync(berkas, 'utf8');
  const masalah = [];
  if (/db_pass'\s*=>\s*'(ISI-PASSWORD|GANTI)/i.test(isi)) {
    masalah.push("db_pass masih placeholder");
  }
  if (/db_host'\s*=>\s*'(GANTI|sql000)/i.test(isi)) {
    masalah.push('db_host masih placeholder');
  }
  if (/setup_token'\s*=>\s*'(GANTI|ISI)/i.test(isi)) {
    masalah.push('setup_token masih placeholder');
  }
  if (masalah.length) {
    tulis('');
    tulis('PERHATIAN: api/config.php belum siap dipakai -> ' + masalah.join(', '));
    tulis('Edit dist/infinityfree-htdocs/api/config.php sebelum upload.');
  }
}

if (!hanyaZip) {
  // Simpan berkas yang tidak boleh hilang saat paket dibangun ulang.
  const simpanan = new Map();
  for (const relatif of BERKAS_DIPERTAHANKAN) {
    const berkas = path.join(tujuan, relatif);
    if (fs.existsSync(berkas)) simpanan.set(relatif, fs.readFileSync(berkas));
  }

  fs.rmSync(tujuan, { recursive: true, force: true });
  fs.mkdirSync(tujuan, { recursive: true });

  // 1. Frontend: seluruh isi public/.
  fs.cpSync(path.join(akar, 'public'), tujuan, { recursive: true });

  // 2. Backend PHP.
  fs.mkdirSync(path.join(tujuan, 'api'), { recursive: true });
  for (const nama of BERKAS_API) {
    const asal = path.join(akar, 'api', nama);
    if (!fs.existsSync(asal)) gagal(`Berkas api/${nama} tidak ditemukan.`);
    fs.copyFileSync(asal, path.join(tujuan, 'api', nama));
  }

  // 3. Panduan hosting.
  fs.copyFileSync(
    path.join(akar, 'deploy', 'PANDUAN-HOSTING.txt'),
    path.join(tujuan, 'PANDUAN-HOSTING.txt')
  );

  // 4. Kembalikan config.php dan data nama kegiatan.
  for (const [relatif, isi] of simpanan) {
    fs.writeFileSync(path.join(tujuan, relatif), isi);
  }
  if (!simpanan.has('api/config.php')) {
    fs.copyFileSync(
      path.join(akar, 'deploy', 'config.infinityfree.php'),
      path.join(tujuan, 'api', 'config.php')
    );
    tulis('api/config.php dibuat dari deploy/config.infinityfree.php (perlu diisi).');
  }
  if (!simpanan.has('api/data-nama-kegiatan.sql')) {
    tulis('Catatan: api/data-nama-kegiatan.sql tidak ada; impor nama kegiatan dilewati.');
  }

  // Template bawaan juga disalin ke akar paket agar mudah diunduh manual.
  const template = path.join(tujuan, 'data', 'template-matriks.xlsx');
  if (fs.existsSync(template)) {
    fs.copyFileSync(template, path.join(tujuan, 'template-matriks.xlsx'));
  }
}

const infoFolder = ringkasFolder(tujuan);
const infoZip = buatZipPaket();

tulis('');
tulis('Paket hosting siap:');
tulis(`  Folder : dist/infinityfree-htdocs (${infoFolder.jumlah} berkas, ${Math.round(infoFolder.ukuran / 1024)} KB)`);
tulis(`  Zip    : dist/infinityfree-htdocs.zip (${infoZip.jumlah} berkas, ${Math.round(infoZip.ukuran / 1024)} KB)`);
periksaConfig();
tulis('');
tulis('Upload ISI folder tersebut (atau extract zip) langsung ke htdocs,');
tulis('lalu ikuti PANDUAN-HOSTING.txt di dalam paket.');
