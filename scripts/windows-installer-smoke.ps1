param(
  [string]$Version = "0.1.0-alpha.3",
  [string]$Repo = "syobon211/vivi2d",
  [string]$WorkDir = "",
  [int]$InstallPauseSeconds = 10,
  [int]$LaunchSeconds = 8,
  [switch]$UninstallExisting,
  [switch]$KeepInstall
)

$ErrorActionPreference = "Stop"

function Assert-Windows {
  if ([System.Environment]::OSVersion.Platform -ne [System.PlatformID]::Win32NT) {
    throw "windows-installer-smoke.ps1 must run on Windows."
  }
}

function Assert-Command($Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $Name"
  }
}

function Write-Step($Message) {
  Write-Host ""
  Write-Host "==> $Message"
}

function Split-CommandLine($Command) {
  if ([string]::IsNullOrWhiteSpace($Command)) {
    throw "Cannot parse an empty command line."
  }
  if ($Command -match '^\s*"([^"]+)"\s*(.*)$') {
    return @($Matches[1], $Matches[2])
  }
  if ($Command -match '^\s*(\S+)\s*(.*)$') {
    return @($Matches[1], $Matches[2])
  }
  throw "Cannot parse command line: $Command"
}

function Get-Vivi2DUninstallEntries {
  $roots = @(
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
  )

  Get-ItemProperty $roots -ErrorAction SilentlyContinue |
    Where-Object { $_.DisplayName -in @("Vivi2D", "Vivi2DViewer", "Vivi2D Viewer") -or $_.DisplayName -match '^Vivi2D' } |
    Select-Object DisplayName, DisplayVersion, UninstallString, QuietUninstallString
}

function Invoke-QuietUninstall($Entry) {
  $command = $Entry.QuietUninstallString
  if ([string]::IsNullOrWhiteSpace($command)) {
    $command = $Entry.UninstallString
  }
  if ([string]::IsNullOrWhiteSpace($command)) {
    throw "No uninstall command for $($Entry.DisplayName)."
  }

  $parts = Split-CommandLine $command
  $exe = $parts[0]
  $args = $parts[1]
  if ($args -notmatch '(^|\s)/S(\s|$)') {
    $args = "$args /S".Trim()
  }

  Write-Step "Uninstalling existing $($Entry.DisplayName)"
  $process = Start-Process -FilePath $exe -ArgumentList $args -Wait -PassThru
  if ($process.ExitCode -ne 0) {
    throw "$($Entry.DisplayName) uninstall failed with exit code $($process.ExitCode)."
  }
}

function Assert-CleanInstallTarget($UninstallExisting) {
  $entries = @(Get-Vivi2DUninstallEntries)
  $installDirs = @(
    (Join-Path $env:LOCALAPPDATA "Programs\Vivi2D"),
    (Join-Path $env:LOCALAPPDATA "Programs\vivi2d-viewer")
  )
  $existingDirs = @($installDirs | Where-Object { Test-Path -LiteralPath $_ })

  if (($entries.Count -gt 0 -or $existingDirs.Count -gt 0) -and -not $UninstallExisting) {
    $detail = @()
    $detail += $entries | ForEach-Object { "registry: $($_.DisplayName) $($_.DisplayVersion)" }
    $detail += $existingDirs | ForEach-Object { "directory: $_" }
    throw "Existing Vivi2D install detected. Re-run on a clean VM or pass -UninstallExisting. Found: $($detail -join '; ')"
  }

  if ($UninstallExisting) {
    foreach ($entry in $entries) {
      Invoke-QuietUninstall $entry
      Start-Sleep -Seconds 3
    }
  }
}

function Get-Checksum($Lines, $Algorithm, $FileName) {
  foreach ($line in $Lines) {
    if ($line -match "^$Algorithm\s+([0-9a-fA-F]+)\s+(.+)$") {
      if ($Matches[2] -eq $FileName) {
        return $Matches[1].ToLowerInvariant()
      }
    }
  }
  throw "Missing $Algorithm checksum entry for $FileName."
}

