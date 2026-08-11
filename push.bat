@echo off
chcp 65001 >nul
REM ===== 변경사항을 GitHub에 올리기 =====
cd /d "%~dp0"
set /p MSG=커밋 메시지를 입력하세요(엔터=update):
if "%MSG%"=="" set MSG=update
call git add -A
call git commit -m "%MSG%"
if errorlevel 1 echo   (올릴 변경사항이 없을 수 있습니다)
call git push || goto :error
echo.
echo ===== GitHub에 반영 완료! =====
echo   (PR 검증과 main 병합 후 자체 서버 배포가 필요합니다)
pause
exit /b 0
:error
echo.
echo [오류] git push 실패. GitHub 로그인/권한을 확인하세요.
pause
exit /b 1
