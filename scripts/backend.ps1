param([int]$Port = 8000)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path -LiteralPath (Join-Path $taskRoot '.env'))) {
    Copy-Item -LiteralPath (Join-Path $taskRoot '.env.example') -Destination (Join-Path $taskRoot '.env')
}
$taskUv = Join-Path $taskRoot '.tools\bin\uv.exe'
if (-not (Test-Path -LiteralPath $taskUv)) { $taskUv = (Get-Command uv -ErrorAction Stop).Source }
if (Test-Path -LiteralPath (Join-Path $taskRoot '.tools\python')) {
    $env:UV_PYTHON_INSTALL_DIR = Join-Path $taskRoot '.tools\python'
}
$env:UV_CACHE_DIR = Join-Path $taskRoot '.tools\uv-cache'
if (-not (Test-Path -LiteralPath (Join-Path $taskRoot 'backend\.venv'))) {
    & $taskUv --directory (Join-Path $taskRoot 'backend') sync
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
# Preserve an already installed optional ML group while serving the lightweight API.
& $taskUv --directory (Join-Path $taskRoot 'backend') run --no-sync uvicorn app.main:app --host 127.0.0.1 --port $Port
exit $LASTEXITCODE
