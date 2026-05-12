# Install Tesseract OCR + Python deps for portfolio screenshot OCR (Windows).
# Run from project root in PowerShell (may prompt for elevation for winget):

Write-Host "Installing Tesseract OCR via winget (if available)..."
winget install --id UB-Mannheim.TesseractOCR --accept-package-agreements --accept-source-agreements 2>$null

Write-Host "Installing Python packages..."
pip install Pillow "pytesseract>=0.3.10"

Write-Host "Done. Restart Flask (`python app.py`), then try Analyze Portfolio again."
