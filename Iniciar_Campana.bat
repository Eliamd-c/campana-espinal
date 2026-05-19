@echo off
title Iniciar Campaña Espinal 🚀
color 0A
echo ======================================================================
echo             INICIANDO SERVIDOR LOCAL - CAMPAÑA ESPINAL
echo ======================================================================
echo.
echo [1/3] Accediendo a la carpeta del proyecto...
cd /d "c:\Users\elamd\Documents\Aplicativo\campana-espinal"

echo [2/3] Iniciando el servidor Next.js en una ventana secundaria...
start "Servidor Campaña Espinal" cmd /k "npm run dev"

echo [3/3] Esperando 5 segundos para que la aplicación esté lista...
timeout /t 5 /nobreak >nul

echo ¡Abriendo la aplicación en tu navegador web! 🌐
start "" "http://localhost:3000"

echo ======================================================================
echo  ¡TODO LISTO! Ya puedes usar la aplicación.
echo  NOTA: No cierres la otra ventana negra que se abrió (Servidor),
echo        ya que es la que mantiene activa la aplicación.
echo ======================================================================
echo.
pause
exit
