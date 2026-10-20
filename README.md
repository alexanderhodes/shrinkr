# Shrinkr

Mac-App zum Komprimieren, Skalieren und Umwandeln von Bildern. Alles läuft lokal und offline:
die Bildverarbeitung steckt als WebAssembly (mozjpeg, libwebp, libavif, oxipng, Lanczos-Resize) in der App, es gibt keinen Server und keine externe Binary wie ffmpeg.

**Stack:** Tauri 2 (Rust, nur für Dateizugriff) · React + TypeScript + Vite · jSquash-Codecs in Web Workern

## Funktionen

- Bilder per Drag & Drop (auch ganze Ordner) oder über „Bilder hinzufügen“
- Pro Bild beliebig viele **Varianten**: Breite/Höhe (je „Auto“ möglich), Format (JPEG, PNG, WebP, AVIF), Qualitätsregler
- Bei fester Breite **und** Höhe: mittig zuschneiden oder einpassen
- Größe vorher/nachher live, inklusive Vorschau und Ersparnis in Prozent
- **Presets**: Einstellungen speichern (z. B. „1600 × auto · WebP“). Mit „Automatisch“ bekommt jedes neue Bild die Variante von selbst
- Export neben das Original oder in einen gewählten Ausgabeordner
- EXIF-Drehung wird berücksichtigt, Transparenz wird bei JPEG auf Weiß gelegt

## Starten

Voraussetzungen: [Node.js](https://nodejs.org) (18+), [Rust](https://rustup.rs) und die Xcode Command Line Tools (`xcode-select --install`).

```bash
npm install
npm run tauri dev      # Entwicklung mit Hot Reload
npm run tauri build    # fertige App: src-tauri/target/release/bundle/macos/Shrinkr.app (+ .dmg)
```

Nur das Frontend im Browser testen: `npm run dev` (Export läuft dann als Download, Drag & Drop über den Browser).

## Hinweise

- Die selbst gebaute App ist nicht signiert. Auf deinem eigenen Mac startet sie normalerweise direkt; bei einer Gatekeeper-Meldung: Rechtsklick → Öffnen. Für die Weitergabe an andere brauchst du einen Apple-Developer-Account (Signing + Notarization).
- Einlesen von HEIC/TIFF/GIF/BMP geht über das, was macOS im Webview selbst dekodieren kann. Ausgabe gibt es nur als JPEG, PNG, WebP und AVIF.
- PNG wird verlustfrei optimiert (oxipng), daher gibt es dort keinen Qualitätsregler.
- AVIF-Export ist am langsamsten, bei großen Bildern dauert es einige Sekunden.

## Struktur

```
src/lib/worker.ts      Decode → Zuschnitt/Resize → Encode (Web Worker)
src/lib/process.ts     Worker-Pool, überholte Jobs werden verworfen
src/lib/tauri.ts       Brücke zu Rust (Dateien lesen/schreiben, Ordner wählen, Drop)
src/lib/storage.ts     Presets und letzte Einstellungen (localStorage)
src/App.tsx            Zustand, Hinzufügen, Verarbeitung, Export
src/components/        ImageCard, VariantPanel, Sidebar
src-tauri/src/main.rs  Rust-Commands: expand_paths, read_file, write_file, reveal_in_finder
```
