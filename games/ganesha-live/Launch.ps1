$ErrorActionPreference = 'Stop'
$gameRoot = $PSScriptRoot
$gameUrl = 'http://127.0.0.1:8785'
function Test-Game {
    try {
        $result = Invoke-RestMethod -Uri "$gameUrl/api/state" -TimeoutSec 2
        return $null -ne $result.score
    } catch { return $false }
}
try {
    if (-not (Test-Game)) {
        $pythonCommand = Get-Command python.exe -ErrorAction SilentlyContinue
        $pythonPath = if (Test-Path -LiteralPath 'C:\Python313\python.exe') { 'C:\Python313\python.exe' } elseif ($pythonCommand) { $pythonCommand.Source } else { throw 'Python 3 is required.' }
        $serverProcess = Start-Process -FilePath $pythonPath -ArgumentList @('"' + (Join-Path $gameRoot 'server.py') + '"') -WorkingDirectory $gameRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $gameRoot 'server.log') -RedirectStandardError (Join-Path $gameRoot 'server-error.log') -PassThru
        $ready = $false
        for ($attempt = 0; $attempt -lt 15; $attempt++) {
            Start-Sleep -Milliseconds 400
            if (Test-Game) { $ready = $true; break }
            if ($serverProcess.HasExited) { break }
        }
        if (-not $ready) { throw ('Game server could not start. See ' + (Join-Path $gameRoot 'server-error.log')) }
    }
    $bridgeReady = $false
    try {
        $bridgeStatus = Invoke-RestMethod -Uri 'http://127.0.0.1:8786/status' -TimeoutSec 2
        $bridgeReady = $null -ne $bridgeStatus.connection
    } catch { }
    if (-not $bridgeReady) {
        $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
        if ($nodeCommand) {
            Start-Process -FilePath $nodeCommand.Source -ArgumentList @('"' + (Join-Path $gameRoot 'tikfinity-bridge.mjs') + '"') -WorkingDirectory $gameRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $gameRoot 'bridge.log') -RedirectStandardError (Join-Path $gameRoot 'bridge-error.log') | Out-Null
        } else {
            Write-Host 'TikFinity bridge needs Node.js 22 or newer. Game demo remains available.'
        }
    }
    Start-Process "$gameUrl/?v=9"
    Write-Host "Game ready: $gameUrl"
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
