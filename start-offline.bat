@echo off
chcp 65001 >nul
echo ========================================
echo    警察抓小偷 3D - 离线演示版
echo ========================================
echo.
set "PROJECT_DIR=%~dp0"
echo 正在打开离线演示版...
echo 无需安装 Node.js，可直接单机游玩
echo.
start "" "%PROJECT_DIR%public\index.html"
pause
