# Lunar Ice Mission Dashboard

Run from the project root:

```bash
work/.venv/bin/python -m http.server 8765 --directory dashboard
```

Open:

```text
http://127.0.0.1:8765/
```

The dashboard is a self-contained static visualization for the Chandrayaan-2 lunar south-pole ice workflow. It shows the key deliverables in one place:

- ice volume and radar fusion KPIs
- OHRC-style crater context with target ROI
- radar / hazard / route composite panel
- landing-site ranking
- ice-fraction scenario slider
- confidence bars for CPR, DOP, PSR, and roughness
- detection pipeline and interpretation guardrails

When real pipeline outputs are available, use this dashboard as the presentation surface and replace the synthetic map layer logic in `app.js` with rendered PNG/tiles exported from QGIS or `work/data/processed/`.
