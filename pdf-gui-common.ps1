Set-StrictMode -Version Latest

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

[System.Windows.Forms.Application]::EnableVisualStyles()

function Hide-ConsoleWindow {
  if (-not ("PdfGui.NativeMethods" -as [type])) {
    Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

namespace PdfGui {
  public static class NativeMethods {
    [DllImport("kernel32.dll")]
    public static extern IntPtr GetConsoleWindow();

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  }
}
"@
  }

  $consoleHandle = [PdfGui.NativeMethods]::GetConsoleWindow()
  if ($consoleHandle -ne [IntPtr]::Zero) {
    [void][PdfGui.NativeMethods]::ShowWindow($consoleHandle, 0)
  }
}

function Get-NodeExecutable {
  $command = Get-Command node -ErrorAction SilentlyContinue
  if (-not $command) {
    throw "Could not find node. Install Node.js and ensure node is available in PATH."
  }

  return $command.Source
}

function Show-InfoMessage {
  param(
    [string]$Message,
    [string]$Title = "PDF Tool"
  )

  [System.Windows.Forms.MessageBox]::Show(
    $Message,
    $Title,
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Information
  ) | Out-Null
}

function Show-ErrorMessage {
  param(
    [string]$Message,
    [string]$Title = "PDF Tool"
  )

  [System.Windows.Forms.MessageBox]::Show(
    $Message,
    $Title,
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Error
  ) | Out-Null
}

function Show-ConfirmMessage {
  param(
    [string]$Message,
    [string]$Title = "PDF Tool"
  )

  return [System.Windows.Forms.MessageBox]::Show(
    $Message,
    $Title,
    [System.Windows.Forms.MessageBoxButtons]::YesNo,
    [System.Windows.Forms.MessageBoxIcon]::Question
  )
}

function Invoke-NodePdfTool {
  param(
    [Parameter(Mandatory = $true)]
    [string]$NodeExecutable,

    [Parameter(Mandatory = $true)]
    [string]$ScriptPath,

    [string[]]$Arguments = @()
  )

  $output = & $NodeExecutable $ScriptPath @Arguments 2>&1
  $exitCode = $LASTEXITCODE
  $text = (($output | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine).Trim()

  return [pscustomobject]@{
    ExitCode = $exitCode
    Output   = $text
  }
}

function Show-PdfSaveDialog {
  param(
    [string]$InitialDirectory,
    [string]$DefaultFileName
  )

  $dialog = New-Object System.Windows.Forms.SaveFileDialog
  $dialog.Filter = "PDF files (*.pdf)|*.pdf"
  $dialog.DefaultExt = "pdf"
  $dialog.AddExtension = $true
  $dialog.OverwritePrompt = $false

  if ($InitialDirectory) {
    $dialog.InitialDirectory = $InitialDirectory
  }

  if ($DefaultFileName) {
    $dialog.FileName = $DefaultFileName
  }

  if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    return $dialog.FileName
  }

  return $null
}

function New-ToolButton {
  param(
    [string]$Text,
    [int]$Left,
    [int]$Top,
    [int]$Width = 100,
    [int]$Height = 32
  )

  $button = New-Object System.Windows.Forms.Button
  $button.Text = $Text
  $button.Left = $Left
  $button.Top = $Top
  $button.Width = $Width
  $button.Height = $Height
  return $button
}
