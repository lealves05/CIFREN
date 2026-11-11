#!/bin/sh
# API de GRAVAÇÃO das vídeo-aulas do CIFREN (porta 3373, banco cifren_rec) com os serviços externos FICTÍCIOS de fake-externos.mjs.
# Só para gravar: nunca use estas variáveis em produção. Uso: sh api-rec.sh (encerre pelo PID que você iniciou).
# Central de GRAVAÇÃO opcional (API do ORBI na 3343, banco orbi_rec): só liga se REC_PLATFORM_SECRET vier no ambiente — o segredo nunca fica aqui.
cd "$(dirname "$0")/../../backend" || exit 1
export PORT=3373 DATABASE_URL="${REC_DB:-postgres://t:t@localhost:5432/cifren_rec}" DATA_KEY="${REC_DATA_KEY:-chave-de-dados-so-para-gravar-as-aulas-0123456789abcdef}"
export RATE_LIMIT_FACTOR=200 CIFREN_SCHEDULER=off PUBLIC_URL=https://cifren.lorler.com.br
export ANTHROPIC_URL=http://127.0.0.1:4525/v1/messages
if [ -n "$REC_PLATFORM_SECRET" ]; then export PLATFORM_HUB_URL=http://127.0.0.1:3343 PLATFORM_PRODUCT=cifren PLATFORM_SECRET="$REC_PLATFORM_SECRET"; fi
exec node src/server.js
