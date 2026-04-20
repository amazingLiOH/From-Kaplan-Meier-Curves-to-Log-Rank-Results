# Curve to Contrast

`Curve to Contrast` is a lightweight local website for reconstructing approximate survival data from Kaplan-Meier figures and turning that reconstruction into comparative statistics.

## What the project does

### Core features

1. Upload a Kaplan-Meier curve image.
2. Send the image to a vision-capable LLM API.
3. Extract approximate event times and event indicators from the figure.
4. Expand the extracted counts into pseudo-records with `time` and `event`.
5. Compute a two-arm log-rank test and display the result in the browser.
6. Search PubMed for chaining `A vs B` and `B vs C` evidence.
7. Estimate an indirect `A vs C` comparison using a shared comparator.
8. Save reconstructed trials in a local study vault.
9. Load demo studies for presentations and offline UI testing.
10. Review Kaplan-Meier rendering, extraction notes, warnings, and record previews in the browser.

## Stack

- Frontend: static HTML, CSS, and vanilla JavaScript
- Backend: Python standard library HTTP server
- External services:
  - OpenAI Responses-compatible LLM endpoint for figure extraction
  - PubMed E-utilities for article lookup

No npm, bundler, or third-party Python packages are required.

## Run locally

```bash
cd /Users/qingyangli/Documents/Codex/2026-04-18-design-a-website-that-uses-llm-2
python3 server.py
```

Then open `http://127.0.0.1:8000`.

Each user must paste their own API key into the UI before running extraction.

Optional environment variables:

- `HOST`
- `PORT`

## Public deployment

For a public deployment, keep the API key user-supplied:

- Do not set `OPENAI_API_KEY` on the server
- Ask each visitor to enter their own key in the website
- Set `HOST=0.0.0.0` on platforms such as Railway so the service is publicly reachable

This avoids exposing or sharing a single server-side API key across all visitors.

## Extraction workflow

1. Upload a Kaplan-Meier image.
2. Label the two treatment arms.
3. Optionally provide numbers-at-risk text or axis calibration hints.
4. The backend calls the LLM and asks for a strict JSON event table.
5. The browser expands that event table into pseudo-records.
6. The browser computes:
   - log-rank chi-square
   - p-value
   - approximate hazard ratio and 95% confidence interval
   - reconstructed survival curves

## Indirect-comparison workflow

1. Search PubMed for an `A vs B` study.
2. Search PubMed for a `B vs C` study.
3. Use the returned article metadata while extracting the two Kaplan-Meier figures.
4. Save both reconstructed studies into the vault.
5. Use the indirect-comparison panel to estimate `A vs C`.

The indirect comparison uses a shared-comparator combination on the saved study estimates:

- `log(HR_AC) = log(HR_AB) + log(HR_BC)`
- `Var(log(HR_AC)) = Var(log(HR_AB)) + Var(log(HR_BC))`

## Limitations

- LLM extraction from Kaplan-Meier images is approximate and should be reviewed manually.
- Hazard-ratio estimates are derived from reconstructed pseudo-data, not original patient-level data.
- PubMed search helps identify candidate articles, but article selection and curve extraction still need human review.
