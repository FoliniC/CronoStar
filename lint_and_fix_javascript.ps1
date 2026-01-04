# lint_and_fix_javascript.ps1
# This script lints and automatically fixes JavaScript source files using ESLint.

# --- Configuration ---
$NODE_EXECUTABLE = "node"
$NPM_EXECUTABLE = "npm"
$ESLINT_CONFIG_DIR = "cronostar_card" # Directory containing package.json and eslint.config.js
$PROJECT_ROOT = $PSScriptRoot # The directory where this script is located

# --- Helper Functions ---
function Test-Command {
    param (
        [string]$Command
    )
    (Get-Command $Command -ErrorAction SilentlyContinue) -ne $null
}

# --- Main Script Logic ---

Write-Host "CronoStar JavaScript Linter and Fixer (using ESLint)"
Write-Host "----------------------------------------------------"

# 1. Check for Node.js and npm
Write-Host "1. Checking for Node.js and npm..."
if (-not (Test-Command $NODE_EXECUTABLE)) {
    Write-Error "Node.js executable '$NODE_EXECUTABLE' not found. Please install Node.js (which includes npm) or ensure it's in your PATH."
    Exit 1
}
if (-not (Test-Command $NPM_EXECUTABLE)) {
    Write-Error "npm executable '$NPM_EXECUTABLE' not found. Please install Node.js (which includes npm) or ensure it's in your PATH."
    Exit 1
}
Write-Host "   Node.js found: $(& $NODE_EXECUTABLE --version)"
Write-Host "   npm found: $(& $NPM_EXECUTABLE --version)"

# 2. Navigate to the ESLint config directory
Write-Host "2. Navigating to ESLint configuration directory: $ESLINT_CONFIG_DIR"
Push-Location "$PROJECT_ROOT\$ESLINT_CONFIG_DIR"

# 3. Install project dependencies
Write-Host "3. Installing Node.js dependencies (if not already installed)..."
try {
    & $NPM_EXECUTABLE install --silent
    Write-Host "   Node.js dependencies installed successfully."
} catch {
    Write-Error "Failed to install Node.js dependencies. Error: $($_.Exception.Message)"
    Pop-Location
    Exit 1
}

# 4. Run ESLint Check
Write-Host "4. Running ESLint check..."
try {
    # Check if ESLint is locally installed and use its path
    $eslintPath = Join-Path (Get-Location) "node_modules\.bin\eslint.cmd"
    if (-not (Test-Path $eslintPath)) {
        Write-Error "ESLint executable not found at '$eslintPath'. Ensure it's listed in package.json devDependencies and npm install was successful."
        Pop-Location
        Exit 1
    }

    & $eslintPath .
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ ESLint check passed with no issues."
    } else {
        Write-Warning "⚠️ ESLint check found issues. Review the output above."
    }
} catch {
    Write-Error "Failed to run ESLint check: $($_.Exception.Message)"
    Pop-Location
    Exit 1
}

# 5. Offer to Run ESLint Fix
Write-Host ""
$choice = Read-Host "Do you want to attempt to fix issues automatically? (Y/N)"
if ($choice -eq "Y" -or $choice -eq "y") {
    Write-Host "5. Running ESLint fix..."
    try {
        $eslintPath = Join-Path (Get-Location) "node_modules\.bin\eslint.cmd"
        if (-not (Test-Path $eslintPath)) {
            Write-Error "ESLint executable not found at '$eslintPath'. Ensure it's listed in package.json devDependencies and npm install was successful."
            Pop-Location
            Exit 1
        }
        & $eslintPath . --fix
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ ESLint fix completed. All fixable issues addressed."
        } else {
            Write-Warning "⚠️ ESLint fix completed, but some issues might remain or couldn't be fixed automatically. Review the output above."
        }
    } catch {
        Write-Error "Failed to run ESLint fix: $($_.Exception.Message)"
        Pop-Location
        Exit 1
    }
} else {
    Write-Host "Skipping ESLint fix."
}

Pop-Location # Return to original directory
Write-Host "----------------------------------------------------"
Write-Host "Script finished."