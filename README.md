# photoatlas

**Your photos already know where you have been.** Drop a folder of them and ten
years become one map you can watch fill in, year by year.

No account, no upload, no server. The files are read in the browser tab they were
dropped into and never leave it — the whole product is a static page.

![photoatlas showing the demo data](docs/screenshot.png)

**Try it: [rawqubit.github.io/photoatlas](https://rawqubit.github.io/photoatlas/)** — the demo runs on 115 sample photos, and takes one click.

## What it does

Every phone photo carries the coordinates of the moment it was taken, in an EXIF
block at the front of the JPEG. Phones have written them for fifteen years;
almost nobody ever sees them. `photoatlas` reads the ones it can find and turns
them into:

- **A map that fills in.** A timeline scrubs 2016 → today; pins appear as their
  photos arrive, with a glow that fades as the moment passes.
- **Trips.** Photos are grouped into trips when more than 36 hours separates
  them, so a week in Lisbon reads as one entry instead of forty.
- **Places.** Points within 25 km collapse into one place, because four hundred
  photos of the same block are not four hundred places.
- **A card you can post.** One button renders a 1200×630 PNG of the map with
  your years and totals on it.

It also counts what it could not read: **an ROC figure of "photos with a
location" is shown up front**, because a folder of screenshots has none and you
should know that in the first second, not after waiting.

## The privacy claim, and how to check it

The page wraps `fetch` and `XMLHttpRequest` before it does anything else and
counts every call. The counter sits in the header and stays at **0 bytes** while
you use it. That is a demo, not a proof, so here is the proof:

- `index.html` is one file plus two scripts, and you can read all of them.
- There is no analytics, no CDN, no font request, no model download.
- Open DevTools → Network, drop a folder, sort by size. Nothing moves.
- Turn off your network after the page loads. It keeps working.

The EXIF parsing is 190 lines in [`src/exif.js`](src/exif.js) with no
dependencies, so you can check it instead of trusting it.

## Run it

```bash
git clone https://github.com/rawqubit/photoatlas
cd photoatlas
python3 -m http.server 8080
```

Then open <http://localhost:8080>. It needs a server (not `file://`) because it
loads two scripts, and it works offline once loaded.

## Tests

```bash
node --test test/exif.test.mjs
```

Four tests run the parser against synthetic JPEGs whose EXIF blocks are built
byte by byte in [`test/make-fixtures.py`](test/make-fixtures.py) — north-east and
south-west hemispheres, the EXIF `YYYY:MM:DD` timestamp format, and truncated
input, which used to throw a `RangeError` before it was caught.

## Honest limits

- **JPEG only.** HEIC (the iPhone default) puts EXIF in a container this reader
  does not parse yet, and PNG rarely carries GPS at all.
- **No reverse geocoding.** Trips are labelled with dates, not city names,
  because doing it offline means shipping a gazetteer, and doing it online means
  sending your coordinates to somebody. Neither trade felt right for v1.
- **The map is a dot grid, not a projection party.** Land is rasterised from a
  simplified 110 m outline at load time. It is 56 KB and it looks like a map;
  it is not a cartographic product.
- **iCloud/Photos exports flatten dates.** If your folder has no timestamps, the
  photos are placed at the current time and the timeline collapses to one year.

## License

MIT, © Srinikhil Chakilam. The land outline is derived from
[Natural Earth](https://www.naturalearthdata.com/) 1:110m data via
[world-atlas](https://github.com/topojson/world-atlas), public domain.
