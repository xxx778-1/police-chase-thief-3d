@echo off
chcp 65001 >nul
echo ========================================
echo    警察抓小偷 3D - 启动器
echo ========================================
echo.

REM 检查 Node.js 是否安装
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [提示] 未检测到 Node.js，将使用浏览器直接打开离线演示模式。
    echo [提示] 如需完整多人对战，请先安装 Node.js: https://nodejs.org/
    echo.
    start "" "public\index.html"
    exit /b
)

REM 检查依赖
if not exist "node_modules" (
    echo 正在安装游戏依赖，请稍候...
    call npm install
    if %errorlevel% neq 0 (
        echo 依赖安装失败，使用浏览器离线模式启动。
        start "" "public\index.html"
        exit /b
    )
)

echo 正在启动《警察抓小偷》服务器...
echo 游戏地址: http://localhost:3000
echo 按 Ctrl+C 停止服务器
echo.
start "" "http://localhost:3000"
npm start
