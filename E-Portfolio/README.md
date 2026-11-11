# Mika's Class Portfolio

A portfolio built with HTML, CSS, and JavaScript. It needs no Node.js runtime, npm packages, or build step.

## Run locally

Open the project folder in VS Code and start Live Server from `index.html`. The site reads published entries from `portfolio-data.json` and attachments from `assets/portfolio/`.

## Publish with GitHub Pages

The repository is `Mmclaren12/ITE_Gattoc_Portfolio`. Publish from the repository root so `index.html`, `styles.css`, `script.js`, `portfolio-data.json`, and `assets/` are deployed together. The expected project-site URL is:

`https://mmclaren12.github.io/ITE_Gattoc_Portfolio/`

If Pages is not enabled, open **Settings → Pages**, choose **Deploy from a branch**, select the default branch and `/(root)`, then save. The link works after the repository files are pushed and the Pages deployment finishes.

## Portfolio entries and uploads

- `portfolio-data.json` contains the published entry titles, terms, descriptions, and attachment paths.
- `assets/portfolio/` contains the documents and screenshots referenced by that manifest.
- The recovered portfolio has 21 entries: 7 Prelim, 8 Midterm, and 6 Final, with 48 documents and screenshots.
- You can add entries or append documents and screenshots from the page. Browser uploads are saved in that browser profile's IndexedDB; they do not automatically appear in another profile or on GitHub Pages.
- To publish new uploads for everyone, add the files under `assets/portfolio/`, add their entry records to `portfolio-data.json`, then commit and redeploy. GitHub Pages serves static files and cannot write browser uploads back into the repository.
- Screenshot previews are view-only. Primary documents have download links.

**Privacy:** Files committed to a public GitHub repository are accessible to anyone who can view the repository or published site. Do not commit private documents.

## Main files

- `index.html` — page structure and term sections
- `styles.css` — layout, theme, and responsive styles
- `script.js` — navigation, search, browser storage, rendering, and previews
- `portfolio-data.json` — shared entry records and attachment paths
- `assets/portfolio/` — shared document and screenshot files
- `assets/mika-portrait.png` — profile photo
