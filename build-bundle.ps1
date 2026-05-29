# Reconstruit js/bundle.js depuis les modules ES (ordre des dependances)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$js = Join-Path $root 'js'
$order = @(
  'firebase-sync.js',
  'storage.js',
  'validate.js',
  'reports.js',
  'payroll.js',
  'insights.js',
  'inventory.js',
  'receipts.js',
  'sales.js',
  'credit.js',
  'stock-sync.js',
  'help.js',
  'ui-transactions.js',
  'ui-payroll.js',
  'app.js'
)

function Strip-ModuleSyntax([string]$text) {
  $lines = $text -split "`r?`n"
  $out = New-Object System.Collections.Generic.List[string]
  $skipExportBrace = $false
  $skipImport = $false
  foreach ($line in $lines) {
    if (-not $skipImport -and $line -match '^\s*import\s+') {
      if ($line -match '\sfrom\s+[''"]') { continue }
      $skipImport = $true
      continue
    }
    if ($skipImport) {
      if ($line -match '\sfrom\s+[''"][^''"]+[''"]\s*;?\s*$') { $skipImport = $false }
      continue
    }
    if ($line -match '^\s*export\s+\{') { $skipExportBrace = $true; continue }
    if ($skipExportBrace) {
      if ($line -match '\}\s*;?\s*$') { $skipExportBrace = $false }
      continue
    }
    $line = $line -replace '^\s*export\s+default\s+', ''
    $line = $line -replace '^\s*export\s+(?=function|const|let|var|class|async)', ''
    $out.Add($line)
  }
  return ($out -join "`n")
}

$parts = [System.Collections.Generic.List[string]]::new()
$parts.Add("'use strict';`n")
foreach ($name in $order) {
  $path = Join-Path $js $name
  if (-not (Test-Path $path)) { throw "Missing $path" }
  $parts.Add((Strip-ModuleSyntax (Get-Content -Path $path -Raw -Encoding UTF8)))
  $parts.Add("`n")
}

$bundle = Join-Path $js 'bundle.js'
[System.IO.File]::WriteAllText($bundle, ($parts -join ''), [System.Text.UTF8Encoding]::new($false))
Write-Host "OK: $bundle ($((Get-Item $bundle).Length) bytes)"
