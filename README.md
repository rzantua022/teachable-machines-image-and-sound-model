# Finger Identifier

A small website that identifies which finger is shown (thumb, pointer, middle
finger, ring finger or pinky) using a Google Teachable Machine image model. You
can upload a photo or use the live camera. Both use the same model, which runs
in the browser with TensorFlow.js.

## Files

- `index.html`: page structure and all the text
- `style.css`: colors, fonts, layout (colors and fonts are variables at the top)
- `script.js`: model loading, upload, camera, results
- `model/`: `model.json`, `metadata.json` and `weights.bin`

The script looks for the model in `model/` first, then next to `index.html`.
Keeping it in `model/` is tidier.

## Run it locally

Don't open `index.html` by double-clicking it. The model and the camera both
need a web server. Use VS Code Live Server, or in this folder run:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Publish on GitHub Pages

1. Put `index.html`, `style.css`, `script.js` and the `model/` folder at the
   top level of a GitHub repository (not inside another folder).
2. Go to **Settings > Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Pick `main` and `/ (root)`, then save.
5. Wait a minute or two. The site appears at
   `https://<username>.github.io/<repository>/`.

GitHub Pages is served over HTTPS, so the camera permission prompt works there.

## Customize

- **Name and copy:** edit the text in `index.html`. Search for "Finger Identifier"
  to rename the site (header and page title).
- **Colors:** the variables at the top of `style.css`. `--accent` controls the
  links, the top result and the focus outline.
- **Fonts:** the two families are named in `--display` (headings) and `--text`
  (everything else). To swap them, change the Google Fonts link in
  `index.html` and the two variables.
- **About section:** add your own rows in the commented block in `index.html`.
- **"Not sure" threshold:** `LOW_CONFIDENCE` at the top of `script.js`.
- **Footer link:** edit the "Back to portfolio" link at the bottom of
  `index.html`, or delete that paragraph.

## If something doesn't work

Press F12, open the **Console** tab, and read the first red message.

- **"Model not loaded" and a 404 in the Console:** the model files aren't where
  the page expects them. Check the three file names exactly (they're
  case-sensitive on GitHub Pages) and that they're in `model/` or next to
  `index.html`.
- **Works on GitHub Pages but not when double-clicked:** use a local server, see
  above.
- **Camera blocked:** allow the camera for the site in the browser's address
  bar settings, and close other apps that are using the camera.
- **Library versions:** `index.html` pins TensorFlow.js 1.3.1 and the Teachable
  Machine library 0.8, the versions Teachable Machine's own export code uses.
  Your model was exported with TensorFlow.js 1.7.4, which loads fine with them.

Model files in a public repository are public. Don't include private images.
