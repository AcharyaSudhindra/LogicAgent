@echo off
title LogicAgent AI Launcher
echo =======================================
echo LogicAgent AI
echo =======================================
echo.

:: Check for python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in your PATH!
    echo Please install Python from https://www.python.org/downloads/
    pause
    exit /b
)

:: Prompt for Gemini API Key if not set
if "%GEMINI_API_KEY%"=="" (
    echo [Optional] The AI RTL Debug Assistant requires a Gemini API Key.
    echo You can get a free one at: https://aistudio.google.com/
    set /p GEMINI_API_KEY="Paste your API key here (or press Enter to skip): "
)

echo.
echo Installing dependencies (Flask, Google GenAI)...
python -m pip install --quiet flask google-genai

echo.
echo Starting Web Server on http://127.0.0.1:5000/
echo (Keep this window open to keep the server running!)
echo.

:: Launch the browser (it might open before the server is fully ready, but usually fast enough)
start "" http://127.0.0.1:5000/

:: Start the app
python app.py

pause
