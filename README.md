# Teachable Machines

Two Google Teachable Machine models on one page. Fingers uses a photo or the
camera, and animals uses the microphone. Both run in the browser.

```text
index.html
style.css
script.js
image-model/   model.json, metadata.json, weights.bin   (fingers)
audio-model/   model.json, metadata.json, weights.bin   (animals)
```

## Run it locally

Open the folder in VS Code and use Live Server, or run this in the folder:

```bash
python -m http.server 8000
```

Then go to `http://localhost:8000`. Opening `index.html` by double-clicking
won't work, because the models and the camera need a server.

## Put it on GitHub Pages

1. Upload everything to the top level of the repository.
2. Settings, then Pages, then Deploy from a branch, then `main` and `/ (root)`.
3. The site is at `https://<username>.github.io/<repository>/` after a minute or two.

If your repo still has an old `model` or `models` folder, or loose `model.json`,
`metadata.json` or `weights.bin` files, delete them. The site only uses
`image-model` and `audio-model`.

Keep the three file names inside each model folder exactly as they are.
`model.json` points to `weights.bin` by name.

## Changing things

- Colors and font: the variables at the top of `style.css`
- Text: `index.html`
- The class names shown under each model come from the models themselves
- Camera and microphone stop when you switch models or leave the page

If something fails to load, press F12 and read the first red line in the Console.