function Assert-Checksum($AssetDir, $Checksums, $Algorithm, $FileName) {
  $path = Join-Path $AssetDir $FileName
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Downloaded asset is missing: $path"
  }

  $expected = Get-Checksum $Checksums $Algorithm $FileName
  $actual = (Get-FileHash -Algorithm $Algorithm.ToUpperInvariant() -LiteralPath $path).Hash.ToLowerInvariant()
  if ($expected -ne $actual) {
    throw "$Algorithm mismatch for $FileName. expected=$expected actual=$actual"
  }

  [pscustomobject]@{
    File = $FileName
    Algorithm = $Algorithm
    Hash = $actual
    Status = "OK"
  }
}

function Invoke-Installer($Label, $Path) {
  Write-Step "Installing $Label"
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Missing installer: $Path"
  }

  # Do not use -WindowStyle Hidden here. The supported smoke path mirrors the
  # user-facing quiet installer behavior and avoids NSIS helper crashes seen in
  # local alpha verification.
  $process = Start-Process -FilePath $Path -ArgumentList "/S" -Wait -PassThru
  if ($process.ExitCode -ne 0) {
    throw "$Label installer failed with exit code $($process.ExitCode)."
  }
}

function Get-ProcessTreeIds([int]$RootPid) {
  $all = @(Get-CimInstance Win32_Process)
  $ids = New-Object System.Collections.Generic.List[int]
  $queue = New-Object System.Collections.Generic.Queue[int]
  $queue.Enqueue($RootPid)

  while ($queue.Count -gt 0) {
    $id = $queue.Dequeue()
    if ($ids.Contains($id)) {
      continue
    }
    $ids.Add($id)
    foreach ($child in $all | Where-Object { $_.ParentProcessId -eq $id }) {
      $queue.Enqueue([int]$child.ProcessId)
    }
  }

  return @($ids)
}

function Test-AppLaunchNetwork($Label, $ExePath, $LaunchSeconds) {
  Write-Step "Launching $Label and checking app-owned TCP connections"
  if (-not (Test-Path -LiteralPath $ExePath)) {
    throw "Missing executable for ${Label}: $ExePath"
  }

  $process = Start-Process -FilePath $ExePath -PassThru
  Start-Sleep -Seconds $LaunchSeconds

  $pids = @(Get-ProcessTreeIds -RootPid $process.Id)
  $processRows = @(Get-CimInstance Win32_Process | Where-Object { $pids -contains $_.ProcessId })
  $connections = @(
    Get-NetTCPConnection -ErrorAction SilentlyContinue |
      Where-Object { $pids -contains $_.OwningProcess -and $_.State -ne "Listen" } |
      Select-Object OwningProcess, State, LocalAddress, LocalPort, RemoteAddress, RemotePort
  )

  Stop-Process -Id $pids -Force -ErrorAction SilentlyContinue

  [pscustomobject]@{
    App = $Label
    RootPid = $process.Id
    ProcessCount = $processRows.Count
    NonListeningTcpConnections = $connections.Count
    ProcessNames = ((@($processRows | ForEach-Object { $_.Name }) | Sort-Object -Unique) -join ", ")
    Connections = ((@($connections | ForEach-Object { "$($_.State) $($_.RemoteAddress):$($_.RemotePort) pid=$($_.OwningProcess)" })) -join "; ")
    Status = if ($connections.Count -eq 0) { "OK" } else { "FAILED" }
  }
}

function Invoke-InstalledUninstall($Label, $UninstallerPath) {
  Write-Step "Uninstalling $Label"
  if (-not (Test-Path -LiteralPath $UninstallerPath)) {
    throw "Missing uninstaller for ${Label}: $UninstallerPath"
  }

  $process = Start-Process -FilePath $UninstallerPath -ArgumentList "/S" -Wait -PassThru
  if ($process.ExitCode -ne 0) {
    throw "$Label uninstaller failed with exit code $($process.ExitCode)."
  }
}

Assert-Windows
Assert-Command "gh"

if ([string]::IsNullOrWhiteSpace($WorkDir)) {
  $WorkDir = Join-Path $env:TEMP "vivi2d-windows-installer-smoke-$Version"
}

