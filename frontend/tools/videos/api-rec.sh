#!/bin/sh
# API de GRAVAÇÃO das vídeo-aulas (porta 3363, banco cifren_rec com papel sem superusuário, como na VPS).
# IA e WhatsApp apontam para os serviços FICTÍCIOS (fake-externos.mjs, porta 4521). Só para gravar: nunca use estas variáveis em produção.
# Uso: sh api-rec.sh   (fica em primeiro plano; encerre pelo PID que você iniciou)
cd "$(dirname "$0")/../../../backend" || exit 1
export PORT=3363 HOST=127.0.0.1 DATABASE_URL="${REC_DB:-postgres://cifren_app:cifren_app@localhost:5432/cifren_rec}"
export RATE_LIMIT_FACTOR=1000 CIFREN_SCHEDULER=0 SIGNUP_OPEN=1 PLATFORM_MODE=standalone
# o código de conexão com o RUSTEN leva este endereço (a API de gravação do RUSTEN alcança a do CIFREN pela máquina local)
export PUBLIC_URL="${REC_PUBLIC_URL:-http://127.0.0.1:3363}"
export ANTHROPIC_URL=http://127.0.0.1:4521/v1/messages WHATSAPP_API_URL=http://127.0.0.1:4521/whatsapp
exec node src/server.js
