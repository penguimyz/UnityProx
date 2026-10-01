# Unity

Ocean-themed start page with tabs, a games library, AI chat, movies, and an OS-style desktop mode. Built for Railway.

## Deploy

Push this folder to your repo; Railway picks up `railway.toml` / `nixpacks.toml` and runs `sh start.sh`.

## Accounts (sync across devices)

Accounts store your favorites, settings, shortcuts, notes, AI chats and added games on the server.

**Attach a Railway volume or accounts are wiped on every redeploy:** in Railway, open the service → **Volumes** → **New volume**, mount path `/data`. Railway sets `RAILWAY_VOLUME_MOUNT_PATH` automatically and Unity uses it. (You can also set `DATA_DIR` yourself.)

Passwords are hashed with scrypt; sessions last 60 days.

## AI chat (deepseek-r1:7b on your PC, over Tailscale)

The browser talks to `/ai` on the Railway server, and the server relays to Ollama on your PC. The model is always `deepseek-r1:7b`.

1. **On the Windows PC**: set the system environment variable `OLLAMA_HOST=0.0.0.0`, restart Ollama, run `ollama pull deepseek-r1:7b`, allow port 11434 in Windows Firewall, and note your Tailscale IP (`tailscale ip -4`).
2. **Tailscale admin console** → Settings → Keys → generate an auth key with **Reusable** and **Ephemeral** ticked.
3. **Railway → Variables**:
   ```
   TS_AUTHKEY=tskey-auth-xxxxxxxx
   OLLAMA_URL=http://100.x.y.z:11434
   ```

`start.sh` runs Tailscale in userspace mode with an HTTP proxy on `127.0.0.1:1055`; the server sends Ollama traffic through it. The AI tab shows a green "Online" badge when it can reach the PC.

## Features

- **Ocean**: WebGL water (Snell's window, god rays, caustics, fog, click ripples) with Minecraft-style voxel sea life drawn as real 3D cubes in the same light and fog: seven fish species, a puffer that puffs up when you hover it, sharks, turtles, manta rays, jellyfish, crabs, boats overhead, clownfish in an anemone, coral, kelp, glowing sea pickles, a shipwreck and a treasure chest. Click the water to drop fish food. Six themes plus an automatic day/night theme. Resolution adapts automatically to keep it smooth.
- **Games**: library with categories, search, sort, random; star favorites (home page, desktop icons, start menu); recently played and play counts; add your own games; right-click a game for more options.
- **Desktop mode** (Alt+D): windows you can drag, resize, snap to the edges and maximize; taskbar, start menu with search, desktop icons, clock and favorites widgets, right-click menu. Apps: Browser, Games, Unity AI, Movies, Notes, Calculator, Timer, Terminal (`help` for commands), Settings. Leave with the Exit desktop button on the taskbar.
- **Browser mode**: real tabs (each keeps its page alive), address bar with game/shortcut/history suggestions, command palette (Ctrl+K), console, shortcuts, tab disguise presets, panic key, backup export/import.

Add games in `public/js/games.js`.
