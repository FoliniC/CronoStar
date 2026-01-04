# lint_and_fix_python.ps1
# This script lints and automatically fixes Python source files using Ruff.

# --- Configuration ---
$PYTHON_EXECUTABLE = "python" # Or "python3", "py", depending on your system
$RUFF_CONFIG_DIR = "custom_components/cronostar" # Directory containing pyproject.toml
$PROJECT_ROOT = (Get-Location).Path # The directory where this script is located

# --- Helper Functions ---
function Test-Command {
    param (
        [string]$Command
    )
    (Get-Command $Command -ErrorAction SilentlyContinue) -ne $null
}

function Invoke-PythonModule {
    param (
        [string]$ModuleName,
        [string]$Arguments = ""
    )
    & $PYTHON_EXECUTABLE -m $ModuleName $Arguments
}

# --- Main Script Logic ---

Write-Host "CronoStar Python Linter and Fixer (using Ruff)"
Write-Host "------------------------------------------------"

# 1. Check for Python
Write-Host "1. Checking for Python..."
if (-not (Test-Command $PYTHON_EXECUTABLE)) {
    Write-Error "Python executable '$PYTHON_EXECUTABLE' not found. Please install Python or ensure it's in your PATH."
    Exit 1
}
Write-Host "   Python found: $(&$PYTHON_EXECUTABLE --version)"

# 2. Check for Ruff installation
Write-Host "2. Checking for Ruff installation..."
try {
    Invoke-PythonModule ruff --version | Out-Null
    Write-Host "   Ruff is already installed."
} catch {
    Write-Warning "Ruff not found. Attempting to install Ruff..."
    try {
        Invoke-PythonModule pip install ruff
        Write-Host "   Ruff installed successfully."
    } catch {
        Write-Error "Failed to install Ruff. Please ensure pip is working and try again manually: '$PYTHON_EXECUTABLE -m pip install ruff'."
        Exit 1
    }
}

# 3. Navigate to the Ruff config directory
Write-Host "3. Navigating to Ruff configuration directory: $RUFF_CONFIG_DIR"
Push-Location "$PROJECT_ROOT\$RUFF_CONFIG_DIR"

# 4. Run Ruff Check
Write-Host "4. Running Ruff check..."
try {
    Invoke-PythonModule ruff check .
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Ruff check passed with no issues."
    } else {
        Write-Warning "⚠️ Ruff check found issues. Review the output above."
    }
} catch {
    Write-Error "Failed to run Ruff check: $($_.Exception.Message)"
    Pop-Location
    Exit 1
}

# 5. Offer to Run Ruff Fix
Write-Host ""
$choice = Read-Host "Do you want to attempt to fix issues automatically? (Y/N)"
if ($choice -eq "Y" -or $choice -eq "y") {
    Write-Host "5. Running Ruff fix..."
    try {
        Invoke-PythonModule ruff check . --fix
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Ruff fix completed. All fixable issues addressed."
        } else {
            Write-Warning "⚠️ Ruff fix completed, but some issues might remain or couldn't be fixed automatically. Review the output above."
        }
    } catch {
        Write-Error "Failed to run Ruff fix: $($_.Exception.Message)"
        Pop-Location
        Exit 1
    }
} else {
    Write-Host "Skipping Ruff fix."
}

Pop-Location # Return to original directory
Write-Host "------------------------------------------------"
Write-Host "Script finished."