<#
.SYNOPSIS
  Away — one-command install for Windows.

.DESCRIPTION
  Same job as install/install.sh, on Windows terms:

    1. checks what is already here (Node, npm, winget, the files)
    2. installs Node 22+ if missing — winget first, then the official .msi,
       then the official .zip unpacked into .runtime\ when there is no admin
    3. installs dependencies and builds the web app
    4. writes apps\web\.env.local (once — never overwrites) with generated secrets
    5. builds the SQLite database from the app's own schema and reports the tables
    6. installs a headless browser (or uses the Edge that ships with Windows)
    7. starts both servers, runs the browser click-through test, stops them

  No database server is installed because none is needed: the app keeps
  everything in one SQLite file through Node's built-in driver (node:sqlite),
  which is why the only hard requirement is Node 22.5+.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File install\install.ps1

.EXAMPLE
  .\install\install.ps1 -Check
#>
[CmdletBinding()]
param(
  [int]$Port = 3000,
  [int]$OutreachPort = 3100,
  [switch]$NoE2E,
  [switch]$NoBrowser,
  [switch]$SkipSystem,
  [switch]$Check,
  [switch]$Yes
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$NodeMin = [version]'22.5.0'

# ---------------------------------------------------------------------------
# output
# ---------------------------------------------------------------------------
function Step($text) { Write-Host ""; Write-Host "> $text" -ForegroundColor Magenta }
function Ok($text)   { Write-Host "  OK  $text" -ForegroundColor Green }
function Info($text) { Write-Host "  .   $text" -ForegroundColor DarkGray }
function Warn($text) { Write-Host "  !   $text" -ForegroundColor Yellow }
function Bad($text)  { Write-Host "  X   $text" -ForegroundColor Red }
function Die($text)  { Bad $text; exit 1 }

function Have($name) { return [bool](Get-Command $name -ErrorAction SilentlyContinue) }

function Ask($prompt) {
  if ($Yes -or -not [Environment]::UserInteractive) { return $true }
  $answer = Read-Host "  ? $prompt [Y/n]"
  if ([string]::IsNullOrWhiteSpace($answer)) { return $true }
  return -not ($answer -match '^(n|no)$')
}

function Get-NodeVersion {
  if (-not (Have 'node')) { return $null }
  $raw = & node -p 'process.versions.node' 2>$null
  if (-not $raw) { return $null }
  try { return [version]($raw.Trim()) } catch { return $null }
}

function Test-NodeOk {
  $v = Get-NodeVersion
  return ($null -ne $v -and $v -ge $NodeMin)
}

function Test-Elevated {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($id)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Update-PathFromRegistry {
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$machine;$user"
}

function Add-ToPath($dir) {
  if (Test-Path $dir) { $env:Path = "$dir;$env:Path" }
}

Write-Host ""
Write-Host "  Away — local install" -ForegroundColor White
Info "$([Environment]::OSVersion.VersionString) · $($env:PROCESSOR_ARCHITECTURE) · PowerShell $($PSVersionTable.PSVersion)"
Write-Host ""

# ---------------------------------------------------------------------------
# 1. what is already here
# ---------------------------------------------------------------------------
Step "Looking at what this machine already has"

$nodeVersion = Get-NodeVersion
$haveNode = Test-NodeOk
$haveDeps = Test-Path (Join-Path $Root 'apps\web\node_modules\next')
$haveBuild = Test-Path (Join-Path $Root 'apps\web\.next\BUILD_ID')
$haveDb = Test-Path (Join-Path $Root 'apps\web\data\away.db')
$haveEnv = Test-Path (Join-Path $Root 'apps\web\.env.local')
$haveE2eDeps = Test-Path (Join-Path $Root 'e2e\node_modules\@playwright')
$pwCache = Join-Path $env:LOCALAPPDATA 'ms-playwright'
$haveBrowser = (Test-Path $pwCache) -and ((Get-ChildItem $pwCache -ErrorAction SilentlyContinue | Measure-Object).Count -gt 0)
$haveEdge = Test-Path (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe')

Info ("repository       " + $Root)
Info ("node             " + $(if ($nodeVersion) { "$nodeVersion ($(Get-Command node).Source)" } else { 'not installed' }))
Info ("npm              " + $(if (Have 'npm') { (& npm -v 2>$null) } else { 'not installed' }))
Info ("winget           " + $(if (Have 'winget') { 'available' } else { 'not available' }))
Info ("Microsoft Edge   " + $(if ($haveEdge) { 'installed' } else { 'not found' }))

function StatusLine($label, $present, $found, $todo) {
  if ($present) { Write-Host ("  OK  {0,-22} {1}" -f $label, $found) -ForegroundColor Green }
  else { Write-Host ("  .   {0,-22} {1}" -f $label, $todo) -ForegroundColor Yellow }
}

Write-Host ""
StatusLine "node >= $NodeMin"  $haveNode     "$nodeVersion"     "will install it"
StatusLine "web dependencies"  $haveDeps     "installed"        "npm ci"
StatusLine "web build"         $haveBuild    "built"            "npm run build"
StatusLine "database"          $haveDb       "apps\web\data\away.db" "will be created from lib\schema.ts"
StatusLine ".env.local"        $haveEnv      "present (left alone)"  "will be generated"
StatusLine "test dependencies" $haveE2eDeps   "installed"        "npm ci in e2e\"
StatusLine "headless browser"  ($haveBrowser -or $haveEdge) $(if ($haveBrowser) { 'Playwright cache' } else { 'Edge (built in)' }) "will download or use Edge"

if ($Check) {
  Write-Host ""
  Info "no changes made (-Check)"
  exit 0
}

# ---------------------------------------------------------------------------
# 2. node
# ---------------------------------------------------------------------------
Step "Node 22.5 or newer"

function Install-NodeWithWinget {
  if (-not (Have 'winget')) { return $false }
  Info "winget install OpenJS.NodeJS.LTS"
  & winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements --silent 2>&1 | Out-Null
  Update-PathFromRegistry
  return (Test-NodeOk)
}

function Install-NodeWithMsi {
  if (-not (Test-Elevated)) { return $false }
  $arch = switch ($env:PROCESSOR_ARCHITECTURE) { 'ARM64' { 'arm64' } 'AMD64' { 'x64' } default { 'x86' } }
  $base = 'https://nodejs.org/dist/latest-v22.x'
  $listing = Invoke-WebRequest -UseBasicParsing "$base/SHASUMS256.txt" -TimeoutSec 60
  $line = ($listing.Content -split "`n" | Where-Object { $_ -match "-$arch\.msi$" } | Select-Object -First 1)
  if (-not $line) { return $false }
  $bytes, $file = $line.Trim() -split '\s+'
  $target = Join-Path $env:TEMP $file
  Info "downloading $file"
  Invoke-WebRequest -UseBasicParsing "$base/$file" -OutFile $target -TimeoutSec 600
  if ((Get-FileHash $target -Algorithm SHA256).Hash -ne $bytes.ToUpper()) {
    Remove-Item $target -Force
    Warn 'checksum mismatch — refusing to run that installer'
    return $false
  }
  $proc = Start-Process msiexec.exe -ArgumentList "/i `"$target`" /qn /norestart" -Wait -PassThru
  Remove-Item $target -Force -ErrorAction SilentlyContinue
  Update-PathFromRegistry
  return ($proc.ExitCode -eq 0 -and (Test-NodeOk))
}

function Install-NodeFromZip {
  # No winget and no admin: the official zip unpacked next to the repo.
  $arch = switch ($env:PROCESSOR_ARCHITECTURE) { 'ARM64' { 'arm64' } 'AMD64' { 'x64' } default { 'x86' } }
  $base = 'https://nodejs.org/dist/latest-v22.x'
  Info 'unpacking the official Node zip into .runtime\ (no admin needed)'
  $listing = Invoke-WebRequest -UseBasicParsing "$base/SHASUMS256.txt" -TimeoutSec 60
  $line = ($listing.Content -split "`n" | Where-Object { $_ -match "-win-$arch\.zip$" } | Select-Object -First 1)
  if (-not $line) { Warn 'could not find a Windows zip on nodejs.org'; return $false }
  $bytes, $file = $line.Trim() -split '\s+'
  $runtime = Join-Path $Root '.runtime'
  New-Item -ItemType Directory -Force -Path $runtime | Out-Null
  $zip = Join-Path $runtime $file
  Info "downloading $file (about 30 MB)"
  Invoke-WebRequest -UseBasicParsing "$base/$file" -OutFile $zip -TimeoutSec 600
  if ((Get-FileHash $zip -Algorithm SHA256).Hash -ne $bytes.ToUpper()) {
    Remove-Item $zip -Force
    Warn 'checksum mismatch — refusing to use that download'
    return $false
  }
  Expand-Archive -Path $zip -DestinationPath $runtime -Force
  Remove-Item $zip -Force
  $dir = Join-Path $runtime ($file -replace '\.zip$', '')
  Add-ToPath $dir
  return (Test-NodeOk)
}

if ($haveNode) {
  Ok "node $nodeVersion is already new enough"
} else {
  if ($nodeVersion) { Warn "node $nodeVersion is too old — the app stores data through node:sqlite, which arrived in 22.5" }
  else { Info 'node is not installed' }

  $installed = $false
  if ($SkipSystem) {
    Warn '-SkipSystem was given, so no package manager will be used'
  } elseif (Ask 'install Node 22 with winget?') {
    $installed = Install-NodeWithWinget
    if ($installed) { Ok "node $(Get-NodeVersion) installed via winget" }
    else { Warn 'winget could not do it (no winget, or it declined)' }
  }

  if (-not $installed -and -not (Test-NodeOk)) {
    if (Test-Elevated) {
      $installed = Install-NodeWithMsi
      if ($installed) { Ok "node $(Get-NodeVersion) installed from the official .msi" }
    } else {
      Info 'not running as administrator, so the .msi path is out'
    }
  }

  if (-not (Test-NodeOk)) {
    $installed = Install-NodeFromZip
    if ($installed) { Ok "node $(Get-NodeVersion) unpacked into .runtime\" }
  }

  if (-not (Test-NodeOk)) {
    Bad 'node 22.5+ is still not available.'
    Write-Host @'
   Two ways out, either works:
     . winget install OpenJS.NodeJS.LTS     (then close and reopen PowerShell)
     . download "Windows Installer (.msi)" from https://nodejs.org/en/download
   Then re-run:  powershell -ExecutionPolicy Bypass -File install\install.ps1
'@
    exit 1
  }
}

if (-not (Test-NodeOk)) { Die 'node 22.5+ is required' }
$resolvedNode = Get-NodeVersion

# ---------------------------------------------------------------------------
# 3. dependencies, build, database
# ---------------------------------------------------------------------------
Step "Web app dependencies"
if (Test-Path 'apps\web\node_modules\next') {
  Ok 'already installed — skipping (npm ci would throw them away for nothing)'
} else {
  Info 'npm ci in apps\web (a minute or two)'
  Push-Location apps\web
  try {
    if (Test-Path 'package-lock.json') { & npm ci --no-audit --no-fund } else { & npm install --no-audit --no-fund }
    if ($LASTEXITCODE -ne 0) {
      Warn 'npm ci failed, trying npm install'
      & npm install --no-audit --no-fund
    }
  } finally { Pop-Location }
  if (-not (Test-Path 'apps\web\node_modules\next')) { Die 'npm could not install the web app dependencies' }
  Ok 'installed'
}

Step "Building the web app"
if (Test-Path 'apps\web\.next\BUILD_ID') {
  Ok 'already built — skipping (delete apps\web\.next to force a rebuild)'
} else {
  Push-Location apps\web
  try { & npm run build } finally { Pop-Location }
  if (-not (Test-Path 'apps\web\.next\BUILD_ID')) { Die 'the build did not produce apps\web\.next\BUILD_ID' }
  Ok 'built'
}

Step "Configuration"
function New-Secret {
  $bytes = New-Object byte[] 18
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return ($bytes | ForEach-Object { $_.ToString('x2') }) -join ''
}

if (Test-Path 'apps\web\.env.local') {
  Ok 'apps\web\.env.local already exists — left exactly as it is'
} else {
  $envBody = @"
# Written by install/install.ps1. Yours to edit — delete it and re-run the
# installer to get fresh secrets.
APP_URL=http://localhost:$Port

# Demo accounts on /login. Turn off to see what a stranger sees.
DEMO_LOGIN=1

# A stand-in Google/Facebook/Apple with no developer console needed.
# ALLOW_PROD is needed because bin\away.cmd start runs the production build;
# it only means "this stand-in is allowed to exist on this machine". Delete both
# lines (and set real client ids) before anything is deployed.
OAUTH_MOCK=1
OAUTH_MOCK_ALLOW_PROD=1

# Signs the one-off links and the webhook. Generated, not shared.
INGEST_TOKEN=$(New-Secret)
DIGEST_TOKEN=$(New-Secret)
PAYMENT_WEBHOOK_SECRET=$(New-Secret)

# Leave empty to keep payments in the sandbox. Set both to use Stripe.
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
"@
  Set-Content -Path 'apps\web\.env.local' -Value $envBody -Encoding utf8
  Ok 'wrote apps\web\.env.local with generated secrets'
}

New-Item -ItemType Directory -Force -Path '.away\logs' | Out-Null
if (Test-Path '.away\env') {
  Ok '.away\env already exists — left alone'
} else {
  $awayEnv = @"
# Read by bin\away.ps1 (start/stop/status/logs). Not read by Next.
AWAY_PORT=$Port
AWAY_OUTREACH_PORT=$OutreachPort

# The outreach tool has its own password: it is the only part of this that can
# talk to the outside world (email), so it is deliberately separate.
OUTREACH_PASSWORD=$(New-Secret)
OUTREACH_SECRET=$(New-Secret)

# A real postal address is required in every commercial email. Empty means
# "simulate and write .eml files", which is the default and is fine.
OUTREACH_POSTAL_ADDRESS=
"@
  Set-Content -Path '.away\env' -Value $awayEnv -Encoding utf8
  Ok 'wrote .away\env (ports, outreach password, signing key)'
}

Step "Building the database from lib\schema.ts"
Info 'the app creates its own tables on the first request — this boots it on a spare port and asks it for a page'
Push-Location apps\web
try { & node --no-warnings scripts\db-init.mjs } finally { Pop-Location }
if ($LASTEXITCODE -ne 0) { Die 'the database could not be created' }
Ok 'database ready at apps\web\data\away.db'

# ---------------------------------------------------------------------------
# 4. browser + the click-through test
# ---------------------------------------------------------------------------
$runE2E = -not $NoE2E
$installBrowser = -not $NoBrowser

if ($installBrowser) {
  Step "Test dependencies"
  if (Test-Path 'e2e\node_modules\@playwright') {
    Ok 'already installed'
  } else {
    Info 'npm ci in e2e\'
    Push-Location e2e
    try {
      if (Test-Path 'package-lock.json') { & npm ci --no-audit --no-fund } else { & npm install --no-audit --no-fund }
    } finally { Pop-Location }
    if (-not (Test-Path 'e2e\node_modules\@playwright')) { Die 'npm could not install the test dependencies' }
    Ok 'installed'
  }

  Step "A headless browser"
  if ($haveBrowser) {
    Ok 'Playwright''s browser is already cached'
  } else {
    Info 'npx playwright install chromium (about 150 MB, once)'
    Push-Location e2e
    try { & npx --yes playwright install chromium } catch { Warn 'the download failed' } finally { Pop-Location }

    $nowCached = (Test-Path $pwCache) -and ((Get-ChildItem $pwCache -ErrorAction SilentlyContinue | Measure-Object).Count -gt 0)
    if ($nowCached) {
      Ok 'browser downloaded'
    } elseif ($haveEdge) {
      Warn 'could not download Chromium — using the Microsoft Edge that ships with Windows'
      $env:AWAY_E2E_CHANNEL = 'msedge'
    } else {
      Warn 'no browser available for the test. Install it later with:  cd e2e; npx playwright install chromium'
      $runE2E = $false
    }
  }
}

$e2eResult = 'skipped'
if ($runE2E) {
  Step "The click-through test (this starts both servers itself)"
  Info 'sign in · join · chat · book · pay · share · post · moderate · approve a city · send a letter'
  Push-Location e2e
  try { & npm test } finally { Pop-Location }
  if ($LASTEXITCODE -eq 0) {
    $e2eResult = 'passed'
    Ok 'every journey worked in a real browser'
  } else {
    $e2eResult = 'failed'
    Warn 'the browser test did not pass — the app itself is installed and runnable.'
    Warn 'the report is in e2e\playwright-report\ (open it with: cd e2e; npm run report)'
  }
}

# ---------------------------------------------------------------------------
# 5. what you have
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "  Away is installed" -ForegroundColor Green
Write-Host ""
Write-Host "  Start it            bin\away.cmd start --open" -ForegroundColor White
Write-Host "  Stop it             bin\away.cmd stop"
Write-Host "  Logs                bin\away.cmd logs"
Write-Host "  Run the test again  cd e2e; npm test"
Write-Host ""
Write-Host "  Web app    http://localhost:$Port"
Write-Host "  Outreach   http://localhost:$OutreachPort  (password in .away\env)"
Write-Host ""
Write-Host "  Demo accounts on /login (password away1234):"
Write-Host "    marta@away.app        traveller in Lisbon"
Write-Host "    ana@homelisbon.pt     hostel front desk"
Write-Host "    ops@away.app          ops / city approvals"
Write-Host ""
Write-Host "  Config   apps\web\.env.local (app) · .away\env (ports, outreach)"
Write-Host "  Node     $resolvedNode"
Write-Host "  Browser test  $e2eResult"
Write-Host ""

if ($e2eResult -eq 'failed') { exit 2 }
exit 0
