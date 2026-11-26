<?php
/**
 * Salin file ini menjadi api/config.php lalu isi nilainya.
 * api/config.php tidak ikut masuk git karena berisi kata sandi database.
 *
 * Konfigurasi ini untuk MySQL Laragon lokal. Hosting belum digunakan.
 */
return [
    // --- Database MySQL Laragon ---------------------------------------------
    'db_host' => '127.0.0.1',
    'db_port' => 3306,
    'db_name' => 'db_selaras',
    'db_user' => 'root',
    'db_pass' => '',

    // --- Aplikasi ----------------------------------------------------------
    'zona_waktu' => 'Asia/Jakarta',
    'versi_app' => '3.1.0',

    // Dipakai oleh pembuat akun admin lokal.
    'setup_token' => 'lokal-ganti-token',

    // Lama sesi login (jam).
    'sesi_jam' => 8,

    // Batas ukuran file template Excel yang boleh disimpan (byte).
    'maks_template' => 4 * 1024 * 1024,
];
