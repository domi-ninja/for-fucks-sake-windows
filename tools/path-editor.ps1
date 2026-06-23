Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class FfsEnvironmentChange {
    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    public static extern IntPtr SendMessageTimeout(
        IntPtr hWnd,
        uint Msg,
        UIntPtr wParam,
        string lParam,
        uint fuFlags,
        uint uTimeout,
        out UIntPtr lpdwResult);
}
"@

$ErrorActionPreference = 'Stop'

function Get-SelectedScope {
    if ($scopeSelect.SelectedItem -eq 'Machine') {
        return [EnvironmentVariableTarget]::Machine
    }

    return [EnvironmentVariableTarget]::User
}

function Get-PathEntries([EnvironmentVariableTarget]$target) {
    $pathValue = [Environment]::GetEnvironmentVariable('Path', $target)

    if ([string]::IsNullOrWhiteSpace($pathValue)) {
        return @()
    }

    return $pathValue -split ';' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
}

function Set-PathEntries([EnvironmentVariableTarget]$target, [string[]]$entries) {
    [Environment]::SetEnvironmentVariable('Path', ($entries -join ';'), $target)

    $result = [UIntPtr]::Zero
    [void][FfsEnvironmentChange]::SendMessageTimeout(
        [IntPtr]0xffff,
        0x001A,
        [UIntPtr]::Zero,
        'Environment',
        0x0002,
        5000,
        [ref]$result)
}

function Load-Entries {
    $entryList.Items.Clear()

    foreach ($entry in (Get-PathEntries (Get-SelectedScope))) {
        [void]$entryList.Items.Add($entry)
    }

    $entryText.Clear()
    $statusLabel.Text = "Loaded $($scopeSelect.SelectedItem) Path."
}

function Get-ListEntries {
    $entries = New-Object System.Collections.Generic.List[string]

    foreach ($item in $entryList.Items) {
        $entries.Add([string]$item)
    }

    return $entries.ToArray()
}

function Require-EntryText {
    $value = $entryText.Text.Trim()

    if ([string]::IsNullOrWhiteSpace($value)) {
        [System.Windows.Forms.MessageBox]::Show(
            'Enter a Path entry first.',
            'ffs Path',
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Information) | Out-Null
        return $null
    }

    return $value
}

function Move-SelectedEntry([int]$offset) {
    $index = $entryList.SelectedIndex

    if ($index -lt 0) {
        return
    }

    $newIndex = $index + $offset

    if ($newIndex -lt 0 -or $newIndex -ge $entryList.Items.Count) {
        return
    }

    $item = $entryList.Items[$index]
    $entryList.Items.RemoveAt($index)
    $entryList.Items.Insert($newIndex, $item)
    $entryList.SelectedIndex = $newIndex
}

[System.Windows.Forms.Application]::EnableVisualStyles()

$form = New-Object System.Windows.Forms.Form
$form.Text = 'ffs Path Editor'
$form.StartPosition = 'CenterScreen'
$form.MinimumSize = New-Object System.Drawing.Size(760, 520)
$form.Size = New-Object System.Drawing.Size(820, 560)

$scopeLabel = New-Object System.Windows.Forms.Label
$scopeLabel.Text = 'Scope'
$scopeLabel.Location = New-Object System.Drawing.Point(12, 16)
$scopeLabel.Size = New-Object System.Drawing.Size(45, 22)

$scopeSelect = New-Object System.Windows.Forms.ComboBox
$scopeSelect.DropDownStyle = [System.Windows.Forms.ComboBoxStyle]::DropDownList
$scopeSelect.Items.AddRange(@('User', 'Machine'))
$scopeSelect.SelectedIndex = 0
$scopeSelect.Location = New-Object System.Drawing.Point(64, 12)
$scopeSelect.Size = New-Object System.Drawing.Size(130, 24)

$reloadButton = New-Object System.Windows.Forms.Button
$reloadButton.Text = 'Reload'
$reloadButton.Location = New-Object System.Drawing.Point(204, 10)
$reloadButton.Size = New-Object System.Drawing.Size(80, 28)

$entryList = New-Object System.Windows.Forms.ListBox
$entryList.Anchor = 'Top, Bottom, Left, Right'
$entryList.HorizontalScrollbar = $true
$entryList.IntegralHeight = $false
$entryList.Location = New-Object System.Drawing.Point(12, 48)
$entryList.Size = New-Object System.Drawing.Size(620, 378)

$upButton = New-Object System.Windows.Forms.Button
$upButton.Anchor = 'Top, Right'
$upButton.Text = 'Up'
$upButton.Location = New-Object System.Drawing.Point(646, 48)
$upButton.Size = New-Object System.Drawing.Size(140, 30)

$downButton = New-Object System.Windows.Forms.Button
$downButton.Anchor = 'Top, Right'
$downButton.Text = 'Down'
$downButton.Location = New-Object System.Drawing.Point(646, 84)
$downButton.Size = New-Object System.Drawing.Size(140, 30)

