# Standalone_Youtube_player_without_controls

A tiny, dependency-free **clean YouTube player** — embed YouTube videos with **no YouTube logo, no title bar, no share button, no native controls, and no end-screen recommendations**. It renders its own minimal control bar instead (play/pause, seek, volume, speed, fullscreen).

This is the same technique learning platforms like **Learnyst / Tutor LMS** use to make YouTube-hosted lessons look like a native, branding-free player — while still using YouTube's free, unlimited CDN.

## Demo

Open `index.html` in a browser (or serve the folder), paste any YouTube URL, and hit **Load video**.

```bash
# any static server works, e.g.:
npx serve .
# then open http://localhost:3000
```

## How it stays "clean"

YouTube's IFrame API can't fully remove branding by itself, so this combines three tricks:

1. **`controls=0`** — hides all native YouTube UI during playback.
2. **Custom poster** — a thumbnail + play button covers YouTube's branded **start screen** and **pause screen** (where the title, share, watch-later and logo always appear).
3. **Iframe crop** — the iframe is rendered slightly taller than the frame and shifted up, so the title bar (top) and watermark/logo (bottom) are cropped out of view while the 16:9 video still fills the frame exactly.

A transparent overlay also blocks all clicks into the iframe (no right-click menu, no clickable recommendations).

## Usage

```html
<link rel="stylesheet" href="clean-youtube-player.css" />
<div id="player"></div>
<script src="clean-youtube-player.js"></script>
<script>
  const player = new CleanYouTubePlayer(document.getElementById("player"), {
    videoId: "aqz-KE-bpKQ",   // or:  url: "https://youtu.be/aqz-KE-bpKQ"
    accent: "#6d28d9",         // optional brand color
  });
</script>
```

### API

| Option   | Type     | Description                                  |
| -------- | -------- | -------------------------------------------- |
| `videoId`| `string` | YouTube video ID                             |
| `url`    | `string` | Full YouTube URL (used if `videoId` omitted) |
| `accent` | `string` | CSS color for buttons (default purple)       |

Methods: `toggle()`, `toggleMute()`, `destroy()`.
Static: `CleanYouTubePlayer.extractId(urlOrId)`.

## Files

- `clean-youtube-player.js` — the player (vanilla JS, ~6 KB)
- `clean-youtube-player.css` — styles
- `index.html` — demo page

## Important: this is not DRM

The video is still served by YouTube and the source video ID is discoverable via browser devtools. This is great for **normal / free lessons** where you want a clean look and YouTube's free bandwidth. For **paid or piracy-sensitive** content, use a proper protected host (Cloudflare Stream, Vimeo Pro, AWS IVS) with signed URLs and optional DRM/watermarking.

## License

MIT
