# 🌷 Tend — a garden that grows with your hands

**Hands-first VR hand rehabilitation for Meta Quest.** Tend turns the repetitive home exercises that follow a stroke, hand injury or arthritis into a calm daily ritual: every gentle movement plants something new, and your garden — your recovery made visible — is still there tomorrow.

▶ **Live (WebXR):** https://batmandevx.github.io/tend-vr/ — open it in the Meta Quest Browser and press **Enter VR** (or **Enter MR** to grow the garden on your real table).
No controllers, no account, no install.

## Why
- About 12 million people have a stroke each year, and most survivors live with upper-limb impairment. Hand recovery depends on thousands of repetitions, but home exercise programmes are boring and adherence is low.
- Hand-tracked VR can measure every rep without wearables, and can do something a living room can't: **mirror therapy** without a mirror box.

## What it does
| Exercise | Movement trained | What grows |
|---|---|---|
| **Bloom** | Fist ↔ open (finger flexion/extension) | Tulips — the central "heart bloom" opens and closes *with* your hand |
| **Seed Pinch** | Thumb opposition to each fingertip | Glowing seedlights; the target fingertip glows on your real hand |
| **Fan the Ferns** | Finger abduction | Ferns |
| **Turn to the Sun** | Forearm supination (palm up/down) | Sunflowers; the flower turns to face the sun |
| **Fireflies** | Seated reach & hand-eye coordination | Lanterns |

**Designed for impaired hands**
- **Personal calibration:** every goal is a percentage of *your own* measured range, not a normal hand.
- **Never-fail adaptation:** if you're clearly trying but can't reach a goal today, Tend lowers it in the moment and tells you so kindly. Between sessions, an adaptive coach raises or lowers each exercise's difficulty.
- **Mirror therapy mode:** the healthy hand's motion is reflected across your body midline and drawn as a golden hand in place of the affected one.
- **Dwell-to-press:** every button can be poked *or* activated by simply holding a fingertip over it, so you don't need a precise poke. Big targets, high-contrast text, spoken + captioned coaching.
- **Seated & small:** everything happens in a 2-foot bubble over a lap-height planter. Sessions last 3 or 6 minutes. Pauses on its own when your hands leave view, and when the headset is taken off.
- **Private:** all data stays in the headset's local storage.

**Keepsakes, powered by [Camera to 3D](https://github.com/batmandevx/Auto-Blender-Camera-to-blender):** photograph something you love (a grandchild's toy, a favourite mug) on your phone. Camera to 3D turns it into a textured 3D model on your own Mac, and it appears on your planter's rim. **Pinch it to pick it up** and turn it in your hand, which is itself grip, pinch and wrist-rotation practice. In the 2D page, open **🪴 Keepsakes**, enter your Camera-to-3D server address (e.g. `https://<mac-ip>:8443`, after opening it once in the Quest browser to accept its certificate) and tap a scan. You can also drop in any `.glb` file. Keepsakes are stored on-device (IndexedDB).

**Reasons to come back:** the garden persists and grows. It starts as one planter, and after about 150 reps it spills into the meadow around you. You also get a daily streak and a range-of-motion chart (hand closure %, finger spread °, wrist turn °) across sessions.

## Tech
- WebXR + three.js, using the WebXR Hand Input API (25 joints per hand). Works in VR and passthrough MR on Meta Quest.
- `src/gestures.js` turns joints into scale-normalised measures: per-finger curl, grip, abduction angle, thumb-to-fingertip distances, palm normal.
- `src/exercises.js` runs the rep state machines with adaptive targets.
- `src/keepsakes.js` connects to the Camera-to-3D `/scans` API, stores the GLBs in IndexedDB, normalises them onto pedestals, and handles pinch-grab with full hand rotation.
- Procedural everything: the garden uses instanced meshes (thousands of plants in a few draw calls), audio is synthesised with WebAudio, and there are no downloaded assets.
- **Desktop simulator:** the same pipeline runs on a procedural 25-joint hand driven by keyboard/mouse. `?demo` (or `?demo=mirror`) has an autopilot play the whole app, which serves as an end-to-end test.

## Run locally
```bash
npm install
npm run dev              # desktop preview at http://localhost:5173
HTTPS=1 npm run dev      # HTTPS on your LAN, for testing on a Quest
npm run build            # static site in dist/
```
Desktop controls: mouse moves the hand, click buttons, **F** fist, **G** spread, **O** open, **T** palm up, **1–4** pinch, **Space** poke, **H** switch hand. Add `?fresh` to reset saved progress.

## Safety
Tend is a wellness companion, not a medical device. Move only within a pain-free range and follow your clinician's advice.
