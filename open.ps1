$ErrorActionPreference = 'Stop'
$appUrl = 'http://localhost:4173'
$mutex = New-Object System.Threading.Mutex($false, 'Local\REinterestLauncher4173')
$locked = $false

function Test-AppReady {
    try {
        $page = Invoke-WebRequest -Uri $appUrl -UseBasicParsing -TimeoutSec 2
        if ($page.Content -match '<title>有数 · 个人资产手账</title>') { return $true }
        throw 'Port 4173 is used by another app. Close that app and try again.'
    } catch [System.Net.WebException] {
        if ($_.Exception.Response) { throw 'Port 4173 is used by another app. Close that app and try again.' }
        return $false
    }
}

try {
    try { $locked = $mutex.WaitOne(20000) }
    catch [System.Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) { throw 'Another launch is still running. Please try again in a moment.' }
    if (-not (Test-AppReady)) {
        $node = Get-Command node.exe -ErrorAction SilentlyContinue
        if (-not $node) { throw 'Please install Node.js from https://nodejs.org and try again.' }
        $server = Start-Process -FilePath $node.Source -ArgumentList ('"' + (Join-Path $PSScriptRoot 'server.mjs') + '"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $PSScriptRoot 'server-output.log') -RedirectStandardError (Join-Path $PSScriptRoot 'server-error.log') -PassThru
        $deadline = [DateTime]::UtcNow.AddSeconds(15)
        while (-not (Test-AppReady)) {
            if ($server.HasExited) { throw 'The app could not start. See server-error.log in the app folder.' }
            if ([DateTime]::UtcNow -gt $deadline) { throw 'The app took too long to start. See server-error.log in the app folder.' }
            Start-Sleep -Milliseconds 200
        }
    }
    Start-Process $appUrl
} catch {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'REinterest', 'OK', 'Error') | Out-Null
    exit 1
} finally {
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
