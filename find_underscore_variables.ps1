# find_underscore_variables.ps1
# This script searches for Python and JavaScript files and identifies variable/function names
# that use underscores for separation.

# --- Configuration ---
$PROJECT_ROOT = (Get-Location).Path
$PYTHON_FILES_PATTERN = "*.py"
$JAVASCRIPT_FILES_PATTERN = "*.js"

# --- Regular Expressions ---
# Regex to find identifiers that contain underscores
# For Python, this is standard snake_case
# For JavaScript, this might indicate non-camelCase or non-PascalCase
$underscorePattern = '[a-zA-Z0-9]+_[a-zA-Z0-9_]+'

Write-Host "CronoStar Variable Naming Convention Checker"
Write-Host "---------------------------------------------"

Write-Host "Searching for underscore-separated identifiers in Python files..."
Get-ChildItem -Path $PROJECT_ROOT -Include $PYTHON_FILES_PATTERN -File -Recurse | ForEach-Object {
    $filePath = $_.FullName
    $lineNum = 0
    Get-Content $filePath | ForEach-Object {
        $line = $_
        $lineNum++
        if ($line -match $underscorePattern) {
            # Find all matches on the line
            $matches = [regex]::Matches($line, $underscorePattern)
            foreach ($match in $matches) {
                Write-Host "  PY: $($filePath):$($lineNum): $($match.Value)"
            }
        }
    }
}

Write-Host "`nSearching for underscore-separated identifiers in JavaScript files..."
Get-ChildItem -Path $PROJECT_ROOT -Include $JAVASCRIPT_FILES_PATTERN -File -Recurse | ForEach-Object {
    $filePath = $_.FullName
    $lineNum = 0
    Get-Content $filePath | ForEach-Object {
        $line = $_
        $lineNum++
        if ($line -match $underscorePattern) {
            # Find all matches on the line
            $matches = [regex]::Matches($line, $underscorePattern)
            foreach ($match in $matches) {
                Write-Host "  JS: $($filePath):$($lineNum): $($match.Value)"
            }
        }
    }
}

Write-Host "`n---------------------------------------------"
Write-Host "Scan complete."