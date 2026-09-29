$ErrorActionPreference = "Stop"
$destDir = "$HOME\.foundry\bin"
if (-not (Test-Path $destDir)) {
    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
}
$zipPath = "$HOME\foundry_tmp.zip"
Write-Host "Downloading Foundry..."
Invoke-WebRequest -Uri "https://github.com/foundry-rs/foundry/releases/download/v1.8.3/foundry_v1.8.3_win32_amd64.zip" -OutFile $zipPath
Write-Host "Extracting to $destDir..."
Expand-Archive -Path $zipPath -DestinationPath $destDir -Force
Remove-Item $zipPath -Force
Write-Host "Done! Checking forge.exe:"
Test-Path "$destDir\forge.exe"
