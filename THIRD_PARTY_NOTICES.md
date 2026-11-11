# Third-party assets and recordings

## Three.js

The curry-shop game bundles Three.js 0.170.0. Its MIT license is preserved at `games/curry-shop-3d/vendor/THREE-LICENSE.txt`.

## Gift icons

TikTok gift imagery is third-party material. See each game's artwork/source notes, including `games/curry-shop-3d/GIFT_ART_SOURCES.md`. No trademark ownership or blanket redistribution license is claimed.

## Buddhist chant — boon-live

Active recording: Wat Marp Jan, “1278 ทำวัตรเช้า – ไม่แปล”, approximately 16:27. The playback recording is embedded in `games/boon-live/game.js`. Provenance and the unresolved commercial-use status are documented in `games/boon-live/chant-audio/WATMARPJAN-SOURCE.md`.

Public availability, credit, and an assertion of fair use do not establish permission for redistribution or commercial streaming. No such clearance is represented by this repository. Other chant notes describe earlier alternatives, not the currently active recording; their audio files are not bundled separately.

## Ganesha chant — ganesha-live

Active recording: “Ganesha Atharva Sheersha”, Dr Arun Apte, approximately 5:41, from https://www.symb-ol.org/audio-files/ (item 1). The publisher's footer states that its materials have no copyright and requests that their meaning and purpose are not substantially altered. Ownership and direct commercial LIVE clearance from the recording rightsholder have not been independently established. See `games/ganesha-live/chant-audio/SOURCE.md`. The playback copy is embedded in the game's JavaScript.

## Generated artwork and synthesized sound

Generated artwork provenance and prompts are recorded in the game folders. Original synthesized background music and effects are implemented in source; browser text-to-speech depends on the voices installed on the host system. This notice does not grant additional rights to third-party voices or recordings.


## Desktop runtime bundle

The Windows release bundles an unmodified Node.js executable (MIT and included third-party notices), cloudflared (Apache-2.0), and Python with its license. License files are included in `_internal/runtime`. PyInstaller distributes its bootloader under GPL with its distribution exception; see https://pyinstaller.org/en/stable/license.html. Runtime executables are release assets and are not committed as Git source blobs.
