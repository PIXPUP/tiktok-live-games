$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
    $runtime = Join-Path $root 'runtime'
    New-Item -ItemType Directory -Path $runtime -Force | Out-Null
    $node = (Get-Command node -ErrorAction Stop).Source
    Copy-Item -LiteralPath $node -Destination (Join-Path $runtime 'node.exe') -Force
    $nodeLicense = Join-Path (Split-Path $node -Parent) 'LICENSE'
    if (Test-Path -LiteralPath $nodeLicense) { Copy-Item -LiteralPath $nodeLicense -Destination (Join-Path $runtime 'NODE-LICENSE.txt') -Force }
    if (-not (Test-Path -LiteralPath (Join-Path $runtime 'NODE-LICENSE.txt'))) {
        $nodeVersion = (& $node -p 'process.version').Trim()
        Invoke-WebRequest -Uri "https://raw.githubusercontent.com/nodejs/node/$nodeVersion/LICENSE" -OutFile (Join-Path $runtime 'NODE-LICENSE.txt') -UseBasicParsing
    }
    if (-not (Test-Path -LiteralPath (Join-Path $runtime 'CLOUDFLARED-LICENSE.txt'))) {
        Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/cloudflare/cloudflared/master/LICENSE' -OutFile (Join-Path $runtime 'CLOUDFLARED-LICENSE.txt') -UseBasicParsing
    }
    $pythonLicense = (& python -c "import sys,pathlib; print(pathlib.Path(sys.base_prefix)/'LICENSE.txt')").Trim()
    if (Test-Path -LiteralPath $pythonLicense) { Copy-Item -LiteralPath $pythonLicense -Destination (Join-Path $runtime 'PYTHON-LICENSE.txt') -Force }
    $cloudflared = Join-Path $runtime 'cloudflared.exe'
    if (-not (Test-Path -LiteralPath $cloudflared)) {
        Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile "$cloudflared.partial" -UseBasicParsing
        Move-Item -LiteralPath "$cloudflared.partial" -Destination $cloudflared -Force
    }
    # The executable is a release asset, never committed as a Git blob.
    python desktop/music.py (Join-Path $runtime 'merit-background.wav')
    if ($LASTEXITCODE -ne 0) { throw 'Music asset build failed' }
    foreach ($metadata in Get-ChildItem -LiteralPath (Join-Path $root '.build-tools') -Directory -Filter '*.dist-info') {
        $licenseSource = Join-Path $metadata.FullName 'licenses'
        if (Test-Path -LiteralPath $licenseSource) {
            $licenseTarget = Join-Path $runtime ('licenses\' + $metadata.Name)
            New-Item -ItemType Directory -Path $licenseTarget -Force | Out-Null
            Copy-Item -Path (Join-Path $licenseSource '*') -Destination $licenseTarget -Recurse -Force
        }
    }
    $env:PYTHONPATH = Join-Path $root '.build-tools'
    python -m PyInstaller --noconfirm --onedir --windowed --name TikTokLiveGameDesk `
        --add-data 'games:games' --add-data 'runtime:runtime' --add-data 'desktop/bridge.mjs:desktop' `
        --add-data 'THIRD_PARTY_NOTICES.md:.' --add-data 'README.md:.' `
        --hidden-import http.server --hidden-import queue --hidden-import uuid --hidden-import collections `
        --hidden-import tkinter.filedialog --hidden-import tkinter.messagebox --hidden-import edge_tts `
        --copy-metadata edge-tts --hidden-import gtts --copy-metadata gTTS --collect-data certifi desktop/app.py
    if ($LASTEXITCODE -ne 0) { throw 'Desktop build failed' }
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'QUICK_START.txt') -Destination (Join-Path $root 'dist/TikTokLiveGameDesk/READ_ME_FIRST.txt') -Force
    $archive = Join-Path $root 'dist/TikTokLiveGameDesk-v1.3.2-Windows-x64.zip'
    Compress-Archive -Path (Join-Path $root 'dist/TikTokLiveGameDesk') -DestinationPath $archive -Force
    Write-Host "Built: $archive"
} finally { Pop-Location }
