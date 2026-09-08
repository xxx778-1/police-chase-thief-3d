@echo off
chcp 65001 >nul
echo ========================================
echo    警察抓小偷 3D - 启动器
echo ========================================
echo.

REM 设置项目目录为当前目录
set "PROJECT_DIR=%~dp0"

REM 检查 Node.js 是否安装（优先 PATH）
node --version >nul 2>&1
if %errorlevel% equ 0 (
    echo [Node.js 已找到]
    goto :run_server
)

REM 检查常见安装路径
if exist "C:\Program Files\nodejs\node.exe" (
    set "PATH=%PATH%;C:\Program Files\nodejs"
    goto :run_server
)
if exist "C:\Program Files (x86)\nodejs\node.exe" (
    set "PATH=%PATH%;C:\Program Files (x86)\nodejs"
    goto :run_server
)

REM 未找到 Node.js，使用离线模式
echo [提示] 未检测到 Node.js，将使用浏览器直接打开离线演示模式。
echo [提示] 如需完整多人对战，请先安装 Node.js: https://nodejs.org/
echo.
echo 正在打开离线演示版...
start "" "%PROJECT_DIR%public\index.html"
pause
exit /b

:run_server
REM 检查依赖
if not exist "%PROJECT_DIR%node_modules" (
    echo 正在安装游戏依赖，请稍候...
    call npm install
    if %errorlevel% neq 0 (
        echo 依赖安装失败，使用浏览器离线模式启动。
        start "" "%PROJECT_DIR%public\index.html"
        pause
        exit /b
    )
)

echo 正在启动《警察抓小偷》服务器...
echo 游戏地址: http://localhost:3000
echo 按 Ctrl+C 停止服务器
echo.
start "" "http://localhost:3000"
npm start
pause
