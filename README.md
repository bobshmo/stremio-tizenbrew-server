# Stremio TizenBrew streaming service prototype

**Status: not operational on the target TV yet.** TizenBrew can fetch this repository's manifest on a Samsung QN55Q6FAM (Tizen 3.0 / Chromium 47 / Node 4.4.3), but the service bootstrap has not kept a listener alive on port 11470. The manifest currently omits `serviceFile` so opening the module will not attempt the unstable server startup. Do not install this expecting playback.

This prototype aims to provide Stremio torrent streaming on the TV using `torrent-stream`.

## Build

From this directory, run `node build.cjs`. The resulting service bundle is written to `module/service.bundle.js`.

The bundle uses Browserify's Node mode and excludes optional native add-ons `utf-8-validate` and `bufferutil`.

## Intended routes

- `GET /` and `GET /health`: service health
- `POST /<40-character-info-hash>/create`: Stremio torrent creation and optional video-file selection
- `GET`/`HEAD /<40-character-info-hash>/<file-index>`: media bytes with HTTP range support
- `GET /<40-character-info-hash>/stats.json` and `/<file-index>/stats.json`: file names and basic torrent counters used by Stremio's playback metadata helper

The intended listener is `127.0.0.1:11470`. It has not been verified on a TV.

## Known limits

- The target device has not served a successful health response from this module.
- The intended prototype allows one torrent at a time, 8 peer connections and 1 upload slot.
- Torrent pieces use a disk-backed temporary cache under `/tmp/stremio-tizen-torrents`; the TV's capacity and backing store have not been inspected.
- The prototype does not implement Stremio transcoding/HLS, subtitles, remote streaming, or full server settings APIs.
