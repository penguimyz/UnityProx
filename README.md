# Unity

Ocean-themed start page with tabs, a games library, AI chat, movies, and an OS-style desktop mode. Built for Railway.

## Deploy

Push this folder to your repo; Railway picks up `railway.toml` / `nixpacks.toml` and runs `sh start.sh`.

## AI chat with Ollama on your PC (over Tailscale)

The browser talks to `/ai` on the Railway server, and the server relays to Ollama on your PC. Pick **one** of these two ways for Railway to reach the PC.

### Option A — Railway joins your tailnet (private, recommended)

1. **On the Windows PC**
   - Make Ollama listen on all interfaces: set the system environment variable `OLLAMA_HOST=0.0.0.0`, then quit and reopen Ollama from the tray.
   - Pull the model: `ollama pull deepseek-r1:7b`
   - Allow port 11434 through Windows Firewall (Tailscale traffic only is fine).
   - Note the PC's Tailscale IP (`tailscale ip -4`, looks like `100.x.y.z`).
2. **In the Tailscale admin console** → Settings → Keys → generate an auth key. Tick **Ephemeral** and **Reusable** (Railway redeploys create a new node each time).
3. **In Railway → Variables**
   ```
   TS_AUTHKEY=tskey-auth-xxxxxxxx
   OLLAMA_URL=http://100.x.y.z:11434
   OLLAMA_MODEL=deepseek-r1:7b
   ```
   Optional: `TS_HOSTNAME=unity-railway`.

`start.sh` starts `tailscaled` in userspace mode (no root or TUN device needed) with an HTTP proxy on `127.0.0.1:1055`, and the server sends Ollama requests through it. Use the `100.x` IP rather than a MagicDNS name.

### Option B — Tailscale Funnel (simpler, but public)

On the PC: `tailscale funnel 11434`, then set `OLLAMA_URL=https://your-pc.your-tailnet.ts.net` in Railway. No `TS_AUTHKEY` needed. Funnel makes Ollama reachable by anyone who knows the URL, so prefer Option A.

### Checking it

Open **Settings → AI** in Unity. It shows whether your PC is online and which models are installed. In the chat, pick **My PC**; if you have more than one model, a dropdown appears next to it. DeepSeek-R1's reasoning shows as a collapsible "Thought process" block (it can be turned off in Settings → AI).

### Direct mode (optional)

If the device you're browsing on is itself on your tailnet, Settings → AI → *Direct Ollama URL* lets the browser call Ollama without the server. It needs HTTPS (`tailscale serve --bg 11434` gives you `https://your-pc.your-tailnet.ts.net`) and `OLLAMA_ORIGINS=*` set on the PC.

The cloud models (GPT-4o mini, Mistral, Search GPT via Pollinations) work without any setup.

## Features

- **Ocean**: WebGL water (Snell's window, god rays, caustics on sand, fog, marine snow, click ripples) plus 3D voxel sea life rendered as pixel art: schools of fish that turn in 3D and scatter from your cursor, sharks, turtles, manta rays, jellyfish, crabs, boats passing overhead with prop wash, clownfish in anemones, a coral reef and a shipwreck. Six themes; quality and density settings; pauses itself behind sites and games.
- **Games**: library with categories, search, sort, random; star favorites (shown on home, the desktop widget and start menu); recently played and play counts.
- **Desktop mode** (Alt+D): windows you can drag, resize, snap to the edges and maximize; taskbar, start menu with search, desktop icons, clock and favorites widgets, right-click menu. Apps: Browser, Games, Unity AI, Movies, Notes, Calculator, Terminal (`help` for commands), Settings.
- **Browser mode**: real tabs (each keeps its page alive), address bar with game/shortcut/history suggestions, command palette (Ctrl+K), console, shortcuts, tab disguise presets, panic key, backup export/import.

Add games in `public/js/games.js`.
