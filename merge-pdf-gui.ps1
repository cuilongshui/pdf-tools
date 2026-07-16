param(
  [switch]$SelfTest
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir "pdf-gui-common.ps1")

$mergeScript = Join-Path $scriptDir "merge-pdf.js"

if (-not (Test-Path -LiteralPath $mergeScript)) {
  throw "Could not find merge-pdf.js."
}

$nodeExecutable = Get-NodeExecutable

if ($SelfTest) {
  Write-Output "ok"
  return
}

Hide-ConsoleWindow

$form = New-Object System.Windows.Forms.Form
$form.Text = "Merge PDF"
$form.StartPosition = "CenterScreen"
$form.Width = 820
$form.Height = 560
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false

$label = New-Object System.Windows.Forms.Label
$label.Text = "Input files"
$label.Left = 12
$label.Top = 14
$label.Width = 120
$form.Controls.Add($label)

$listBox = New-Object System.Windows.Forms.ListBox
$listBox.Left = 12
$listBox.Top = 40
$listBox.Width = 620
$listBox.Height = 400
$listBox.HorizontalScrollbar = $true
$listBox.SelectionMode = "MultiExtended"
$form.Controls.Add($listBox)

$outputLabel = New-Object System.Windows.Forms.Label
$outputLabel.Text = "Output file"
$outputLabel.Left = 12
$outputLabel.Top = 454
$outputLabel.Width = 120
$form.Controls.Add($outputLabel)

$outputTextBox = New-Object System.Windows.Forms.TextBox
$outputTextBox.Left = 12
$outputTextBox.Top = 478
$outputTextBox.Width = 620
$outputTextBox.ReadOnly = $true
$form.Controls.Add($outputTextBox)

$addButton = New-ToolButton -Text "Add files" -Left 652 -Top 40 -Width 136
$removeButton = New-ToolButton -Text "Remove" -Left 652 -Top 82 -Width 136
$upButton = New-ToolButton -Text "Move up" -Left 652 -Top 124 -Width 136
$downButton = New-ToolButton -Text "Move down" -Left 652 -Top 166 -Width 136
$outputButton = New-ToolButton -Text "Save as" -Left 652 -Top 208 -Width 136
$mergeButton = New-ToolButton -Text "Merge" -Left 652 -Top 406 -Width 136
$closeButton = New-ToolButton -Text "Close" -Left 652 -Top 448 -Width 136

$form.Controls.AddRange(@(
  $addButton,
  $removeButton,
  $upButton,
  $downButton,
  $outputButton,
  $mergeButton,
  $closeButton
))

function Get-MergeInputFiles {
  $items = New-Object System.Collections.Generic.List[string]
  foreach ($item in $listBox.Items) {
    [void]$items.Add([string]$item)
  }
  return $items
}

function Set-DefaultMergeOutput {
  if ($outputTextBox.Text -or $listBox.Items.Count -eq 0) {
    return
  }

  $firstFile = [string]$listBox.Items[0]
  $outputTextBox.Text = Join-Path (Split-Path -Parent $firstFile) "merged.pdf"
}

$addButton.Add_Click({
  $dialog = New-Object System.Windows.Forms.OpenFileDialog
  $dialog.Filter = "PDF files (*.pdf)|*.pdf"
  $dialog.Multiselect = $true
  $dialog.Title = "Select PDF files to merge"

  if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
    return
  }

  foreach ($file in $dialog.FileNames) {
    if (-not $listBox.Items.Contains($file)) {
      [void]$listBox.Items.Add($file)
    }
  }

  Set-DefaultMergeOutput
})

$removeButton.Add_Click({
  $selected = @($listBox.SelectedIndices)
  if ($selected.Count -eq 0) {
    return
  }

  foreach ($index in ($selected | Sort-Object -Descending)) {
    $listBox.Items.RemoveAt($index)
  }

  if ($listBox.Items.Count -eq 0) {
    $outputTextBox.Clear()
  }
})

$upButton.Add_Click({
  if ($listBox.SelectedIndices.Count -ne 1) {
    Show-InfoMessage "Select one file first."
    return
  }

  $index = $listBox.SelectedIndex
  if ($index -le 0) {
    return
  }

  $current = $listBox.Items[$index]
  $listBox.Items.RemoveAt($index)
  $listBox.Items.Insert($index - 1, $current)
  $listBox.SelectedIndex = $index - 1
})

$downButton.Add_Click({
  if ($listBox.SelectedIndices.Count -ne 1) {
    Show-InfoMessage "Select one file first."
    return
  }

  $index = $listBox.SelectedIndex
  if ($index -lt 0 -or $index -ge $listBox.Items.Count - 1) {
    return
  }

  $current = $listBox.Items[$index]
  $listBox.Items.RemoveAt($index)
  $listBox.Items.Insert($index + 1, $current)
  $listBox.SelectedIndex = $index + 1
})

$outputButton.Add_Click({
  $initialDirectory = $null
  if ($listBox.Items.Count -gt 0) {
    $initialDirectory = Split-Path -Parent ([string]$listBox.Items[0])
  }

  $selected = Show-PdfSaveDialog -InitialDirectory $initialDirectory -DefaultFileName "merged.pdf"
  if ($selected) {
    $outputTextBox.Text = $selected
  }
})

$closeButton.Add_Click({
  $form.Close()
})

$mergeButton.Add_Click({
  $files = Get-MergeInputFiles
  if ($files.Count -lt 2) {
    Show-ErrorMessage "Select at least two PDF files."
    return
  }

  if (-not $outputTextBox.Text) {
    $selected = Show-PdfSaveDialog -InitialDirectory (Split-Path -Parent $files[0]) -DefaultFileName "merged.pdf"
    if (-not $selected) {
      return
    }
    $outputTextBox.Text = $selected
  }

  $arguments = New-Object System.Collections.Generic.List[string]
  [void]$arguments.Add("-o")
  [void]$arguments.Add($outputTextBox.Text)

  if (Test-Path -LiteralPath $outputTextBox.Text) {
    $confirm = Show-ConfirmMessage "The output file already exists. Overwrite it?"
    if ($confirm -ne [System.Windows.Forms.DialogResult]::Yes) {
      return
    }
    [void]$arguments.Add("-f")
  }

  foreach ($file in $files) {
    [void]$arguments.Add($file)
  }

  $form.UseWaitCursor = $true
  $mergeButton.Enabled = $false

  try {
    $result = Invoke-NodePdfTool -NodeExecutable $nodeExecutable -ScriptPath $mergeScript -Arguments $arguments
    if ($result.ExitCode -ne 0) {
      $message = if ($result.Output) { $result.Output } else { "Merge failed." }
      Show-ErrorMessage $message
      return
    }

    $message = "Merge completed:`r`n$($outputTextBox.Text)"
    if ($result.Output) {
      $message += "`r`n`r`n$($result.Output)"
    }
    Show-InfoMessage $message
    $form.Close()
  } finally {
    $form.UseWaitCursor = $false
    $mergeButton.Enabled = $true
  }
})

[void]$form.ShowDialog()
