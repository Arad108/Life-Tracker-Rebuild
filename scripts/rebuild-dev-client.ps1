# Rebuilds and installs the debug development client on the running emulator.
# Only needed after native dependency or native config changes.
$ErrorActionPreference = 'Continue'

$env:ANDROID_HOME = 'D:\Android\Sdk'
$env:ANDROID_SDK_ROOT = 'D:\Android\Sdk'
$env:JAVA_HOME = 'D:\Android\Android Studio\jbr'
$env:GRADLE_USER_HOME = 'D:\Android\Gradle'
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"

Set-Location 'D:\Life Tracker App\android'
Write-Host "Building x86_64 debug APK..."
& .\gradlew.bat app:installDebug -PreactNativeArchitectures=x86_64 --console=plain
if ($LASTEXITCODE -ne 0) { Write-Error "Build failed."; exit $LASTEXITCODE }

& (Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe') reverse tcp:8081 tcp:8081 | Out-Null
& (Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe') shell am start -n com.lifetracker.app/.MainActivity | Out-Null
Write-Host "Installed and launched. Start Metro with .\scripts\start-metro.ps1 if it is not running."
