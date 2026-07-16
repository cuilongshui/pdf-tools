param(
  [switch]$SelfTest
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir "pdf-gui-common.ps1")

$compressScript = Join-Path $scriptDir "compress-pdf.js"

if (-not (Test-Path -LiteralPath $compressScript)) {
  throw "Could not find compress-pdf.js."
}

$nodeExecutable = Get-NodeExecutable

if ($SelfTest) {
  Write-Output "ok"
  return
}

Hide-ConsoleWindow

function Get-DefaultCompressedPath {
  param(
    [string]$InputFile
  )

  if (-not $InputFile) {
    return ""
  }

  $parsed = [System.IO.Path]::GetFileNameWithoutExtension($InputFile)
  $directory = [System.IO.Path]::GetDirectoryName($InputFile)
  return [System.IO.Path]::Combine($directory, "$parsed-compressed.pdf")
}

$form = New-Object System.Windows.Forms.Form
$form.Text = "Compress PDF"
$form.StartPosition = "CenterScreen"
$form.Width = 700
$form.Height = 420
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false

$inputLabel = New-Object System.Windows.Forms.Label
$inputLabel.Text = "Input file"
$inputLabel.Left = 12
$inputLabel.Top = 18
$inputLabel.Width = 100
$form.Controls.Add($inputLabel)

$inputTextBox = New-Object System.Windows.Forms.TextBox
$inputTextBox.Left = 12
$inputTextBox.Top = 42
$inputTextBox.Width = 540
$inputTextBox.ReadOnly = $true
$form.Controls.Add($inputTextBox)

$inputButton = New-ToolButton -Text "Browse" -Left 566 -Top 39 -Width 106
$form.Controls.Add($inputButton)

$outputLabel = New-Object System.Windows.Forms.Label
$outputLabel.Text = "Output file"
$outputLabel.Left = 12
$outputLabel.Top = 82
$outputLabel.Width = 100
$form.Controls.Add($outputLabel)

$outputTextBox = New-Object System.Windows.Forms.TextBox
$outputTextBox.Left = 12
$outputTextBox.Top = 106
$outputTextBox.Width = 540
$outputTextBox.ReadOnly = $true
$form.Controls.Add($outputTextBox)

$outputButton = New-ToolButton -Text "Save as" -Left 566 -Top 103 -Width 106
$form.Controls.Add($outputButton)

$modeLabel = New-Object System.Windows.Forms.Label
$modeLabel.Text = "Mode"
$modeLabel.Left = 12
$modeLabel.Top = 152
$modeLabel.Width = 100
$form.Controls.Add($modeLabel)

$modeComboBox = New-Object System.Windows.Forms.ComboBox
$modeComboBox.Left = 12
$modeComboBox.Top = 176
$modeComboBox.Width = 150
$modeComboBox.DropDownStyle = "DropDownList"
[void]$modeComboBox.Items.Add("image")
[void]$modeComboBox.Items.Add("basic")
$modeComboBox.SelectedItem = "image"
$form.Controls.Add($modeComboBox)

$grayscaleCheckBox = New-Object System.Windows.Forms.CheckBox
$grayscaleCheckBox.Text = "Grayscale"
$grayscaleCheckBox.Left = 184
$grayscaleCheckBox.Top = 178
$grayscaleCheckBox.Width = 80
$grayscaleCheckBox.Checked = $true
$form.Controls.Add($grayscaleCheckBox)

$presetButton = New-ToolButton -Text "Scan preset" -Left 566 -Top 171 -Width 106
$form.Controls.Add($presetButton)

$dpiLabel = New-Object System.Windows.Forms.Label
$dpiLabel.Text = "DPI"
$dpiLabel.Left = 12
$dpiLabel.Top = 224
$dpiLabel.Width = 80
$form.Controls.Add($dpiLabel)

$dpiInput = New-Object System.Windows.Forms.NumericUpDown
$dpiInput.Left = 12
$dpiInput.Top = 248
$dpiInput.Width = 100
$dpiInput.Minimum = 36
$dpiInput.Maximum = 300
$dpiInput.Value = 120
$form.Controls.Add($dpiInput)

$qualityLabel = New-Object System.Windows.Forms.Label
$qualityLabel.Text = "Quality"
$qualityLabel.Left = 136
$qualityLabel.Top = 224
$qualityLabel.Width = 80
$form.Controls.Add($qualityLabel)

$qualityInput = New-Object System.Windows.Forms.NumericUpDown
$qualityInput.Left = 136
$qualityInput.Top = 248
$qualityInput.Width = 100
$qualityInput.Minimum = 1
$qualityInput.Maximum = 100
$qualityInput.Value = 60
$form.Controls.Add($qualityInput)

$maxSideLabel = New-Object System.Windows.Forms.Label
$maxSideLabel.Text = "Max side"
$maxSideLabel.Left = 260
$maxSideLabel.Top = 224
$maxSideLabel.Width = 80
$form.Controls.Add($maxSideLabel)

