<#
.SYNOPSIS
  Away on Windows — start, stop and look at the thing you just installed.

.EXAMPLE
  bin\away.cmd start --open

.EXAMPLE
  bin\away.cmd status
#>
param(
  [Parameter(Position = 0)][string]$Command = 'help',
  [Parameter(ValueFromRemainingArguments = $true)][string[]]$Rest = @()
)

# `--flag` is a Unix spelling PowerShell does not parse into a switch, so the
# remaining arguments are read by hand. Both spellings work.
$Port = 0
$OutreachPort = 0
$Open = $false
$NoOutreach = $false
$Follow = $false
$What = ''

$positional = @()
for ($i = 0; $i -lt $Rest.Count; $i++) {
  $arg = $Rest[$i]
  switch -Regex ($arg) {
    '^--?open$'                { $Open = $true; continue }
    '^--?no-?outreach$'        { $NoOutreach = $true; continue }
    '^--?follow$'              { $Follow = $true; continue }
    '^-f$'                     { $Follow = $true; continue }
    '^--port=(\d+)$'          { $Port = [int]$Matches[1]; continue }
    '^--outreach-port=(\d+)$'  { $OutreachPort = [int]$Matches[1]; continue }
    '^--port$'                 { $i++; if ($i -lt $Rest.Count) { $Port = [int]$Rest[$i] }; continue }
    '^--outreach-port$'        { $i++; if ($i -lt $Rest.Count) { $OutreachPort = [int]$Rest[$i] }; continue }
    default                    { if (-not $arg.StartsWith('-')) { $positional += $arg } }
  }
}
if ($positional.Count -gt 0) { $What = $positional[0] }

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

# Node installed by the installer lives here when the system had none.
$runtime = Join-Path $Root '.runtime'
if (Test-Path $runtime) {
  $runtimeNode = Get-ChildItem $runtime -Directory -Filter 'node-v*' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($runtimeNode) { $env:Path = "$($runtimeNode.FullName);$env:Path" }
}

$envFile = Join-Path $Root '.away\env'
if (Test-Path $envFile) {
  foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
    $name, $value = $line -split '=', 2
    $name = $name.Trim()
    if (-not (Test-Path "env:$name")) { Set-Item -Path "env:$name" -Value $value.Trim() }
  }
}

if ($Port -eq 0) { $Port = if ($env:AWAY_PORT) { [int]$env:AWAY_PORT } else { 3000 } }
if ($OutreachPort -eq 0) { $OutreachPort = if ($env:AWAY_OUTREACH_PORT) { [int]$env:AWAY_OUTREACH_PORT } else { 3100 } }

$LogDir = Join-Path $Root '.away\logs'
$WebPidFile = Join-Path $Root '.away\web.pid'
$OutreachPidFile = Join-Path $Root '.away\outreach.pid'
$WebPortFile = Join-Path $Root '.away\web.port'
$OutreachPortFile = Join-Path $Root '.away\outreach.port'

function Ok($text)   { Write-Host "OK  $text" -ForegroundColor Green }
function Info($text) { Write-Host ".   $text" -ForegroundColor DarkGray }
function Warn($text) { Write-Host "!   $text" -ForegroundColor Yellow }
function Bad($text)  { Write-Host "X   $text" -ForegroundColor Red }

