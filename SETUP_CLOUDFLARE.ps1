$ErrorActionPreference = 'Stop'
try {
    $architecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
    $asset = switch ($architecture) {
        'X64' { 'cloudflared-windows-amd64.exe' }
        'Arm64' { 'cloudflared-windows-arm64.exe' }
        default { throw "Unsupported Windows architecture: $architecture" }
    }
    $toolDirectory = Join-Path $PSScriptRoot 'tools'
    New-Item -ItemType Directory -Path $toolDirectory -Force | Out-Null
    $downloadPath = Join-Path $toolDirectory $asset
    if (-not (Test-Path -LiteralPath $downloadPath)) {
        $downloadUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/$asset"
        Write-Host "Downloading official Cloudflare executable: $downloadUrl"
        Invoke-WebRequest -Uri $downloadUrl -OutFile "$downloadPath.partial" -UseBasicParsing
        Move-Item -LiteralPath "$downloadPath.partial" -Destination $downloadPath -Force
    }
    foreach ($game in @('boon-live', 'ganesha-live', 'alms-live', 'ramwong-live')) {
        $destination = Join-Path $PSScriptRoot "games\$game\bin"
        New-Item -ItemType Directory -Path $destination -Force | Out-Null
        Copy-Item -LiteralPath $downloadPath -Destination (Join-Path $destination 'cloudflared.exe') -Force
    }
    Write-Host 'Cloudflare is ready. Open START.bat in a game folder, then CLOUDFLARE_START.bat.'
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
