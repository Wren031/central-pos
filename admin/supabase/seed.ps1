<#
.SYNOPSIS
  Seeds the Central POS Supabase database — all SQL files, in order.

.DESCRIPTION
  Two ways to authenticate (pick ONE):

  A) Supabase access token (Management API — recommended)
     Create one at: https://supabase.com/dashboard/account/tokens
       .\seed.ps1 -Token <your-access-token>

  B) Database password (direct Postgres via Docker)
     The password you set when creating the project
     (Dashboard -> Settings -> Database)
       .\seed.ps1 -DbPassword <your-db-password>

  Passwords with special characters (# @ ! %) must be URL-encoded
  in mode B — prefer mode A if unsure.

.EXAMPLE
  .\seed.ps1 -Token sbp_abc123...

.EXAMPLE
  .\seed.ps1 -DbPassword 'my-db-password'
#>
param(
  [string]$Token,
  [string]$DbPassword,
  [string]$ProjectRef = 'rkpetffnstnmwwaevzmd',
  [string]$DbHost = "db.$ProjectRef.supabase.co"
)

$ErrorActionPreference = 'Stop'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$files = @('01_schema.sql', '02_rls.sql', '03_functions.sql', '04_seed.sql', '05_categories_migration.sql', '06_releases.sql')

if (-not $Token -and -not $DbPassword) {
  Write-Error 'Provide -Token <supabase-access-token> OR -DbPassword <database-password>. See .SYNOPSIS above.'
}

foreach ($f in $files) {
  $path = Join-Path $dir $f
  if (-not (Test-Path $path)) { Write-Error "Missing file: $path" }
  $sql = Get-Content -Raw -LiteralPath $path

  if ($Token) {
    $body = @{ query = $sql } | ConvertTo-Json -Depth 5
    try {
      Invoke-RestMethod `
        -Uri "https://api.supabase.com/v1/projects/$ProjectRef/database/query" `
        -Method Post `
        -Headers @{ Authorization = "Bearer $Token" } `
        -ContentType 'application/json' `
        -Body $body `
        -TimeoutSec 180 | Out-Null
    }
    catch {
      $resp = $_.Exception.Response
      $msg = $_.Exception.Message
      if ($resp) {
        $sr = New-Object System.IO.StreamReader($resp.GetResponseStream())
        $msg = $sr.ReadToEnd()
      }
      Write-Error "FAILED on ${f}: $msg"
    }
    Write-Host "OK  $f" -ForegroundColor Green
  }
  else {
    # URL-encode special chars in the password (@ -> %40, # -> %23, etc.)
    $enc = [uri]::EscapeDataString($DbPassword)
    $conn = "postgresql://postgres:$enc@$($DbHost):5432/postgres"
    $sql | docker run --rm -i postgres:17-alpine `
      psql $conn -v ON_ERROR_STOP=1 -q -f - 2>&1 | ForEach-Object { Write-Host "  $_" }
    if ($LASTEXITCODE -ne 0) { Write-Error "FAILED on $f (psql exit $LASTEXITCODE)" }
    Write-Host "OK  $f" -ForegroundColor Green
  }
}

Write-Host ''
Write-Host 'Seed complete. Admin login: javierrenren1@gmail.com / monteroTzy31' -ForegroundColor Cyan
Write-Host 'Next: change that password in Settings -> Admin profile.' -ForegroundColor Yellow
