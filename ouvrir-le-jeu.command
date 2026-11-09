#!/bin/zsh
set -u
cd "$(dirname "$0")" || exit 1

if ! command -v npm >/dev/null 2>&1; then
  echo "Node.js et npm sont nécessaires pour lancer le jeu."
  read -r '?Appuyez sur Entrée pour fermer...'
  exit 1
fi

if [[ ! -d node_modules ]]; then
  npm install || exit 1
fi

server_pid=''
client_pid=''
if ! lsof -nP -iTCP:8788 -sTCP:LISTEN >/dev/null 2>&1; then
  npm run server > serveur-local.log 2>&1 &
  server_pid=$!
fi
if ! lsof -nP -iTCP:5173 -sTCP:LISTEN >/dev/null 2>&1; then
  npm run dev > client-local.log 2>&1 &
  client_pid=$!
fi

for i in {1..40}; do
  curl -fsS --max-time 1 http://127.0.0.1:5173/ >/dev/null 2>&1 && break
  sleep 0.25
done

if ! curl -fsS --max-time 2 http://127.0.0.1:5173/ >/dev/null 2>&1; then
  echo "Le client ne démarre pas. Consultez client-local.log."
  read -r '?Appuyez sur Entrée pour fermer...'
  exit 1
fi

echo "Maison Masquée est ouvert sur http://localhost:5173"
echo "Gardez cette fenêtre ouverte pendant la partie. Fermez-la pour arrêter le jeu lancé ici."
if [[ "${NO_OPEN:-0}" != '1' ]]; then
  open http://localhost:5173
fi

trap '[[ -n "$client_pid" ]] && kill "$client_pid" 2>/dev/null; [[ -n "$server_pid" ]] && kill "$server_pid" 2>/dev/null' EXIT
if [[ -n "$client_pid" ]]; then
  wait "$client_pid"
elif [[ -n "$server_pid" ]]; then
  wait "$server_pid"
else
  read -r '?Appuyez sur Entrée pour fermer...'
fi
