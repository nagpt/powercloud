# Interactive Power Electronics Lab – Buck Converter (v0.1)

This is a **zero-dependency** static web app for demonstrating an ideal **buck converter** in CCM.
It includes:

- A clickable topology diagram (SVG). Click a component to plot its **voltage**. **Ctrl+Click** to plot its **current** (initial set supported: switch node voltage, inductor current/voltage, diode current, capacitor current, etc.).
- A responsive plot with a custom canvas renderer (no external libraries). 
- Pretty sliders **and** exact numeric inputs. Changes update the plot instantly.
- Waveform selectors, reset, and a clean dark UI.

> Roadmap: DCM, ESR, inductor DCR, diode drop, MOSFET Rds_on, and a generic probe system that maps any component to its v/i by click.

## Quick Start

1. **Download the ZIP** and extract.
2. Open `index.html` in any modern browser (Chrome, Edge, Safari, Firefox). No build step needed.

## File Layout

```
buck_demo/
├─ index.html
├─ style.css
├─ app.js
├─ assets/
│  └─ buck_topology.png  (optional reference)
└─ README.md
```

## Model Assumptions (v0.1)

- Ideal buck, **CCM only**.
- `V_o = D * V_i`.
- Inductor ripple: `Δi_L = ((V_i - V_o)/L) * D * T_s`.
- Off-slope: `(-V_o/L) * (1-D) * T_s`.
- Capacitor ripple is obtained by integrating `i_C = i_L - i_o` over time and removing DC drift to keep zero-mean ripple.
- Switch current equals inductor current during ON. Diode current equals inductor current during OFF.

## Notes

- Time axis spans **two periods** by default (toggle in the right panel).
- Units: `fsw` in **kHz**, `L` in **µH**, `C` in **µF**.
- This is a teaching scaffold. For research/assignments, extend the model before use.

## Next Up (suggested)

- DCM mode detection and waveform synthesis.
- ESR/DCR/diode drop / Rds_on.
- Cin dynamics and input current ripple.
- Cursor readouts, area-under-curve energy markers.
- Save/Share parameter URLs, multiple topologies & tabs.
- Full probe system: click = voltage, Ctrl+Click = current (highlight persists with legend entries).
```

