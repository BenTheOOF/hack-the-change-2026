# Runs the offline trainer for therapist-defined exercises. Stop with Ctrl+C.
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path -LiteralPath (Join-Path $taskRoot '.env'))) {
    throw 'No .env found. Copy .env.example to .env and fill it in.'
}
$taskUv = Join-Path $taskRoot '.tools\bin\uv.exe'
if (-not (Test-Path -LiteralPath $taskUv)) { $taskUv = (Get-Command uv -ErrorAction Stop).Source }
if (Test-Path -LiteralPath (Join-Path $taskRoot '.tools\python')) {
    $env:UV_PYTHON_INSTALL_DIR = Join-Path $taskRoot '.tools\python'
}
& $taskUv --directory (Join-Path $taskRoot 'backend') run --group ml python ../ml/worker.py @args
exit $LASTEXITCODE
