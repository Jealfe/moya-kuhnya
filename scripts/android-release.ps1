param(
  [string]$JavaHome = "$env:USERPROFILE\.gradle\jdks\eclipse_adoptium-21-amd64-windows.2",
  [string]$AndroidHome = "$env:LOCALAPPDATA\Android\Sdk"
)
$ErrorActionPreference = 'Stop'
function Check-Exit { if ($LASTEXITCODE -ne 0) { throw "Build command failed ($LASTEXITCODE)." } }
$keys = Join-Path $env:LOCALAPPDATA 'MoyaKuhnyaSigning'
$key = Join-Path $keys 'release.p12'
$passwordFile = Join-Path $keys 'password.dpapi'
if (!(Test-Path -LiteralPath $key) -or !(Test-Path -LiteralPath $passwordFile)) {
  throw 'The existing local signing key is required. Restore it before building an update.'
}
$env:JAVA_HOME = $JavaHome
$env:ANDROID_HOME = $AndroidHome
$tools = Join-Path $AndroidHome 'build-tools\36.0.0'
Push-Location (Join-Path $PSScriptRoot '..')
try {
  if (!(Test-Path 'node_modules/@capacitor/cli')) { npm.cmd ci; Check-Exit }
  npm.cmd test
  Check-Exit
  npm.cmd run android:sync
  Check-Exit
  Push-Location android
  try { .\gradlew.bat assembleRelease testReleaseUnitTest --console=plain; Check-Exit }
  finally { Pop-Location }
  $unsigned = 'android/app/build/outputs/apk/release/app-release-unsigned.apk'
  $version = [regex]::Match((Get-Content android/app/build.gradle -Raw),'versionName\s+"([^"]+)"').Groups[1].Value
  if (!$version) { throw 'APK version is missing.' }
  New-Item -ItemType Directory -Force delivery | Out-Null
  $staging = New-Item -ItemType Directory -Path (Join-Path $env:TEMP ('kitchen-release-'+[guid]::NewGuid().ToString('N')))
  try {
    $aligned = Join-Path $staging.FullName 'aligned.apk'
    $signed = Join-Path $staging.FullName 'signed.apk'
    & (Join-Path $tools 'zipalign.exe') -f -P 16 4 $unsigned $aligned
    Check-Exit
    $password = Get-Content -LiteralPath $passwordFile | ConvertTo-SecureString
    $env:KITCHEN_SIGN_PASSWORD = [Net.NetworkCredential]::new('', $password).Password
    try {
      & (Join-Path $tools 'apksigner.bat') sign --ks $key --ks-key-alias kitchen --ks-pass env:KITCHEN_SIGN_PASSWORD --out $signed $aligned
      Check-Exit
    } finally { Remove-Item Env:KITCHEN_SIGN_PASSWORD }
    & (Join-Path $tools 'apksigner.bat') verify --print-certs $signed
    Check-Exit
    Copy-Item -LiteralPath $signed -Destination "delivery/MoyaKuhnya-$version.apk" -Force
    Get-Item -LiteralPath "delivery/MoyaKuhnya-$version.apk"
  } finally { Remove-Item -LiteralPath (Join-Path $staging.FullName 'aligned.apk'),(Join-Path $staging.FullName 'signed.apk'),(Join-Path $staging.FullName 'signed.apk.idsig') -ErrorAction SilentlyContinue; Remove-Item -LiteralPath $staging.FullName }
} finally { Pop-Location }
