<?php
/**
 * Router untuk pengujian lokal dari root repositori.
 * Jalankan: php -S localhost:8000 tools/router.php
 */

declare(strict_types=1);

$uri = parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH) ?: '/';
$root = dirname(__DIR__);

if (str_starts_with($uri, '/api/')) {
    $nama = substr($uri, strlen('/api/'));
    if ($nama === 'api.php') {
        require $root . '/api/api.php';
        return true;
    }
    if ($nama === 'buat-admin.php') {
        require $root . '/api/buat-admin.php';
        return true;
    }
    http_response_code(404);
    return true;
}

$file = $root . '/public' . ($uri === '/' ? '/index.html' : $uri);
if (is_file($file)) {
    $publicRoot = realpath($root . '/public');
    $realFile = realpath($file);
    if ($publicRoot !== false && $realFile !== false && str_starts_with($realFile, $publicRoot . DIRECTORY_SEPARATOR)) {
        // mime_content_type() often reports CSS as text/plain on Windows;
        // browsers refuse that stylesheet under strict MIME checking.
        $mime = match (strtolower(pathinfo($realFile, PATHINFO_EXTENSION))) {
            'css' => 'text/css; charset=utf-8',
            'js', 'mjs' => 'text/javascript; charset=utf-8',
            'json' => 'application/json; charset=utf-8',
            'svg' => 'image/svg+xml',
            'html', 'htm' => 'text/html; charset=utf-8',
            'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            default => function_exists('mime_content_type') ? mime_content_type($realFile) : null,
        };
        if (is_string($mime) && $mime !== '') header('Content-Type: ' . $mime);
        readfile($realFile);
        return true;
    }
}

http_response_code(404);
echo 'Not Found';
return true;
