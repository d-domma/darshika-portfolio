Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = "Stop"
$root = Get-ChildItem "$env:TEMP\kather" -Directory -Recurse | Where-Object { Test-Path (Join-Path $_.FullName "01_TUMOR") } | Select-Object -First 1
if (-not $root) { throw "Class folders were not found." }
$names = @("01_TUMOR","02_STROMA","03_COMPLEX","04_LYMPHO","05_DEBRIS","06_MUCOSA","07_ADIPOSE","08_EMPTY")
$ids = @("TUMOR","STROMA","COMPLEX","LYMPHO","DEBRIS","MUCOSA","ADIPOSE","EMPTY")
$n = 24
$out = Join-Path $PSScriptRoot "raw"
$tiles = Join-Path $PSScriptRoot "tiles"
New-Item -ItemType Directory -Force -Path $out, $tiles | Out-Null
$train = @()
$hold = @()

function Save-Rgb($path, $dest) {
  $src = [System.Drawing.Image]::FromFile($path)
  $bmp = New-Object System.Drawing.Bitmap $n, $n
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBilinear
  $g.DrawImage($src, 0, 0, $n, $n)
  $g.Dispose()
  $src.Dispose()
  $rect = New-Object System.Drawing.Rectangle 0, 0, $n, $n
  $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $bytes = New-Object byte[] ($data.Stride * $n)
  [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
  $bmp.UnlockBits($data)
  $bmp.Dispose()
  $rgb = New-Object byte[] ($n * $n * 3)
  for ($y = 0; $y -lt $n; $y++) {
    for ($x = 0; $x -lt $n; $x++) {
      $i = $y * $data.Stride + $x * 3
      $o = ($y * $n + $x) * 3
      $rgb[$o] = $bytes[$i + 2]
      $rgb[$o + 1] = $bytes[$i + 1]
      $rgb[$o + 2] = $bytes[$i]
    }
  }
  [System.IO.File]::WriteAllBytes($dest, $rgb)
}

for ($c = 0; $c -lt 8; $c++) {
  $dir = Join-Path $root.FullName $names[$c]
  $files = Get-ChildItem $dir -File | Select-Object -First 41
  for ($i = 0; $i -lt $files.Count; $i++) {
    $dest = Join-Path $out ("{0}-{1}.raw" -f $c, $i)
    Save-Rgb $files[$i].FullName $dest
    $line = "{0}`t{1}" -f $c, $dest
    if ($i -eq 0) {
      Copy-Item $files[$i].FullName (Join-Path $tiles ($ids[$c] + ".jpg")) -Force
      $hold += $line
    } elseif ($i -lt 9) {
      $hold += $line
    } else {
      $train += $line
    }
  }
  Write-Output $names[$c]
}

Set-Content -Path (Join-Path $PSScriptRoot "train.txt") -Value $train
Set-Content -Path (Join-Path $PSScriptRoot "hold.txt") -Value $hold
Write-Output ("train " + $train.Count + " hold " + $hold.Count)
