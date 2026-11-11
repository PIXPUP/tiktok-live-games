$ErrorActionPreference = 'Stop'
$gameRoot = $PSScriptRoot
$listening = Get-NetTCPConnection -LocalPort 8775 -State Listen -ErrorAction SilentlyContinue
if (-not $listening) {
    Start-Process -FilePath 'node' -ArgumentList 'server.mjs' -WorkingDirectory $gameRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $gameRoot 'server.log') -RedirectStandardError (Join-Path $gameRoot 'server-error.log')
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Milliseconds 200
        if (Get-NetTCPConnection -LocalPort 8775 -State Listen -ErrorAction SilentlyContinue) { break }
    }
}
Start-Process 'http://127.0.0.1:8775/'
