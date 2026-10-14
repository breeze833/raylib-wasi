<?php
// router.php - Enables Cross-Origin Isolation (COOP/COEP) for php -S
header("Cross-Origin-Opener-Policy: same-origin");
header("Cross-Origin-Embedder-Policy: require-corp");
header("Access-Control-Allow-Origin: *");

$path = parse_url($_SERVER["REQUEST_URI"], PHP_URL_PATH);
if ($path === '/' || $path === '') {
    $path = '/examples/index.html';
}

$file = __DIR__ . $path;

if (is_file($file)) {
    $ext = pathinfo($file, PATHINFO_EXTENSION);
    $mimes = [
        'html' => 'text/html; charset=utf-8',
        'js'   => 'application/javascript; charset=utf-8',
        'mjs'  => 'application/javascript; charset=utf-8',
        'wasm' => 'application/wasm',
        'css'  => 'text/css; charset=utf-8',
        'json' => 'application/json',
        'png'  => 'image/png'
    ];
    if (isset($mimes[$ext])) {
        header("Content-Type: " . $mimes[$ext]);
    }
    readfile($file);
    exit;
}

http_response_code(404);
echo "404 Not Found";
