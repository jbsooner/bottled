# Bottled — Robert’s Belly Bounce

A dependency-free canvas arcade game. Open `index.html` or serve this folder:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Space / Up / click / tap bounces. P or Escape pauses; R restarts; M toggles sound. Buttons support touch and keyboard. Leaving the tab automatically pauses a run.

Pass bottles for one point, collect cigarettes for five, and pass near the center for a perfect streak bonus (up to five points per gate). Reach the ceiling during the first three seconds for the original secret slot bonus. Difficulty increases with gates passed, independently of score rewards.

Classic mode is endless. Daily mode generates the same obstacle course for everyone on a given date and keeps a separate daily best. Three rotating daily goals accumulate across runs, award bottle caps once per day, and unlock Ember and Neon trails. Four cigarette pickups charge Lucky Break, which blocks the next bottle collision. Each finished run receives a medal based on its score.

## Validation

```sh
node --check game.js
node game.test.cjs
```

Tests cover starts, pause/resume, daily course replay, daily goals and one-time rewards, Lucky Break, difficulty independent of points, gap bounds, floor and bottle collisions, bonus return, perfect scoring, and 60/120 Hz simulation equivalence.

## Baseline

Based on GitHub main `3fc83ea627768f52f782a171e5f50b71a1848a7c` (December 27, 2025, America/Chicago), incorporating the newer local copy's mute, restart, high-DPI canvas, and bonus behavior. Pushing to `main` triggers the existing GitHub Pages deployment.

New: four scenery settings (sunset town, moonlit pines, desert dawn, and neon waterfront) that transition every ten gates; detailed glass bottles; cigarettes with ember and smoke effects; full-body Robert rendered from the original illustration with a silhouette mask; a mobile-first navy-and-gold arcade interface; daily course and goals; unlockable trails; medals; Lucky Break; gentler physics; constrained gap transitions; perfect streaks; touch controls; pause on tab hide; fixed 60 Hz simulation. Original Robert art and bounce audio are retained. Collision remains forgiving and centered on Robert's belly.
