@echo off
title Discord REA - Servidor Multi-Rede (Voz, Video & Compartilhamento de Tela)
echo =====================================================================
echo   Iniciando Discord REA (Recriado com morluto/rea)
echo =====================================================================
cd /d "%~dp0"
start "" "http://localhost:3000"
node server.js
pause

