# CLAUDE.md

Guidance for AI assistants working in this repository.

## Project overview

React 19 + Vite + Firebase app for the MakeHaven Entrepreneurship Nexus — currently styled with Tailwind via the Play CDN (`<script src="https://cdn.tailwindcss.com">` in `index.html`), no `tailwind.config.js`.

See `GEMINI.md` for additional context.

## Visual style

Before adding visible UI, read `/mnt/extra_storage/makehaven-webdev/STYLE.md`. The canonical MakeHaven brand color is **red `#8b1919`**, with display headings in Roboto Condensed and body in Montserrat.

Because this app uses the Tailwind Play CDN (no config file), brand tokens aren't compiled in yet. For any new branded UI, prefer one of:
1. Use the brand hex directly via Tailwind's arbitrary-value syntax — `bg-[#8b1919]`, `text-[#8b1919]`, `hover:bg-[#710a0a]` — and keep usage to true brand/primary moments.
2. Or, if/when this app moves off the Play CDN to a real Vite + Tailwind setup, port the brand `extend` block from `STYLE.md` §3C and switch to `bg-makehaven` etc.

Don't introduce another component library without explicit user sign-off.
