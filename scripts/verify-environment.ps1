# Prints a verifiable report of the local Android development environment.
$ErrorActionPreference = 'Continue'

$env:ANDROID_HOME = 'D:\Android\Sdk'
$env:ANDROID_SDK_ROOT = 'D:\Android\Sdk'
$env:ANDROID_AVD_HOME = 'D:\Android\AVD'
$env:ANDROID_USER_HOME = 'D:\Android\.android'
$env:JAVA_HOME = 'D:\Android\Android Studio\jbr'
$env:GRADLE_USER_HOME = 'D:\Android\Gradle'
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator;$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:Path"

$report = Join-Path 'D:\Life Tracker App\artifacts\env-setup' 'environment-report.txt'
New-Item -ItemType Directory -Force -Path (Split-Path $report) | Out-Null

function Section($name) { "`n=== $name ===" | Tee-Object -FilePath $report -Append }
function Line($text) { $text | Tee-Object -FilePath $report -Append }

Section 'WINDOWS'
Line ((Get-CimInstance Win32_OperatingSystem).Caption + ' ' + (Get-CimInstance Win32_OperatingSystem).Version)

Section 'STORAGE'
Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' |
  ForEach-Object { Line ("{0} {1:N1} GB free of {2:N1} GB" -f $_.DeviceID, ($_.FreeSpace/1GB), ($_.Size/1GB)) }

Section 'ENVIRONMENT'
foreach ($k in 'ANDROID_HOME','ANDROID_SDK_ROOT','ANDROID_AVD_HOME','ANDROID_USER_HOME','GRADLE_USER_HOME','JAVA_HOME') {
  Line ("{0}={1}" -f $k, (Get-Item "Env:$k").Value)
}

Section 'TOOLS'
Line ('java: ' + ((& "$env:JAVA_HOME\bin\java.exe" -version 2>&1) -join ' '))
Line ('adb: ' + ((& "$env:ANDROID_HOME\platform-tools\adb.exe" --version 2>&1) -join ' '))
Line ('emulator: ' + ((& "$env:ANDROID_HOME\emulator\emulator.exe" -version 2>&1) | Select-Object -First 1))
Line ('sdkmanager: ' + ((& "$env:ANDROID_HOME\cmdline-tools\latest\bin\sdkmanager.bat" --version 2>&1) -join ' '))

Section 'ACCELERATION'
Line (((& "$env:ANDROID_HOME\emulator\emulator.exe" -accel-check 2>&1) -join ' '))

Section 'INSTALLED PACKAGES'
Line (((& "$env:ANDROID_HOME\cmdline-tools\latest\bin\sdkmanager.bat" --list_installed 2>&1) |
  Select-String -Pattern 'build-tools;|emulator |ndk;|cmake;|platform-tools|platforms;|system-images;' |
  ForEach-Object { $_.Line.Trim() }) -join "`n")

Section 'AVD'
Line (((& "$env:ANDROID_HOME\cmdline-tools\latest\bin\avdmanager.bat" list avd 2>&1) -join "`n"))

Section 'DEVICE'
Line (((& "$env:ANDROID_HOME\platform-tools\adb.exe" devices 2>&1) -join ' '))
Line ('model: ' + ((& "$env:ANDROID_HOME\platform-tools\adb.exe" shell getprop ro.product.model 2>&1) -join ' '))
Line ('android: ' + ((& "$env:ANDROID_HOME\platform-tools\adb.exe" shell getprop ro.build.version.release 2>&1) -join ' '))
Line ('sdk: ' + ((& "$env:ANDROID_HOME\platform-tools\adb.exe" shell getprop ro.build.version.sdk 2>&1) -join ' '))

Section 'APP'
Line (((& "$env:ANDROID_HOME\platform-tools\adb.exe" shell pm list packages com.lifetracker.app 2>&1) -join ' '))
Line (((& "$env:ANDROID_HOME\platform-tools\adb.exe" shell dumpsys package com.lifetracker.app 2>&1) |
  Select-String -Pattern 'versionName|versionCode|firstInstallTime|lastUpdateTime' |
  ForEach-Object { $_.Line.Trim() }) -join "`n")

Write-Host "`nReport written to $report"
