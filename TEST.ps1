$ErrorActionPreference = 'Stop'
function Invoke-Checked {
    param([string]$Program, [string[]]$Arguments)
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Program failed with exit code $LASTEXITCODE" }
}
foreach ($game in @('boon-live', 'ganesha-live', 'alms-live', 'ramwong-live', 'curry-shop-3d')) {
    Push-Location (Join-Path $PSScriptRoot "games\$game")
    try {
        Write-Host "Testing $game"
        foreach ($script in @(Get-ChildItem -File -Filter '*.mjs') + @(Get-ChildItem -File -Filter '*.js')) {
            Invoke-Checked -Program 'node' -Arguments @('--check', $script.Name)
        }
        $testFiles = @(Get-ChildItem -File -Filter '*.test.mjs' | ForEach-Object { $_.Name })
        Invoke-Checked -Program 'node' -Arguments (@('--test', '--test-concurrency=1') + $testFiles)
        if (Test-Path -LiteralPath 'server.py') {
            Invoke-Checked -Program 'python' -Arguments @('-m', 'unittest', 'test_cloudflare_gateway.py')
            Invoke-Checked -Program 'python' -Arguments @('verify_game.py')
        }
    } finally { Pop-Location }
}
Write-Host 'All game checks passed.'
