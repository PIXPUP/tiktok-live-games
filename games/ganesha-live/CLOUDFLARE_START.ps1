$ErrorActionPreference = 'Stop'
$gameRoot = $PSScriptRoot
$agentPath = Join-Path $gameRoot 'bin\cloudflared.exe'
$sessionPath = Join-Path $gameRoot 'CLOUDFLARE_SESSION.json'
try {
    $null = Invoke-RestMethod -Uri 'http://127.0.0.1:8785/api/state' -TimeoutSec 3
    if (Test-Path -LiteralPath $sessionPath) {
        $previous = Get-Content -LiteralPath $sessionPath -Raw | ConvertFrom-Json
        $running = Get-Process -Id $previous.processId -ErrorAction SilentlyContinue
        if ($running -and $running.Path -eq $agentPath -and $previous.url -match '^https://[a-z0-9-]+\.trycloudflare\.com/') {
            Set-Content -LiteralPath (Join-Path $gameRoot 'LIVE_URL.txt') -Value $previous.url -Encoding utf8
            Write-Host "Paste into LIVE Studio: $($previous.url)"
            exit 0
        }
    }
    if (-not (Test-Path -LiteralPath $agentPath)) { throw 'cloudflared.exe is missing from bin.' }
    $gatewayReady = $false
    try { $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8788/health' -TimeoutSec 2; $gatewayReady = $health.ready -and $health.transport -eq 'poll' } catch { }
    if (-not $gatewayReady) {
        $pythonPath = (Get-Command python.exe -ErrorAction Stop).Source
        Start-Process -FilePath $pythonPath -ArgumentList @('"' + (Join-Path $gameRoot 'cloudflare_gateway.py') + '"') -WorkingDirectory $gameRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $gameRoot 'cloudflare-gateway.log') -RedirectStandardError (Join-Path $gameRoot 'cloudflare-gateway-error.log') | Out-Null
        for ($attempt=0; $attempt -lt 10; $attempt++) {
            Start-Sleep -Milliseconds 400
            try { $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8788/health' -TimeoutSec 2; if ($health.ready) { $gatewayReady = $true; break } } catch { }
        }
    }
    if (-not $gatewayReady) { throw 'Gateway is not ready. Check that START.bat is running.' }
    $tag = Get-Date -Format 'yyyyMMdd-HHmmss'
    $logPath = Join-Path $gameRoot "cloudflare-$tag.log"
    $agent = Start-Process -FilePath $agentPath -ArgumentList @('tunnel','--url','http://127.0.0.1:8788','--protocol','http2','--no-autoupdate','--logfile',('"' + $logPath + '"')) -WorkingDirectory $gameRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $gameRoot "cloudflare-$tag-stdout.log") -RedirectStandardError (Join-Path $gameRoot "cloudflare-$tag-stderr.log") -PassThru
    for ($attempt=0; $attempt -lt 50; $attempt++) {
        Start-Sleep -Seconds 1
        if (Test-Path -LiteralPath $logPath) {
            $match = [regex]::Match((Get-Content -LiteralPath $logPath -Raw), 'https://[a-z0-9]+(?:-[a-z0-9]+)+\.trycloudflare\.com')
            if ($match.Success) {
                $url = $match.Value + '/?overlay=1&transport=poll&v=9'
                @{processId=$agent.Id;url=$url;log=$logPath} | ConvertTo-Json | Set-Content -LiteralPath $sessionPath -Encoding utf8
                Set-Content -LiteralPath (Join-Path $gameRoot 'LIVE_URL.txt') -Value $url -Encoding utf8
                Write-Host "Paste into LIVE Studio: $url"
                exit 0
            }
        }
        if ($agent.HasExited) { throw "Cloudflare stopped. Check cloudflare-$tag-stderr.log" }
    }
    throw "Cloudflare has not issued a URL yet. Check $logPath"
} catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 }
