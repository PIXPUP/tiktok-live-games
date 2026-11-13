$ErrorActionPreference = 'Stop'
$agentPath = Join-Path $PSScriptRoot 'bin\cloudflared.exe'
Get-Process -Name cloudflared -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $agentPath } | Stop-Process
Write-Host 'Cloudflare public link stopped. The local game remains running.'
