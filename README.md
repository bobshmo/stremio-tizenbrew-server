# Stremio TizenBrew streaming service prototype

This is an app module for TizenBrew on Tizen 3.0. It uses TizenBrew's bundled Node.js 4.4.3 service runtime and `torrent-stream` to implement the Stremio torrent creation and byte-range routes on the TV itself.

## Build

From this directory, run `node build.cjs`. The resulting module uses `package.json` as the TizenBrew manifest and bundles the service at `module/service.bundle.js`.

The bundle intentionally uses Browserify's Node mode (rather than its browser shims) for Node's WebSocket implementation. `utf-8-validate` and `bufferutil` are excluded because they are optional native add-ons; the service can fall back to the pure JavaScript implementation.

## Routes implemented

- `GET /` and `GET /health`: service health
- `POST /<40-character-info-hash>/create`: Stremio torrent creation and optional video-file selection
- `GET`/`HEAD /<40-character-info-hash>/<file-index>`: media bytes with HTTP range support
- `GET /<40-character-info-hash>/stats.json` and `/<file-index>/stats.json`: file names and basic torrent counters used by Stremio's playback metadata helper

The listener binds to `127.0.0.1:11470`. Stremio's streaming server URL on this TV is `http://127.0.0.1:11470` once the module is installed and running.

## Current limits

- One torrent at a time, 8 peer connections and 1 upload slot to limit TV load.
- Torrent pieces use `torrent-stream`'s disk-backed temporary cache under `/tmp/stremio-tizen-torrents`; it is removed when the engine is destroyed. The TV's `/tmp` capacity and backing store have not been inspected, so do not treat large-file playback as verified.
- This implements torrent byte streaming only. It does not implement Stremio's transcoding/HLS, subtitles, remote streaming, or full server settings APIs.
- DHT and trackers can find peers, but playback depends on the torrent's availability and the TV's network conditions. No debrid service is required by this prototype.

## TizenBrew module

Add the public module ID `gh/bobshmo/stremio-tizenbrew-server` in TizenBrew. TizenBrew fetches the manifest and service bundle from jsDelivr. TV installation and playback remain unverified.

