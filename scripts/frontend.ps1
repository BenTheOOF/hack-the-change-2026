param([int]$Port = 3000)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskNode = Join-Path $taskRoot '.tools\node-v24.22.2-win-x64'
if (Test-Path -LiteralPath $taskNode) { $env:PATH = $taskNode + ';' + $env:PATH }
$taskNpm = (Get-Command npm.cmd -ErrorAction Stop).Source
& $taskNpm --prefix (Join-Path $taskRoot 'frontend') run dev -- --hostname 127.0.0.1 --port $Port
exit $LASTEXITCODE