$maxSideInput = New-Object System.Windows.Forms.NumericUpDown
$maxSideInput.Left = 260
$maxSideInput.Top = 248
$maxSideInput.Width = 120
$maxSideInput.Minimum = 512
$maxSideInput.Maximum = 6000
$maxSideInput.Increment = 50
$maxSideInput.Value = 2200
$form.Controls.Add($maxSideInput)

$compressButton = New-ToolButton -Text "Compress" -Left 460 -Top 320 -Width 106
$closeButton = New-ToolButton -Text "Close" -Left 566 -Top 320 -Width 106
$form.Controls.AddRange(@($compressButton, $closeButton))

function Update-CompressControlState {
  $isImageMode = ([string]$modeComboBox.SelectedItem -eq "image")
  $grayscaleCheckBox.Enabled = $isImageMode
  $dpiInput.Enabled = $isImageMode
  $qualityInput.Enabled = $isImageMode
  $maxSideInput.Enabled = $isImageMode
  $presetButton.Enabled = $isImageMode
}

$modeComboBox.Add_SelectedIndexChanged({
  Update-CompressControlState
})

$presetButton.Add_Click({
  $modeComboBox.SelectedItem = "image"
  $grayscaleCheckBox.Checked = $true
  $dpiInput.Value = 110
  $qualityInput.Value = 55
  $maxSideInput.Value = 1650
})

$inputButton.Add_Click({
  $dialog = New-Object System.Windows.Forms.OpenFileDialog
  $dialog.Filter = "PDF files (*.pdf)|*.pdf"
  $dialog.Multiselect = $false
  $dialog.Title = "Select a PDF file to compress"

  if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
    return
  }

  $inputTextBox.Text = $dialog.FileName
  if (-not $outputTextBox.Text) {
    $outputTextBox.Text = Get-DefaultCompressedPath -InputFile $dialog.FileName
  }
})

$outputButton.Add_Click({
  $initialDirectory = $null
  $defaultName = "compressed.pdf"
  if ($inputTextBox.Text) {
    $initialDirectory = Split-Path -Parent $inputTextBox.Text
    $defaultName = [System.IO.Path]::GetFileName((Get-DefaultCompressedPath -InputFile $inputTextBox.Text))
  }

  $selected = Show-PdfSaveDialog -InitialDirectory $initialDirectory -DefaultFileName $defaultName
  if ($selected) {
    $outputTextBox.Text = $selected
  }
})

$closeButton.Add_Click({
  $form.Close()
})

$compressButton.Add_Click({
  if (-not $inputTextBox.Text) {
    Show-ErrorMessage "Select a PDF file first."
    return
  }

  if (-not $outputTextBox.Text) {
    $selected = Show-PdfSaveDialog -InitialDirectory (Split-Path -Parent $inputTextBox.Text) -DefaultFileName ([System.IO.Path]::GetFileName((Get-DefaultCompressedPath -InputFile $inputTextBox.Text)))
    if (-not $selected) {
      return
    }
    $outputTextBox.Text = $selected
  }

  $arguments = New-Object System.Collections.Generic.List[string]
  [void]$arguments.Add("--mode")
  [void]$arguments.Add([string]$modeComboBox.SelectedItem)

  if ([string]$modeComboBox.SelectedItem -eq "image") {
    if ($grayscaleCheckBox.Checked) {
      [void]$arguments.Add("--grayscale")
    }

    [void]$arguments.Add("--dpi")
    [void]$arguments.Add([string][int]$dpiInput.Value)
    [void]$arguments.Add("--quality")
    [void]$arguments.Add([string][int]$qualityInput.Value)
    [void]$arguments.Add("--max-side")
    [void]$arguments.Add([string][int]$maxSideInput.Value)
  }

  [void]$arguments.Add("-o")
  [void]$arguments.Add($outputTextBox.Text)

  if (Test-Path -LiteralPath $outputTextBox.Text) {
    $confirm = Show-ConfirmMessage "The output file already exists. Overwrite it?"
    if ($confirm -ne [System.Windows.Forms.DialogResult]::Yes) {
      return
    }
    [void]$arguments.Add("-f")
  }

  [void]$arguments.Add($inputTextBox.Text)

  $form.UseWaitCursor = $true
  $compressButton.Enabled = $false

  try {
    $result = Invoke-NodePdfTool -NodeExecutable $nodeExecutable -ScriptPath $compressScript -Arguments $arguments
    if ($result.ExitCode -ne 0) {
      $message = if ($result.Output) { $result.Output } else { "Compression failed." }
      Show-ErrorMessage $message
      return
    }

    $message = "Compression completed:`r`n$($outputTextBox.Text)"
    if ($result.Output) {
      $message += "`r`n`r`n$($result.Output)"
    }
    Show-InfoMessage $message
    $form.Close()
  } finally {
    $form.UseWaitCursor = $false
    $compressButton.Enabled = $true
  }
})

Update-CompressControlState
[void]$form.ShowDialog()
