<?php
/**
 * Contoh konfigurasi untuk hosting InfinityFree.
 *
 * Salin file ini menjadi api/config.php lalu isi nilainya. File config.php
 * TIDAK di-commit ke git karena berisi kata sandi database.
 *
 * Nilai di bawah adalah contoh format. Ganti dengan data dari
 * Client Area InfinityFree > MySQL Databases.
 */
return [
    // --- Database MySQL InfinityFree ---------------------------------------
    // BUKAN localhost/127.0.0.1. Contoh: 'sql104.infinityfree.com'
    'db_host' => 'sql000.infinityfree.com',

    // Port MySQL dari panel. InfinityFree memakai 3306.
    'db_port' => 3306,

    // Nama database LENGKAP dengan awalan akun.
    // Contoh: 'if0_12345678_db_merpati'
    'db_name' => 'if0_00000000_db_contoh',

    // Username MySQL, sama dengan akun hosting. Contoh: 'if0_12345678'
    'db_user' => 'if0_00000000',

    // PENTING: password akun hosting (bukan password login Client Area).
    'db_pass' => 'ISI-PASSWORD-HOSTING',

    // --- Aplikasi ----------------------------------------------------------
    'zona_waktu' => 'Asia/Jakarta',
    'versi_app' => '3.1.0',

    // Token untuk membuka api/buat-admin.php sekali saja.
    // Buat kata acak panjang (minimal 16 karakter). Setelah akun admin
    // dibuat: hapus api/buat-admin.php dan kosongkan nilai ini menjadi ''.
    'setup_token' => 'GANTI-DENGAN-KATA-ACAK-PANJANG',

    // Lama sesi login (jam).
    'sesi_jam' => 8,

    // Batas ukuran file template Excel yang boleh disimpan (byte).
    'maks_template' => 4 * 1024 * 1024,
];
