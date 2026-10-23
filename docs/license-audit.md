# License review — 2026-10-23

The repository's original source is Apache-2.0. `LICENSE` contains the full text. Source and configuration files carry SPDX notices where syntax permits; JSON files use a `license` field or are covered by this repository notice.

`npm run check:licenses` reviewed every dependency entry in `package-lock.json` (including optional platform packages). The metadata in the current lockfile reports MIT, ISC, Apache-2.0 or BSD-3-Clause. These are OSI-approved licenses. The script fails on any new/unknown license so it receives manual review. This is a metadata-level check, not a legal opinion or a source-by-source audit of embedded assets.

The portal does not include iHanoi artwork, logos or data, and no external service SDK. It uses local system fonts and Lucide icons (ISC). The link to OpenStreetMap is used only when a user opens coordinates in a separate tab; it does not embed map tiles or bundle map data. Future map data, official APIs and external service content require separate provenance and terms checks before publication.
