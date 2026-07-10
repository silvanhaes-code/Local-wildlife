# Local Wildlife 🌿

A small, installable web app for learning about **local wildlife**. Pick a
region, choose a category, and browse the most common and iconic species with
short descriptions, identification tips, habitat notes and pictures.

- **Regions:** England (UK), Germany, Virginia (USA)
- **Categories:** Trees, Plants, Birds, Animals
- **~10 species** per category (≈120 entries)
- **Bilingual:** every entry is in English; German entries also show German
  names and descriptions
- **Pictures:** open-license illustrations & photos from Wikimedia Commons,
  fully credited (see [`credits.html`](credits.html)). Birds include a
  wings-spread image where one is available.
- **Installable (PWA):** works offline and can be added to the iPhone home
  screen.

## Tech

Plain static site — HTML, CSS and vanilla JavaScript (ES modules) with content
in JSON. No build step. A service worker (`sw.js`) provides offline caching and
`manifest.webmanifest` makes it installable.

## Run locally

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Project layout

```
index.html            App shell
css/styles.css        Styles (light + dark)
js/                   Router, data loader, PWA registration
data/*.json           One file per region (species content)
assets/images/        Downloaded, credited species images
assets/icons/         App + placeholder icons
scripts/fetch_images.mjs   Dev tool that (re)builds the image set
credits.html          Image attributions & licenses
sw.js                 Service worker (offline)
```

## Updating the images

Images are committed to the repo so the live site needs no network. To
regenerate or refresh them:

```bash
cd scripts
npm install         # installs sharp
node fetch_images.mjs
```

The script reads each `data/<region>.json`, finds an open-license image for each
species on Wikimedia Commons (Public Domain / CC0 / CC-BY / CC-BY-SA only),
downscales it to WebP under `assets/images/`, and writes the credit metadata back
into the JSON and into `credits.html`.

## Deployment (GitHub Pages)

A GitHub Actions workflow (`.github/workflows/deploy-pages.yml`) deploys the site
on every push. **One-time setup:** in the repository, go to
**Settings → Pages → Build and deployment → Source: GitHub Actions**. The site
will then be published at `https://<user>.github.io/Local-wildlife/`.

## Notes & limitations

- Image styles vary (a mix of vintage naturalist plates and photographs) because
  they are sourced from open collections — chosen for recognizability.
- A suitable open-license wings-spread photo isn't available for every bird;
  those fall back to a single portrait image.