$releaseTag = "v$Version"
$editorAsset = "vivi2d-$Version-windows-x64-setup.exe"
$viewerAsset = "vivi2d-viewer-$Version-windows-x64-setup.exe"
$checksumsAsset = "checksums.txt"
$editorDir = Join-Path $env:LOCALAPPDATA "Programs\Vivi2D"
$viewerDir = Join-Path $env:LOCALAPPDATA "Programs\vivi2d-viewer"
$editorExe = Join-Path $editorDir "Vivi2D.exe"
$viewerExe = Join-Path $viewerDir "Vivi2DViewer.exe"
$editorUninstaller = Join-Path $editorDir "Uninstall Vivi2D.exe"
$viewerUninstaller = Join-Path $viewerDir "Uninstall Vivi2DViewer.exe"

Write-Step "Preparing smoke work directory"
Remove-Item -LiteralPath $WorkDir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $WorkDir | Out-Null

Assert-CleanInstallTarget -UninstallExisting:$UninstallExisting

Write-Step "Downloading $releaseTag installer assets from $Repo"
gh release download $releaseTag --repo $Repo --dir $WorkDir --pattern $checksumsAsset --pattern $editorAsset --pattern $viewerAsset --clobber
if ($LASTEXITCODE -ne 0) {
  throw "gh release download failed."
}

Write-Step "Verifying checksums"
$checksumLines = Get-Content -LiteralPath (Join-Path $WorkDir $checksumsAsset)
$checksumResults = @()
foreach ($asset in @($editorAsset, $viewerAsset)) {
  $checksumResults += Assert-Checksum $WorkDir $checksumLines "sha256" $asset
  $checksumResults += Assert-Checksum $WorkDir $checksumLines "sha512" $asset
}
$checksumResults | Format-Table -AutoSize

Invoke-Installer "Vivi2D Editor" (Join-Path $WorkDir $editorAsset)
Start-Sleep -Seconds $InstallPauseSeconds
Invoke-Installer "Vivi2D Viewer" (Join-Path $WorkDir $viewerAsset)

Write-Step "Checking installed files"
foreach ($path in @($editorExe, $viewerExe, $editorUninstaller, $viewerUninstaller)) {
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Expected installed file is missing: $path"
  }
}

$networkResults = @()
$networkResults += Test-AppLaunchNetwork "Editor" $editorExe $LaunchSeconds
Start-Sleep -Seconds 3
$networkResults += Test-AppLaunchNetwork "Viewer" $viewerExe $LaunchSeconds
$networkResults | Format-Table -AutoSize
if (($networkResults | Where-Object { $_.Status -ne "OK" }).Count -gt 0) {
  throw "One or more app launches created non-listening TCP connections."
}

if (-not $KeepInstall) {
  Invoke-InstalledUninstall "Vivi2D Viewer" $viewerUninstaller
  Start-Sleep -Seconds 3
  Invoke-InstalledUninstall "Vivi2D Editor" $editorUninstaller

  Write-Step "Checking uninstall results"
  $installDirs = @($editorDir, $viewerDir)
  $remainingInstallDirs = @($installDirs | Where-Object { Test-Path -LiteralPath $_ })
  if ($remainingInstallDirs.Count -gt 0) {
    throw "Install directory remained after uninstall: $($remainingInstallDirs -join '; ')"
  }
}

$userDataPaths = @(
  (Join-Path $env:APPDATA "Vivi2D"),
  (Join-Path $env:APPDATA "Vivi2DViewer"),
  (Join-Path $env:LOCALAPPDATA "Vivi2D"),
  (Join-Path $env:LOCALAPPDATA "Vivi2DViewer")
) | ForEach-Object {
  [pscustomobject]@{
    Path = $_
    Exists = (Test-Path -LiteralPath $_)
  }
}

Write-Step "User data remnants"
$userDataPaths | Format-Table -AutoSize

Write-Step "Windows installer smoke passed"
[pscustomobject]@{
  Version = $Version
  Repo = $Repo
  WorkDir = $WorkDir
  EditorAsset = $editorAsset
  ViewerAsset = $viewerAsset
  NetworkCheck = "No app-owned non-listening TCP connections"
  InstallState = if ($KeepInstall) { "kept installed" } else { "uninstalled" }
} | Format-List
