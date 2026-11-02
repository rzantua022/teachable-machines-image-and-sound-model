# Image and Sound Classifier

One page, two Google Teachable Machine models. Use the switch at the top to
pick one:

- **Image model (fingers):** upload a photo or use the live camera. Recognises
  thumb, pointer, middle finger, ring finger and pinky.
- **Sound model (animals):** uses the microphone. Recognises cat, cow, dog,
  duck, owl, pig, sheep and tuko, plus background noise.

Both run in the browser with TensorFlow.js. Nothing is uploaded anywhere.

## Files

```text
index.html
style.css
script.js
models/
  image/   model.json, metadata.json, weights.bin   (fingers)
  sound/   model.json, metadata.json, weights.bin   (animals)
```

The two models use the same file names, so each one has its own folder. Keep
the folder structure exactly as it is.

## Run it locally

Don't open `index.html` by double-clicking it. The models, the camera and the
microphone all need a web server. Use VS Code Live Server, or in this folder run:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Publish on GitHub Pages

1. Put everything in this folder at the top level of a GitHub repository,
   including the `models` folder (not inside another folder).
2. Go to **Settings > Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Pick `main` and `/ (root)`, then save.
5. Wait a minute or two. The site appears at
   `https://<username>.github.io/<repository>/`.

GitHub Pages is served over HTTPS, so the camera and microphone permission
prompts work there. If you used an older version of this site, delete the old
`model` folder and any loose `model.json`, `metadata.json` or `weights.bin`
files from the repo.

## Customize

- **Name and copy:** edit the text in `index.html`. Search for "Image and Sound
  Classifier" to rename the site (header and page title). The heading and
  description that change with each model are in the `COPY` block at the top of
  `script.js`.
- **Colors:** the variables at the top of `style.css`. `--accent` controls the
  links, the top result and the focus outline.
- **Fonts:** `--display` (headings) and `--text` (everything else). To swap
  them, change the Google Fonts link in `index.html` and the two variables.
- **About section:** add your own rows in the commented block in `index.html`.
- **"Not sure" threshold:** `LOW_CONFIDENCE` at the top of `script.js`.
- **Footer link:** edit the "Back to portfolio" link at the bottom of
  `index.html`, or delete that paragraph.

## If something doesn't work

Press F12, open the **Console** tab, and read the first red message.

- **"Failed to fetch":** the page was opened as `file:///...`. Use a local
  server, see above.
- **"Model not loaded" and a 404 in the Console:** the model files aren't where
  the page expects them. Check the folder names (`models/image`, `models/sound`)
  and the three file names. They're case-sensitive on GitHub Pages.
- **Camera or microphone blocked:** allow it for the site in the browser's
  address bar settings, and close other apps that are using it.
- **Sound model is slow the first time:** its weights file is about 5.8 MB. It
  only loads when you first switch to the sound model.
- **Library versions:** `index.html` pins TensorFlow.js 1.3.1, the Teachable
  Machine image library 0.8 and the speech-commands library 0.4.0. These are the
  versions Teachable Machine's own export code uses.

Model files in a public repository are public. Don't include private images or
recordings.
