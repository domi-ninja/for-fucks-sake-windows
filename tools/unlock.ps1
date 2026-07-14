param(
    [Parameter(Mandatory = $true)]
    [string]$TargetPath,

    [int]$IntervalMilliseconds = 1000,

    [switch]$Once
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$restartManagerSource = @'
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;

namespace Ffs
{
    public static class RestartManager
    {
        private const int CchRmMaxAppName = 255;
        private const int CchRmMaxServiceName = 63;
        private const int ErrorMoreData = 234;

        [StructLayout(LayoutKind.Sequential)]
        public struct RmUniqueProcess
        {
            public int ProcessId;
            public System.Runtime.InteropServices.ComTypes.FILETIME ProcessStartTime;
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        public struct RmProcessInfo
        {
            public RmUniqueProcess Process;

            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = CchRmMaxAppName + 1)]
            public string AppName;

            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = CchRmMaxServiceName + 1)]
            public string ServiceShortName;

            public uint ApplicationType;
            public uint AppStatus;
            public uint TerminalServicesSessionId;

            [MarshalAs(UnmanagedType.Bool)]
            public bool Restartable;
        }

        [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
        private static extern int RmStartSession(out uint sessionHandle, int sessionFlags, string sessionKey);

        [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
        private static extern int RmRegisterResources(
            uint sessionHandle,
            uint fileCount,
            string[] fileNames,
            uint applicationCount,
            RmUniqueProcess[] applications,
            uint serviceCount,
            string[] serviceNames);

        [DllImport("rstrtmgr.dll")]
        private static extern int RmGetList(
            uint sessionHandle,
            out uint processInfoNeeded,
            ref uint processInfoCount,
            [In, Out] RmProcessInfo[] affectedApplications,
            out uint rebootReasons);

        [DllImport("rstrtmgr.dll")]
        private static extern int RmEndSession(uint sessionHandle);

        public static RmProcessInfo[] GetLockingProcesses(string[] paths)
        {
            uint sessionHandle;
            int result = RmStartSession(out sessionHandle, 0, Guid.NewGuid().ToString("N"));
            ThrowIfFailed(result, "RmStartSession");

            try
            {
                result = RmRegisterResources(sessionHandle, (uint)paths.Length, paths, 0, null, 0, null);
                ThrowIfFailed(result, "RmRegisterResources");

                uint processInfoNeeded;
                uint processInfoCount = 0;
                uint rebootReasons;
                result = RmGetList(sessionHandle, out processInfoNeeded, ref processInfoCount, null, out rebootReasons);

                if (result == 0)
                {
                    return new RmProcessInfo[0];
                }

                if (result != ErrorMoreData)
                {
                    ThrowIfFailed(result, "RmGetList");
                }

                processInfoCount = processInfoNeeded;
                RmProcessInfo[] processInfo = new RmProcessInfo[processInfoCount];
                result = RmGetList(sessionHandle, out processInfoNeeded, ref processInfoCount, processInfo, out rebootReasons);
                ThrowIfFailed(result, "RmGetList");

                if (processInfoCount == processInfo.Length)
                {
                    return processInfo;
                }

                RmProcessInfo[] trimmedProcessInfo = new RmProcessInfo[processInfoCount];
                Array.Copy(processInfo, trimmedProcessInfo, processInfoCount);
                return trimmedProcessInfo;
            }
            finally
            {
                RmEndSession(sessionHandle);
            }
        }

        private static void ThrowIfFailed(int result, string operation)
        {
            if (result != 0)
            {
                throw new Win32Exception(result, operation + " failed");
            }
        }
    }
}
'@

if (-not ('Ffs.RestartManager' -as [type])) {
    Add-Type -TypeDefinition $restartManagerSource
}

function Get-ResourcePaths {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    $fullPath = [System.IO.Path]::GetFullPath($Path)

    if ([System.IO.File]::Exists($fullPath)) {
        return ,$fullPath
    }

    if (-not [System.IO.Directory]::Exists($fullPath)) {
        throw "Target does not exist: $Path"
    }

    $resourcePaths = [System.Collections.Generic.List[string]]::new()
    $pendingDirectories = [System.Collections.Generic.Stack[string]]::new()
    $resourcePaths.Add($fullPath)
    $pendingDirectories.Push($fullPath)

    while ($pendingDirectories.Count -gt 0) {
        $directory = $pendingDirectories.Pop()

        foreach ($entry in [System.IO.Directory]::EnumerateFileSystemEntries($directory)) {
            $resourcePaths.Add($entry)

            if ([System.IO.Directory]::Exists($entry)) {
                $pendingDirectories.Push($entry)
            }
        }
    }

    return $resourcePaths.ToArray()
}

function Get-LockingProcessInfo {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$ResourcePaths
    )

    $batchSize = 256
    $processesById = @{}

    for ($index = 0; $index -lt $ResourcePaths.Count; $index += $batchSize) {
        $count = [Math]::Min($batchSize, $ResourcePaths.Count - $index)
        $batch = [string[]]::new($count)
        [Array]::Copy($ResourcePaths, $index, $batch, 0, $count)

        foreach ($processInfo in [Ffs.RestartManager]::GetLockingProcesses($batch)) {
            $processesById[$processInfo.Process.ProcessId] = $processInfo
        }
    }

    return $processesById.Values
}

function Stop-LockingProcesses {
    param(
        [Parameter(Mandatory = $true)]
        [object[]]$ProcessInfo
    )

    $hadError = $false

    foreach ($info in $ProcessInfo | Sort-Object { $_.Process.ProcessId }) {
        $processId = $info.Process.ProcessId

        if ($processId -eq $PID) {
            continue
        }

        try {
            $process = Get-Process -Id $processId -ErrorAction Stop
            $displayName = if ([string]::IsNullOrWhiteSpace($info.AppName)) { $process.ProcessName } else { $info.AppName }
            Write-Host "Killing $displayName ($processId)"
            Stop-Process -Id $processId -Force -ErrorAction Stop
        }
        catch [Microsoft.PowerShell.Commands.ProcessCommandException] {
        }
        catch {
            $hadError = $true
            Write-Error $_
        }
    }

    return -not $hadError
}

if ($IntervalMilliseconds -le 0) {
    throw 'IntervalMilliseconds must be a positive integer.'
}

if (-not $Once) {
    Write-Host "Watching $TargetPath for locking processes. Press Ctrl+C to stop."
}

while ($true) {
    $resourcePaths = Get-ResourcePaths -Path $TargetPath
    $lockingProcesses = @(Get-LockingProcessInfo -ResourcePaths $resourcePaths)

    if ($lockingProcesses.Count -eq 0) {
        if ($Once) {
            Write-Host "No locking processes found for $TargetPath."
            exit 0
        }

        Start-Sleep -Milliseconds $IntervalMilliseconds
        continue
    }

    $success = Stop-LockingProcesses -ProcessInfo $lockingProcesses

    if ($Once) {
        if ($success) {
            exit 0
        }

        exit 1
    }

    Start-Sleep -Milliseconds $IntervalMilliseconds
}