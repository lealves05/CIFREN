@echo off
chcp 65001 >nul
title CIFREN - atualizar (backup local + envio ao GitHub; a publicacao e automatica)
setlocal EnableExtensions
cd /d "%~dp0"
rem ============================================================================
rem  Atualiza o CIFREN publicado:
rem    1) (opcional) aplica um bundle entregue pelo Claude na branch "cloudflare":  ATUALIZAR-CIFREN.bat "..\Claude outputs\cifren-xxx.bundle"
rem    2) backup local em D:\Programacao\BACKUP-Sistemas (nunca sobrescreve: proxima versao)
rem    3) envia a branch "cloudflare" ao GitHub (a main nao e alterada)
rem    4) o GitHub Actions (.github/workflows/vps.yml) roda os testes e guarda o backup (Release);
rem       a VPS busca a branch sozinha (lorler-atualizar) e publica em cifren.lorler.com.br.
rem ============================================================================
set "REPO=lealves05/CIFREN"
if exist "%~dp0..\node-v24.20.0-win-x64\node.exe" set "PATH=%~dp0..\node-v24.20.0-win-x64;%PATH%"
where git >nul 2>nul || (echo Git nao encontrado. Instale em https://git-scm.com/download/win & pause & exit /b 1)
if exist ".git\index.lock" del /f /q ".git\index.lock"
git rev-parse --verify cloudflare >nul 2>nul || (echo A branch "cloudflare" nao existe neste repositorio. & pause & exit /b 1)

if not "%~1"=="" (
  echo  [1/3] Aplicando o bundle %~1 na branch cloudflare...
  git bundle verify "%~1" >nul 2>nul || (echo   Bundle invalido ou incompleto. & pause & exit /b 1)
  git fetch "%~1" cloudflare:cloudflare || (echo   Nao foi possivel aplicar o bundle ^(a branch local pode ter commits que o bundle nao tem^). & pause & exit /b 1)
  echo   OK
) else (
  echo  [1/3] Sem bundle informado: publicando a branch cloudflare como esta.
)
for /f "delims=" %%C in ('git log -1 --format^="%%h %%s" cloudflare') do echo   Versao: %%C

echo  [2/3] Backup local da versao...
node "%~dp0backup-sistema.mjs" --sistema CIFREN --repo "%~dp0." --ref cloudflare --destino "D:\Programacao\BACKUP-Sistemas"
if errorlevel 1 (echo   O backup falhou: envio cancelado para nao publicar sem copia de seguranca. & pause & exit /b 1)

echo  [3/3] Enviando a branch cloudflare ao GitHub...
git remote get-url origin >nul 2>nul || git remote add origin https://github.com/%REPO%.git
git push -u origin cloudflare || (echo   Falhou o envio ao GitHub. Confira a internet e o login do Git. & pause & exit /b 1)
echo   OK - o GitHub roda os testes e o backup; a VPS atualiza sozinha em alguns minutos.
echo.
echo  Acompanhe em https://github.com/%REPO%/actions  (ou: gh run watch --repo %REPO%)
where gh >nul 2>nul && (timeout /t 8 >nul & gh run list --repo %REPO% --workflow vps.yml --limit 1)
echo.
echo  Quando a VPS atualizar (ate 15 minutos, ou VPS-MENU › 1 para ja): https://cifren.lorler.com.br/entrar
pause
exit /b 0
