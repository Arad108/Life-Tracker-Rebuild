# Starts the Life Tracker emulator and waits until Android is fully booted.
$ErrorActionPreference = 'Continue'

$env:ANDROID_HOME = 'D:\Android\Sdk'
$env:ANDROID_SDK_ROOT = 'D:\Android\Sdk'
$env:ANDROID_AVD_HOME = 'D:\Android\AVD'
$env:ANDROID_USER_HOME = 'D:\Android\.android'
$env:JAVA_HOME = 'D:\Android\Android Studio\jbr'
$env:GRADLE_USER_HOME = 'D:\Android\Gradle'

$adb = Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe'
$emulator = Join-Path $env:ANDROID_HOME 'emulator\emulator.exe'
$avd = 'LifeTracker_Pixel7'

& $adb start-server | Out-Null
$running = (& $adb devices) -match 'emulator-\d+\s+device'
if (-not $running) {
  Write-Host "Starting $avd..."
  Start-Process -FilePath $emulator -ArgumentList @(
    '-avd', $avd, '-no-snapshot', '-no-boot-anim',
    '-gpu', 'host', '-netdelay', 'none', '-netspeed', 'full'
  ) -WindowStyle Normal
} else {
  Write-Host "Emulator already running."
}

Write-Host "Waiting for boot..."
$deadline = (Get-Date).AddSeconds(240)
while ((Get-Date) -lt $deadline) {
  $state = (& $adb get-state 2>&1) -join ''
  if ($state -match 'device') {
    $booted = ((& $adb shell getprop sys.boot_completed 2>&1) -join '').Trim()
    if ($booted -eq '1') {
      Write-Host "Booted: $(& $adb shell getprop ro.product.model) / API $(& $adb shell getprop ro.build.version.sdk)"
      exit 0
    }
  }
  Start-Sleep -Seconds 4
}
Write-Error "Emulator did not boot within 240s."
exit 1
