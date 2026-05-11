<?php
declare(strict_types=1);

// ── Deploy webhook ──────────────────────────────────────
// GitHub → this script → git reset --hard to origin.
// Same file runs on test and main folders; it pulls only
// when the pushed ref matches the branch checked out here.

$repoDir    = __DIR__;
$secretFile = '/home/rtbccwfb/.deploy-secret';
$logFile    = '/home/rtbccwfb/deploy.log';
$gitBin     = '/usr/local/cpanel/3rdparty/lib/path-bin/git';

// ── Helpers ─────────────────────────────────────────────
function deploy_log(string $file, string $msg): void {
    @file_put_contents($file, '[' . date('c') . '] ' . $msg . PHP_EOL, FILE_APPEND);
}

function deploy_exit(string $logFile, int $code, string $msg): void {
    http_response_code($code);
    deploy_log($logFile, $code . ' ' . $msg);
    echo $msg;
    exit;
}

// ── Request validation ──────────────────────────────────
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    deploy_exit($logFile, 405, 'Method not allowed');
}

if (!is_readable($secretFile)) {
    $diag = sprintf(
        'path=%s exists=%d readable=%d open_basedir=%s uid=%d',
        $secretFile,
        file_exists($secretFile) ? 1 : 0,
        is_readable($secretFile) ? 1 : 0,
        (string) ini_get('open_basedir'),
        function_exists('posix_geteuid') ? posix_geteuid() : -1
    );
    deploy_exit($logFile, 500, 'Secret missing | ' . $diag);
}

$secret = trim((string) file_get_contents($secretFile));
if ($secret === '') {
    deploy_exit($logFile, 500, 'Secret empty');
}

$payload   = (string) file_get_contents('php://input');
$signature = $_SERVER['HTTP_X_HUB_SIGNATURE_256'] ?? '';
$expected  = 'sha256=' . hash_hmac('sha256', $payload, $secret);

if (!hash_equals($expected, $signature)) {
    deploy_exit($logFile, 401, 'Bad signature');
}

$event = $_SERVER['HTTP_X_GITHUB_EVENT'] ?? '';
if ($event === 'ping') {
    deploy_exit($logFile, 200, 'pong');
}
if ($event !== 'push') {
    deploy_exit($logFile, 200, 'Ignored event: ' . $event);
}

$data = json_decode($payload, true);
if (!is_array($data)) {
    deploy_exit($logFile, 400, 'Bad payload');
}

$pushedBranch = str_replace('refs/heads/', '', (string) ($data['ref'] ?? ''));

// ── Branch match ────────────────────────────────────────
$cd = 'cd ' . escapeshellarg($repoDir);
$currentBranch = trim((string) shell_exec($cd . ' && ' . $gitBin . ' rev-parse --abbrev-ref HEAD 2>&1'));

if ($pushedBranch !== $currentBranch) {
    deploy_exit($logFile, 200, "Ignored: push to '$pushedBranch' != checked-out '$currentBranch'");
}

// ── Pull ────────────────────────────────────────────────
$branchArg = escapeshellarg($currentBranch);
$cmd = $cd
    . ' && ' . $gitBin . ' fetch origin ' . $branchArg . ' 2>&1'
    . ' && ' . $gitBin . ' reset --hard origin/' . $branchArg . ' 2>&1';

$output = (string) shell_exec($cmd);
deploy_log($logFile, "PULL $currentBranch\n" . trim($output));

http_response_code(200);
echo "OK $currentBranch";