$removeButton = New-Object System.Windows.Forms.Button
$removeButton.Anchor = 'Top, Right'
$removeButton.Text = 'Remove'
$removeButton.Location = New-Object System.Drawing.Point(646, 120)
$removeButton.Size = New-Object System.Drawing.Size(140, 30)

$browseButton = New-Object System.Windows.Forms.Button
$browseButton.Anchor = 'Top, Right'
$browseButton.Text = 'Browse...'
$browseButton.Location = New-Object System.Drawing.Point(646, 156)
$browseButton.Size = New-Object System.Drawing.Size(140, 30)

$entryText = New-Object System.Windows.Forms.TextBox
$entryText.Anchor = 'Bottom, Left, Right'
$entryText.Location = New-Object System.Drawing.Point(12, 438)
$entryText.Size = New-Object System.Drawing.Size(620, 24)

$addButton = New-Object System.Windows.Forms.Button
$addButton.Anchor = 'Bottom, Right'
$addButton.Text = 'Add'
$addButton.Location = New-Object System.Drawing.Point(646, 434)
$addButton.Size = New-Object System.Drawing.Size(66, 30)

$updateButton = New-Object System.Windows.Forms.Button
$updateButton.Anchor = 'Bottom, Right'
$updateButton.Text = 'Update'
$updateButton.Location = New-Object System.Drawing.Point(720, 434)
$updateButton.Size = New-Object System.Drawing.Size(66, 30)

$statusLabel = New-Object System.Windows.Forms.Label
$statusLabel.Anchor = 'Bottom, Left, Right'
$statusLabel.Location = New-Object System.Drawing.Point(12, 480)
$statusLabel.Size = New-Object System.Drawing.Size(460, 24)

$saveButton = New-Object System.Windows.Forms.Button
$saveButton.Anchor = 'Bottom, Right'
$saveButton.Text = 'Save'
$saveButton.Location = New-Object System.Drawing.Point(554, 474)
$saveButton.Size = New-Object System.Drawing.Size(110, 32)

$closeButton = New-Object System.Windows.Forms.Button
$closeButton.Anchor = 'Bottom, Right'
$closeButton.Text = 'Close'
$closeButton.Location = New-Object System.Drawing.Point(676, 474)
$closeButton.Size = New-Object System.Drawing.Size(110, 32)

$form.Controls.AddRange(@(
    $scopeLabel,
    $scopeSelect,
    $reloadButton,
    $entryList,
    $upButton,
    $downButton,
    $removeButton,
    $browseButton,
    $entryText,
    $addButton,
    $updateButton,
    $statusLabel,
    $saveButton,
    $closeButton
))

$scopeSelect.Add_SelectedIndexChanged({ Load-Entries })
$reloadButton.Add_Click({ Load-Entries })

$entryList.Add_SelectedIndexChanged({
    if ($entryList.SelectedIndex -ge 0) {
        $entryText.Text = [string]$entryList.SelectedItem
    }
})

$addButton.Add_Click({
    $value = Require-EntryText

    if ($null -eq $value) {
        return
    }

    [void]$entryList.Items.Add($value)
    $entryList.SelectedIndex = $entryList.Items.Count - 1
})

$updateButton.Add_Click({
    if ($entryList.SelectedIndex -lt 0) {
        return
    }

    $value = Require-EntryText


    if ($null -eq $value) {
        return
    }

    $entryList.Items[$entryList.SelectedIndex] = $value
})

$removeButton.Add_Click({
    $index = $entryList.SelectedIndex

    if ($index -lt 0) {
        return
    }

    $entryList.Items.RemoveAt($index)

    if ($entryList.Items.Count -gt 0) {
        $entryList.SelectedIndex = [Math]::Min($index, $entryList.Items.Count - 1)
    } else {
        $entryText.Clear()
    }
})

$upButton.Add_Click({ Move-SelectedEntry -offset -1 })
$downButton.Add_Click({ Move-SelectedEntry -offset 1 })

$browseButton.Add_Click({
    $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $dialog.Description = 'Choose a folder to add to Path.'
    $dialog.ShowNewFolderButton = $true

    if ($dialog.ShowDialog($form) -eq [System.Windows.Forms.DialogResult]::OK) {
        $entryText.Text = $dialog.SelectedPath
    }
})

$saveButton.Add_Click({
    try {
        Set-PathEntries (Get-SelectedScope) (Get-ListEntries)
        $statusLabel.Text = "Saved $($scopeSelect.SelectedItem) Path. Open a new terminal to use changes."
    } catch {
        [System.Windows.Forms.MessageBox]::Show(
            $_.Exception.Message,
            'Unable to save Path',
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error) | Out-Null
    }
})

$closeButton.Add_Click({ $form.Close() })

$form.Add_Shown({ Load-Entries })

[void]$form.ShowDialog()