#!/bin/sh
# Joins your tailnet (userspace networking, no root/TUN needed) when TS_AUTHKEY is set,
# then starts the site. Ollama traffic goes through Tailscale's HTTP proxy on 127.0.0.1:1055.
if [ -n "$TS_AUTHKEY" ] && command -v tailscaled >/dev/null 2>&1; then
  SOCK=/tmp/tailscaled.sock
  tailscaled --tun=userspace-networking --state=mem: --socket=$SOCK \
    --outbound-http-proxy-listen=127.0.0.1:1055 --socks5-server=127.0.0.1:1056 >/tmp/tailscaled.log 2>&1 &
  i=0; while [ ! -S $SOCK ] && [ $i -lt 20 ]; do sleep 0.5; i=$((i+1)); done
  tailscale --socket=$SOCK up --authkey="$TS_AUTHKEY" --hostname="${TS_HOSTNAME:-unity-railway}" --accept-dns=true \
    && echo "[tailscale] connected as ${TS_HOSTNAME:-unity-railway}" \
    || echo "[tailscale] could not join the tailnet — check TS_AUTHKEY"
elif [ -n "$TS_AUTHKEY" ]; then
  echo "[tailscale] TS_AUTHKEY is set but tailscaled is not installed (nixpacks.toml adds it)"
fi
exec node server.js
