# Starts the Metro bundler for the installed development build.
$ErrorActionPreference = 'Continue'

$env:ANDROID_HOME = 'D:\Android\Sdk'
$env:ANDROID_SDK_ROOT = 'D:\Android\Sdk'
$env:JAVA_HOME = 'D:\Android\Android Studio\jbr'

Set-Location 'D:\Life Tracker App'

# Make sure the emulator can reach Metro on the host.
& (Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe') reverse tcp:8081 tcp:8081 2>$null | Out-Null

Write-Host "Metro: http://localhost:8081  (Fast Refresh enabled)"
npx expo start --dev-client --port 8081
