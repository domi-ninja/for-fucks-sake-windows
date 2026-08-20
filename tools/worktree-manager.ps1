param(
    [string]$WorktreeRoot = (Join-Path $env:USERPROFILE '.t3\worktrees')
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'

function Get-NormalizedFullPath([string]$path) {
    return [System.IO.Path]::GetFullPath($path).TrimEnd(
        [System.IO.Path]::DirectorySeparatorChar,
        [System.IO.Path]::AltDirectorySeparatorChar)
}

function Get-ExtendedLengthPath([string]$path) {
    $fullPath = Get-NormalizedFullPath $path

    if ($fullPath.StartsWith('\\?\')) {
        return $fullPath
    }

    if ($fullPath.StartsWith('\\')) {
        return "\\?\UNC\$($fullPath.TrimStart('\'))"
    }

    return "\\?\$fullPath"
}

function Remove-DirectoryTree([string]$path) {
    $extendedRoot = Get-ExtendedLengthPath $path
    $pendingDirectories = New-Object 'System.Collections.Generic.Stack[string]'
    $directories = New-Object 'System.Collections.Generic.List[string]'
    $pendingDirectories.Push($extendedRoot)
    $processedCount = 0

    while ($pendingDirectories.Count -gt 0) {
        $currentDirectory = $pendingDirectories.Pop()
        $directories.Add($currentDirectory)

        foreach ($entry in [System.IO.Directory]::EnumerateFileSystemEntries($currentDirectory)) {
            $attributes = [System.IO.File]::GetAttributes($entry)
            $isDirectory = ($attributes -band [System.IO.FileAttributes]::Directory) -ne 0
            $isReparsePoint = ($attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0

            if ($isDirectory -and -not $isReparsePoint) {
                $pendingDirectories.Push($entry)
            } elseif ($isDirectory) {
                [System.IO.Directory]::Delete($entry, $false)
            } else {
                if (($attributes -band [System.IO.FileAttributes]::ReadOnly) -ne 0) {
                    [System.IO.File]::SetAttributes(
                        $entry,
                        $attributes -band (-bnot [System.IO.FileAttributes]::ReadOnly))
                }

                [System.IO.File]::Delete($entry)
            }

            $processedCount += 1

            if ($processedCount % 250 -eq 0) {
                [System.Windows.Forms.Application]::DoEvents()
            }
        }
    }

    for ($index = $directories.Count - 1; $index -ge 0; $index -= 1) {
        [System.IO.Directory]::Delete($directories[$index], $false)
    }
}

function Test-IsDirectWorktreeChild([string]$path) {
    $normalizedRoot = Get-NormalizedFullPath $WorktreeRoot
    $normalizedPath = Get-NormalizedFullPath $path
    $projectPath = Split-Path -Parent $normalizedPath
    $parentOfProject = Split-Path -Parent $projectPath

    return [string]::Equals(
        $normalizedRoot,
        $parentOfProject,
        [System.StringComparison]::OrdinalIgnoreCase)
}

function Invoke-Git([string[]]$arguments) {
    # Windows PowerShell 5.1 turns native stderr redirected with 2>&1 into
    # PowerShell error records. Keep expected Git failures non-terminating so
    # callers can inspect ExitCode (for example, for stale worktree folders).
    $ErrorActionPreference = 'Continue'
    $output = @(& git @arguments 2>&1)

    return [pscustomobject]@{
        ExitCode = $LASTEXITCODE
        Output = ($output -join [Environment]::NewLine).Trim()
    }
}

function Get-WorktreeBranch([string]$path) {
    $insideWorktree = Invoke-Git @('-C', $path, 'rev-parse', '--is-inside-work-tree')

    if ($insideWorktree.ExitCode -ne 0 -or $insideWorktree.Output -ne 'true') {
        return [pscustomobject]@{
            Branch = '(not a Git worktree)'
            IsGitWorktree = $false
        }
    }

    $branch = Invoke-Git @('-C', $path, 'symbolic-ref', '--quiet', '--short', 'HEAD')

    if ($branch.ExitCode -eq 0 -and -not [string]::IsNullOrWhiteSpace($branch.Output)) {
        return [pscustomobject]@{
            Branch = $branch.Output
            IsGitWorktree = $true
        }
    }

    $commit = Invoke-Git @('-C', $path, 'rev-parse', '--short', 'HEAD')
    $commitLabel = if ($commit.ExitCode -eq 0) { $commit.Output } else { 'unknown' }

    return [pscustomobject]@{
        Branch = "(detached at $commitLabel)"
        IsGitWorktree = $true
    }
}

function Get-WorktreeFolders {
    if (-not (Test-Path -LiteralPath $WorktreeRoot -PathType Container)) {
        return @()
    }

    $items = New-Object System.Collections.Generic.List[object]
    $projects = Get-ChildItem -LiteralPath $WorktreeRoot -Directory -Force |
        Sort-Object -Property Name

    foreach ($project in $projects) {
        $folders = Get-ChildItem -LiteralPath $project.FullName -Directory -Force |
            Sort-Object -Property Name

        foreach ($folder in $folders) {
            $gitDetails = Get-WorktreeBranch $folder.FullName
            $items.Add([pscustomobject]@{
                Project = $project.Name
                Branch = $gitDetails.Branch
                Folder = $folder.Name
                Path = $folder.FullName
                IsGitWorktree = $gitDetails.IsGitWorktree
            })
        }
    }

    return $items.ToArray()
}

function Remove-WorktreeFolder($worktree) {
    if (-not (Test-IsDirectWorktreeChild $worktree.Path)) {
        throw "Refusing to delete a path outside the expected project/worktree layout: $($worktree.Path)"
    }

    if (-not (Test-Path -LiteralPath $worktree.Path -PathType Container)) {
        return
    }

    if ($worktree.IsGitWorktree) {
        $commonGitDirectory = Invoke-Git @(
            '-C', $worktree.Path,
            'rev-parse', '--path-format=absolute', '--git-common-dir')

        if ($commonGitDirectory.ExitCode -ne 0 -or
            [string]::IsNullOrWhiteSpace($commonGitDirectory.Output)) {
            throw 'Could not find the worktree repository metadata.'
        }

        $remove = Invoke-Git @(
            "--git-dir=$($commonGitDirectory.Output)",
            'worktree', 'remove', '--force', '--force', '--', $worktree.Path)

        if ($remove.ExitCode -ne 0) {
            $details = if ($remove.Output) { $remove.Output } else { 'git worktree remove failed.' }
            throw $details
        }
    } else {
        Remove-DirectoryTree $worktree.Path
    }
}

function Update-DeleteButton {
    $selectedCount = 0

    foreach ($row in $worktreeGrid.Rows) {
        if ($row.Cells['Selected'].Value -eq $true) {
            $selectedCount += 1
        }
    }

    $deleteButton.Enabled = $selectedCount -gt 0
    $deleteButton.Text = if ($selectedCount -gt 0) {
        "Delete selected ($selectedCount)"
    } else {
        'Delete selected'
    }
}

function Set-AllChecked([bool]$checked) {
    foreach ($row in $worktreeGrid.Rows) {
        $row.Cells['Selected'].Value = $checked
    }

    Update-DeleteButton
}

function Load-WorktreeGrid {
    $worktreeGrid.Rows.Clear()

    try {
        $worktrees = @(Get-WorktreeFolders)

        foreach ($worktree in $worktrees) {
            $rowIndex = $worktreeGrid.Rows.Add(
                $false,
                $worktree.Project,
                $worktree.Branch,
                $worktree.Folder)
            $worktreeGrid.Rows[$rowIndex].Tag = $worktree
        }

        $statusLabel.Text = "$($worktrees.Count) worktree folder(s) in $WorktreeRoot"
    } catch {
        $statusLabel.Text = 'Could not load worktrees.'
        [System.Windows.Forms.MessageBox]::Show(
            $_.Exception.Message,
            'Unable to load worktrees',
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error) | Out-Null
    }

    Update-DeleteButton
}

[System.Windows.Forms.Application]::EnableVisualStyles()

$form = New-Object System.Windows.Forms.Form
$form.Text = 'ffs Worktree Manager'
$form.StartPosition = 'CenterScreen'
$form.MinimumSize = New-Object System.Drawing.Size(760, 440)
$form.Size = New-Object System.Drawing.Size(980, 580)

$descriptionLabel = New-Object System.Windows.Forms.Label
$descriptionLabel.Text = 'Check the worktrees to delete. Deletion also discards uncommitted changes.'
$descriptionLabel.Location = New-Object System.Drawing.Point(12, 14)
$descriptionLabel.Size = New-Object System.Drawing.Size(700, 22)

$worktreeGrid = New-Object System.Windows.Forms.DataGridView
$worktreeGrid.Anchor = 'Top, Bottom, Left, Right'
$worktreeGrid.Location = New-Object System.Drawing.Point(12, 42)
$worktreeGrid.Size = New-Object System.Drawing.Size(940, 430)
$worktreeGrid.AllowUserToAddRows = $false
$worktreeGrid.AllowUserToDeleteRows = $false
$worktreeGrid.AllowUserToResizeRows = $false
$worktreeGrid.AutoGenerateColumns = $false
$worktreeGrid.BackgroundColor = [System.Drawing.SystemColors]::Window
$worktreeGrid.BorderStyle = [System.Windows.Forms.BorderStyle]::Fixed3D
$worktreeGrid.MultiSelect = $false
$worktreeGrid.RowHeadersVisible = $false
$worktreeGrid.SelectionMode = [System.Windows.Forms.DataGridViewSelectionMode]::FullRowSelect

$selectedColumn = New-Object System.Windows.Forms.DataGridViewCheckBoxColumn
$selectedColumn.Name = 'Selected'
$selectedColumn.HeaderText = ''
$selectedColumn.Width = 42
$selectedColumn.SortMode = [System.Windows.Forms.DataGridViewColumnSortMode]::NotSortable

$projectColumn = New-Object System.Windows.Forms.DataGridViewTextBoxColumn
$projectColumn.Name = 'Project'
$projectColumn.HeaderText = 'Project'
$projectColumn.ReadOnly = $true
$projectColumn.Width = 150

$branchColumn = New-Object System.Windows.Forms.DataGridViewTextBoxColumn
$branchColumn.Name = 'Branch'
$branchColumn.HeaderText = 'Git branch'
$branchColumn.ReadOnly = $true
$branchColumn.AutoSizeMode = [System.Windows.Forms.DataGridViewAutoSizeColumnMode]::Fill
$branchColumn.FillWeight = 65

$folderColumn = New-Object System.Windows.Forms.DataGridViewTextBoxColumn
$folderColumn.Name = 'Folder'
$folderColumn.HeaderText = 'Folder'
$folderColumn.ReadOnly = $true
$folderColumn.AutoSizeMode = [System.Windows.Forms.DataGridViewAutoSizeColumnMode]::Fill
$folderColumn.FillWeight = 35

foreach ($column in @(
    $selectedColumn,
    $projectColumn,
    $branchColumn,
    $folderColumn)) {
    [void]$worktreeGrid.Columns.Add($column)
}

$selectAllButton = New-Object System.Windows.Forms.Button
$selectAllButton.Anchor = 'Bottom, Left'
$selectAllButton.Text = 'Select all'
$selectAllButton.Location = New-Object System.Drawing.Point(12, 484)
$selectAllButton.Size = New-Object System.Drawing.Size(90, 30)

$clearButton = New-Object System.Windows.Forms.Button
$clearButton.Anchor = 'Bottom, Left'
$clearButton.Text = 'Clear'
$clearButton.Location = New-Object System.Drawing.Point(108, 484)
$clearButton.Size = New-Object System.Drawing.Size(80, 30)

$refreshButton = New-Object System.Windows.Forms.Button
$refreshButton.Anchor = 'Bottom, Left'
$refreshButton.Text = 'Refresh'
$refreshButton.Location = New-Object System.Drawing.Point(194, 484)
$refreshButton.Size = New-Object System.Drawing.Size(80, 30)

$statusLabel = New-Object System.Windows.Forms.Label
$statusLabel.Anchor = 'Bottom, Left, Right'
$statusLabel.AutoEllipsis = $true
$statusLabel.Location = New-Object System.Drawing.Point(12, 520)
$statusLabel.Size = New-Object System.Drawing.Size(570, 22)

$progressBar = New-Object System.Windows.Forms.ProgressBar
$progressBar.Anchor = 'Bottom, Left'
$progressBar.Location = New-Object System.Drawing.Point(12, 520)
$progressBar.Size = New-Object System.Drawing.Size(430, 18)
$progressBar.Style = [System.Windows.Forms.ProgressBarStyle]::Continuous
$progressBar.Visible = $false

$progressLabel = New-Object System.Windows.Forms.Label
$progressLabel.Anchor = 'Bottom, Left'
$progressLabel.Location = New-Object System.Drawing.Point(452, 520)
$progressLabel.Size = New-Object System.Drawing.Size(180, 22)
$progressLabel.Visible = $false

$deleteButton = New-Object System.Windows.Forms.Button
$deleteButton.Anchor = 'Bottom, Right'
$deleteButton.Enabled = $false
$deleteButton.Text = 'Delete selected'
$deleteButton.Location = New-Object System.Drawing.Point(648, 484)
$deleteButton.Size = New-Object System.Drawing.Size(150, 32)

$closeButton = New-Object System.Windows.Forms.Button
$closeButton.Anchor = 'Bottom, Right'
$closeButton.Text = 'Close'
$closeButton.Location = New-Object System.Drawing.Point(810, 484)
$closeButton.Size = New-Object System.Drawing.Size(142, 32)

$form.Controls.AddRange(@(
    $descriptionLabel,
    $worktreeGrid,
    $selectAllButton,
    $clearButton,
    $refreshButton,
    $statusLabel,
    $progressBar,
    $progressLabel,
    $deleteButton,
    $closeButton))

$worktreeGrid.Add_CurrentCellDirtyStateChanged({
    if ($worktreeGrid.IsCurrentCellDirty) {
        [void]$worktreeGrid.CommitEdit([System.Windows.Forms.DataGridViewDataErrorContexts]::Commit)
    }
})
$worktreeGrid.Add_CellValueChanged({ Update-DeleteButton })
$selectAllButton.Add_Click({ Set-AllChecked $true })
$clearButton.Add_Click({ Set-AllChecked $false })
$refreshButton.Add_Click({ Load-WorktreeGrid })
$closeButton.Add_Click({ $form.Close() })

$deleteButton.Add_Click({
    [void]$worktreeGrid.EndEdit()
    $selected = New-Object System.Collections.Generic.List[object]

    foreach ($row in $worktreeGrid.Rows) {
        if ($row.Cells['Selected'].Value -eq $true) {
            $selected.Add($row.Tag)
        }
    }

    if ($selected.Count -eq 0) {
        return
    }

    $confirmation = [System.Windows.Forms.MessageBox]::Show(
        "Permanently delete $($selected.Count) selected worktree folder(s)?`n`nUncommitted changes in them will be lost.",
        'Delete selected worktrees?',
        [System.Windows.Forms.MessageBoxButtons]::YesNo,
        [System.Windows.Forms.MessageBoxIcon]::Warning,
        [System.Windows.Forms.MessageBoxDefaultButton]::Button2)

    if ($confirmation -ne [System.Windows.Forms.DialogResult]::Yes) {
        return
    }

    $form.UseWaitCursor = $true
    $worktreeGrid.Enabled = $false
    $selectAllButton.Enabled = $false
    $clearButton.Enabled = $false
    $refreshButton.Enabled = $false
    $deleteButton.Enabled = $false
    $closeButton.Enabled = $false
    $statusLabel.Visible = $false
    $progressBar.Minimum = 0
    $progressBar.Maximum = $selected.Count
    $progressBar.Value = 0
    $progressBar.Visible = $true
    $progressLabel.Visible = $true
    $errors = New-Object System.Collections.Generic.List[string]
    $deletedCount = 0
    $currentIndex = 0

    try {
        foreach ($worktree in $selected) {
            $currentIndex += 1
            $progressLabel.Text = "Deleting $currentIndex of $($selected.Count)..."
            [System.Windows.Forms.Application]::DoEvents()

            try {
                Remove-WorktreeFolder $worktree
                $deletedCount += 1
            } catch {
                $errors.Add("$($worktree.Project) / $($worktree.Branch): $($_.Exception.Message)")
            }

            $progressBar.Value = $currentIndex
            [System.Windows.Forms.Application]::DoEvents()
        }
    } finally {
        $progressLabel.Text = 'Refreshing...'
        [System.Windows.Forms.Application]::DoEvents()
        Load-WorktreeGrid
        $progressBar.Visible = $false
        $progressLabel.Visible = $false
        $statusLabel.Visible = $true
        $form.UseWaitCursor = $false
        $worktreeGrid.Enabled = $true
        $selectAllButton.Enabled = $true
        $clearButton.Enabled = $true
        $refreshButton.Enabled = $true
        $closeButton.Enabled = $true
    }

    if ($errors.Count -gt 0) {
        [System.Windows.Forms.MessageBox]::Show(
            "$deletedCount worktree folder(s) deleted.`n`n$($errors -join "`n")",
            'Some worktrees could not be deleted',
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error) | Out-Null
    } else {
        [System.Windows.Forms.MessageBox]::Show(
            "$deletedCount worktree folder(s) deleted.",
            'Worktrees deleted',
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Information) | Out-Null
    }
})

$form.Add_Shown({ Load-WorktreeGrid })

[void]$form.ShowDialog()
