@echo off
REM Stock Market Docker Deployment Script for Windows
REM This script automates common Docker deployment tasks

setlocal enabledelayedexpansion

set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

echo.
echo ========================================
echo Stock Market Docker Deployment
echo ========================================
echo.

REM Check if Docker is installed
docker --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not installed or not in PATH
    pause
    exit /b 1
)

docker-compose --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker Compose is not installed or not in PATH
    pause
    exit /b 1
)

echo [OK] Docker and Docker Compose are installed
echo.

:menu
cls
echo ========================================
echo Stock Market Docker Deployment Menu
echo ========================================
echo.
echo 1. Setup environment (.env)
echo 2. Build Docker images
echo 3. Start services
echo 4. Stop services
echo 5. Restart services
echo 6. Rebuild (clean build and restart)
echo 7. View logs
echo 8. Health check
echo 9. Show status
echo 10. Cleanup (remove containers/volumes)
echo 0. Exit
echo.

set /p choice="Select option: "

if "%choice%"=="1" goto setup_env
if "%choice%"=="2" goto build_images
if "%choice%"=="3" goto start_services
if "%choice%"=="4" goto stop_services
if "%choice%"=="5" goto restart_services
if "%choice%"=="6" goto rebuild
if "%choice%"=="7" goto view_logs
if "%choice%"=="8" goto health_check
if "%choice%"=="9" goto show_status
if "%choice%"=="10" goto cleanup
if "%choice%"=="0" exit /b 0

echo Invalid option
pause
goto menu

:setup_env
cls
if exist ".env" (
    echo [INFO] .env file already exists
) else (
    echo [INFO] Creating .env file from template...
    copy ".env.example" ".env" >nul
    echo [OK] .env file created
    echo [WARNING] Please review and update .env file if needed
)
pause
goto menu

:build_images
cls
echo Building Docker images...
docker-compose build
echo.
echo [OK] Docker images built successfully
pause
goto menu

:start_services
cls
echo Starting Docker services...
docker-compose up -d
echo.
echo [INFO] Waiting for services to be healthy...
timeout /t 5 /nobreak
echo.
docker-compose ps
pause
goto menu

:stop_services
cls
echo Stopping Docker services...
docker-compose stop
echo [OK] Docker services stopped
pause
goto menu

:restart_services
cls
echo Restarting Docker services...
docker-compose restart
echo [OK] Docker services restarted
echo.
docker-compose ps
pause
goto menu

:rebuild
cls
echo Rebuilding services...
docker-compose down
docker-compose build --no-cache
docker-compose up -d
echo [OK] Services rebuilt and started
pause
goto menu

:view_logs
cls
docker-compose logs -f --tail=50
goto menu

:health_check
cls
echo Checking service health...
echo.
docker-compose ps
pause
goto menu

:show_status
cls
echo Service Status:
docker-compose ps
echo.
echo Service Endpoints:
echo Frontend (Vite React):    http://localhost:8080
echo Next.js Web:              http://localhost:3000
echo Flask Backend:            http://localhost:5000
echo Express API:              http://localhost:3001
echo Nginx Reverse Proxy:      http://localhost
echo Redis:                    localhost:6379
echo.
pause
goto menu

:cleanup
cls
set /p confirm="Remove containers? (y/n): "
if /i "%confirm%"=="y" (
    docker-compose down
    echo [OK] Containers removed
)
set /p confirm="Remove volumes? (y/n): "
if /i "%confirm%"=="y" (
    docker-compose down -v
    echo [OK] Volumes removed
)
pause
goto menu