function Get-SavedPid($file) {
  if (Test-Path $file) {
    $value = (Get-Content $file -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($value -match '^\d+$') { return [int]$value }
  }
  return 0
}

function Test-Alive($processId) {
  if (-not $processId) { return $false }
  return [bool](Get-Process -Id $processId -ErrorAction SilentlyContinue)
}

function Test-Http($url) {
  try {
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
    return ($response.StatusCode -lt 500)
  } catch { return $false }
}

function Wait-Http($url, $seconds) {
  $waited = 0
  while ($waited -lt $seconds) {
    if (Test-Http $url) { return $true }
    Start-Sleep -Seconds 1
    $waited += 1
  }
  return $false
}

function Start-Web {
  $processId = Get-SavedPid $WebPidFile
  if (Test-Alive $processId) {
    Ok "web app already running (pid $processId) on http://localhost:$Port"
    return $true
  }
  if (Test-Http "http://127.0.0.1:$Port/") {
    Warn "something already answers on port $Port — not starting a second one"
    return $false
  }
  if (-not (Test-Path 'apps\web\.next\BUILD_ID')) {
    Bad 'the web app is not built — run install\install.ps1 (or: cd apps\web; npm run build)'
    return $false
  }

  New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
  Info 'starting the web app…'
  $proc = Start-Process -FilePath 'node' `
    -ArgumentList './node_modules/next/dist/bin/next', 'start', '-H', '0.0.0.0', '-p', "$Port" `
    -WorkingDirectory (Join-Path $Root 'apps\web') `
    -RedirectStandardOutput (Join-Path $LogDir 'web.log') `
    -RedirectStandardError (Join-Path $LogDir 'web.err.log') `
    -WindowStyle Hidden -PassThru
  Set-Content -Path $WebPidFile -Value $proc.Id -Encoding ascii
  Set-Content -Path $WebPortFile -Value $Port -Encoding ascii

  if (Wait-Http "http://127.0.0.1:$Port/" 90) {
    Ok "web app    http://localhost:$Port   (pid $($proc.Id), log .away\logs\web.log)"
    return $true
  }
  Bad 'the web app did not answer in 90s — the log ends with:'
  if (Test-Path (Join-Path $LogDir 'web.err.log')) { Get-Content (Join-Path $LogDir 'web.err.log') -Tail 20 | Write-Host }
  return $false
}

function Start-Outreach {
  $processId = Get-SavedPid $OutreachPidFile
  if (Test-Alive $processId) {
    Ok "outreach already running (pid $processId) on http://localhost:$OutreachPort"
    return $true
  }
  if (Test-Http "http://127.0.0.1:$OutreachPort/healthz") {
    Warn "something already answers on port $OutreachPort — not starting a second one"
    return $true
  }

  New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
  Info 'starting the outreach tool…'
  $env:OUTREACH_PORT = "$OutreachPort"
  $env:AWAY_APP_URL = "http://localhost:$Port"
  $env:OUTREACH_PUBLIC_URL = "http://localhost:$OutreachPort"
  $proc = Start-Process -FilePath 'node' -ArgumentList '--no-warnings', 'server.js' `
    -WorkingDirectory (Join-Path $Root 'apps\outreach') `
    -RedirectStandardOutput (Join-Path $LogDir 'outreach.log') `
    -RedirectStandardError (Join-Path $LogDir 'outreach.err.log') `
    -WindowStyle Hidden -PassThru
  Set-Content -Path $OutreachPidFile -Value $proc.Id -Encoding ascii
  Set-Content -Path $OutreachPortFile -Value $OutreachPort -Encoding ascii

  if (Wait-Http "http://127.0.0.1:$OutreachPort/healthz" 45) {
    Ok "outreach   http://localhost:$OutreachPort   (password in .away\env)"
    return $true
  }
  Warn 'the outreach tool did not answer — see .away\logs\outreach.err.log'
  return $true
}

function Stop-One($file, $label) {
  $processId = Get-SavedPid $file
  if (-not (Test-Alive $processId)) {
    Remove-Item $file -Force -ErrorAction SilentlyContinue
    Info "$label is not running"
    return
  }
  # `next start` runs node as a child of itself in some versions; take the
  # children with us so nothing keeps the port.
  Get-CimInstance Win32_Process -Filter "ParentProcessId = $processId" -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
  Remove-Item $file -Force -ErrorAction SilentlyContinue
  Ok "$label stopped"
}

function Show-Logs($which, $follow) {
  $log = Join-Path $LogDir "$which.log"
  $err = Join-Path $LogDir "$which.err.log"
  if (-not (Test-Path $log) -and -not (Test-Path $err)) {
    Info "no log yet at .away\logs\$which.log"
    return
  }
  if ($follow) {
    Get-Content $log -Wait -Tail 40
  } else {
    if (Test-Path $log) { Get-Content $log -Tail 80 }
    if (Test-Path $err) { Get-Content $err -Tail 20 }
  }
}

function Open-Away {
  Start-Process "http://localhost:$Port"
}

switch ($Command.ToLower()) {
  'start' {
    Start-Web | Out-Null
    if (-not $NoOutreach) { Start-Outreach | Out-Null }
    Write-Host ""
    Write-Host "  Ready  http://localhost:$Port" -ForegroundColor Green
    Write-Host ""
    if ($Open) { Open-Away }
  }
  'stop' {
    Stop-One $WebPidFile 'web app'
    Stop-One $OutreachPidFile 'outreach'
  }
  'restart' {
    Stop-One $WebPidFile 'web app'
    Stop-One $OutreachPidFile 'outreach'
    Start-Web | Out-Null
    if (-not $NoOutreach) { Start-Outreach | Out-Null }
  }
  'status' {
    if (Test-Path $WebPortFile) { $Port = [int](Get-Content $WebPortFile) }
    if (Test-Path $OutreachPortFile) { $OutreachPort = [int](Get-Content $OutreachPortFile) }

    $webPid = Get-SavedPid $WebPidFile
    if (Test-Alive $webPid) { Ok "web app    running (pid $webPid)  http://localhost:$Port" }
    elseif (Test-Http "http://127.0.0.1:$Port/") { Warn "port $Port is answering, but not from this checkout" }
    else { Info 'web app    stopped' }

    $outreachPid = Get-SavedPid $OutreachPidFile
    if (Test-Alive $outreachPid) { Ok "outreach   running (pid $outreachPid)  http://localhost:$OutreachPort" }
    elseif (Test-Http "http://127.0.0.1:$OutreachPort/healthz") { Warn "port $OutreachPort is answering, but not from this checkout" }
    else { Info 'outreach   stopped' }

    if (Test-Path 'apps\web\data\away.db') {
      $size = [math]::Round((Get-Item 'apps\web\data\away.db').Length / 1KB)
      Info "database   apps\web\data\away.db (${size} KB)"
    }
  }
  'logs' {
    $which = if ($What -in @('web', 'outreach')) { $What } else { 'web' }
    Show-Logs $which $Follow
  }
  'open' { Open-Away }
  'test' {
    if (-not (Test-Path 'e2e\node_modules\@playwright')) {
      Bad 'test dependencies are missing — run install\install.ps1'
      exit 1
    }
    Push-Location e2e
    try { & npm test } finally { Pop-Location }
    exit $LASTEXITCODE
  }
  'e2e' { & $PSCommandPath test; exit $LASTEXITCODE }
  'db' {
    Push-Location apps\web
    try { & node --no-warnings scripts\db-init.mjs } finally { Pop-Location }
  }
  'reset' {
    Warn 'this deletes the local database and rebuilds it from the seed'
    Push-Location apps\web
    try {
      & node scripts\reset-db.mjs
      & node --no-warnings scripts\db-init.mjs
    } finally { Pop-Location }
  }
  default {
    Write-Host @"
away — run it, look at it, test it

  bin\away.cmd start [--open] [--no-outreach] [--port N] [--outreach-port N]
  bin\away.cmd stop | restart | status
  bin\away.cmd logs [web|outreach] [-follow]
  bin\away.cmd open
  bin\away.cmd test          the browser click-through
  bin\away.cmd db            apply/verify the schema, print the tables
  bin\away.cmd reset         delete the local database and rebuild it
"@
  }
}
