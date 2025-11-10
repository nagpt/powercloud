# Interactive Power Electronics Lab – Boost Converter (v1.1)
- Uses your provided SVG (`assets/buck_user.svg`) with responsive clickable hotspots for VIN, S, D, L, C, R.
- All sliders update live, including new **Periods (1–10)** slider.
- Y axis uses “nice 5s” tick steps. X axis shows time ticks with engineering units.
- Right parameter panel is sticky while scrolling.
- Legend labels are color coded and hover-linked to plots; hovering plots highlights the nearest series.

**Adjusting hotspot positions**: Edit `index.html`, tweak the percentage `left/top/width/height` on each `.hotspot`. Send me an SVG if you want me to map exact component group IDs for native in-SVG highlight.

Run: open `index.html` in your browser.
