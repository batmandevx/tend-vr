# Devpost submission pack — Tend

## Form fields

**Submission name:** Tend — a garden that grows with your hands

**Tagline (≤140):** Hands-first VR hand rehab for stroke & injury recovery. Every gentle movement plants a flower, and your garden grows day by day.

**Track:** Productivity (daily habit tied to a recurring moment: your morning therapy routine)
**Division:** New Experience (conceived and built inside the competition window)
**Special awards it targets:** Best Accessibility Forward Experience · Best Reason to Come Back · Best First Five Minutes · Boldest Original Concept

**Try it:** https://batmandevx.github.io/tend-vr/ — open in Meta Quest Browser → Enter VR (or Enter MR). No controllers, no account, no install.
**Video:** <YouTube/Vimeo URL>
**Target launch date:** <e.g. March 2027 (Meta Horizon Store, as a PWA/WebXR app)>
**Team:** Ayush Upadhyay, ayushdevxai@gmail.com, Developer & designer

---

## Description (~480 words)

### Inspiration
After a stroke, a hand injury or an arthritis flare, recovery comes down to repetition: thousands of fist-opens, finger pinches and wrist turns. Clinicians send patients home with a sheet of exercises, and most people stop within weeks. The exercises are dull, there's no feedback, and progress is too slow to notice. We had worked on inclusive, safety-first adaptive exercise before, and Quest hand tracking gave us an obvious next step. The headset can see every joint of your hand without any wearables. What if each rep made something beautiful, and the progress you can't feel became something you can see?

### What it does
Tend is a calm garden on a lap-height planter, built to fit the "airplane seat test". Each 3- or 6-minute session runs five short exercises that hand therapists commonly prescribe:
- **Bloom** (fist ↔ open). The big flower in the centre opens and closes *with your hand*, as live biofeedback.
- **Seed Pinch** (thumb to each fingertip). The target fingertip glows on your real hand.
- **Fan the Ferns** (finger spread).
- **Turn to the Sun** (forearm rotation).
- **Fireflies** (seated reach & coordination).

Every rep grows a new plant. The garden persists between sessions, filling the planter and then the meadow around you, so after a month you're sitting in a field you grew with your own hands. A range-of-motion chart (hand closure %, spread °, wrist turn °) and a gentle streak give you real reasons to come back.

### Built for hands that don't work perfectly
- **Your range, not a normal range.** A 30-second calibration measures your comfortable open hand, spread and fist. Every goal is a percentage of *your* range.
- **Never fail.** If you're clearly trying but can't reach a goal today, Tend lowers it in the moment and says so kindly. An adaptive coach raises or lowers each exercise's difficulty between sessions.
- **Mirror therapy without a mirror box.** If one hand barely moves, Tend reflects the healthy hand across your body's midline and draws it as a golden hand in place of the affected one. It's a technique clinicians already use, made effortless.
- **Dwell-to-press:** any button can be poked *or* activated by just holding a finger near it. Big targets, high contrast, spoken and captioned coaching.
- **Keepsakes from your real life.** We connected Tend to our Camera-to-3D pipeline. You photograph a treasured object on your phone, it becomes a textured 3D model on your own computer, and it appears on your planter. Pinch it to pick it up and turn it in your hand. That's motivation and fine-motor practice in one.
- **Pauses itself** when your hands leave view or the headset comes off. Resumes the moment you're back.
- **Private by design:** no account, and nothing leaves the headset.

### How we built it
Tend is a WebXR app (three.js) using the WebXR Hand Input API, so it runs instantly in the Quest Browser in VR or passthrough MR. A gesture layer turns 25 joints per hand into scale-normalised measures: per-finger curl, grip, abduction angle, thumb-to-fingertip distance and the palm normal. Rep state machines with adaptive thresholds sit on top. The garden is fully procedural: instanced meshes keep thousands of plants to a handful of draw calls, and all audio is synthesised with WebAudio, with zero downloaded assets. We also built a desktop hand simulator that generates the same 25-joint data, plus an autopilot (`?demo`) that plays the whole app end to end. That let us test every flow without a headset.

Keepsakes come from our Camera-to-3D app: a local photo-to-3D pipeline (segmentation, then Hunyuan3D-2, then photo-projected textures). Tend reads its `/scans` API, stores models in IndexedDB, and lets you pinch-grab them with full 6-DoF hand rotation.

### What's next
We plan clinician mode: a therapist sets the exercise prescription and gets an exported progress report. We also want new exercises (tendon glides, finger tapping speed), two-handed co-op with a family member, and a pilot with a stroke-rehab clinic.

---

## How hand interactions are implemented
There is no controller anywhere. Hands are the input *and* the therapy. Menus use direct fingertip poke, with a dwell fallback for limited mobility. Exercises read joint kinematics (curl, abduction, opposition, supination, reach). Mirror mode re-renders one hand's joints reflected onto the other side of the body. Keepsakes can be pinch-grabbed and follow the hand's full position and rotation. Tracking loss auto-pauses the session.

## What excites us about the future of VR
Hand tracking turns a headset into a measurement device people actually want to use. Rehabilitation could happen at home every day, feel like play, and give clinicians objective data for the first time.

---

## Video script (target 2:30, lead with the best shot)
1. **0:00–0:12** Cold open: a hand slowly closes, and the big flower closes into a bud with it. It opens; a new tulip pops up with a chime. Caption: *"Every movement plants something."*
2. **0:12–0:30** The problem, as text over the garden: *12M strokes a year. Hand recovery needs thousands of reps. Most people quit their home exercises.*
3. **0:30–0:50** First five minutes: welcome → choose hand → mirror therapy → 30-second calibration ("only as far as is comfortable").
4. **0:50–1:40** Montage of the five exercises (Bloom, Seed Pinch with the glowing fingertip, Fan the Ferns, Turn to the Sun, Fireflies). Show one "I've moved the goal to meet you" adaptation.
5. **1:40–2:05** Mirror therapy: the healthy hand moves and the golden mirrored hand moves in its place.
6. **1:55–2:05** Keepsake: snap a photo of a toy on your phone, then it appears on the planter, gets pinched up and turned in the hand.
7. **2:05–2:20** Summary card with +plants and range deltas, then the progress chart, then the meadow full of flowers (30 days later).
8. **2:20–2:30** Title card: *Tend — a garden that grows with your hands. Hands-first. Seated. Private. Free in your Quest browser.*

**Recording:** on Quest, open the URL, press Enter VR, and record with Meta's built-in capture (Camera → Record video). Without a headset, open `https://batmandevx.github.io/tend-vr/?fresh&demo` (or `?fresh&demo=mirror`) in Chrome full-screen and screen-record. The autopilot plays the whole session by itself.

## Your checklist
- [x] Public repo + live site: https://github.com/batmandevx/tend-vr → https://batmandevx.github.io/tend-vr/
- [ ] Open the Pages URL on your Quest, try one session, and check thresholds feel right
- [ ] Record & upload the video (public on YouTube/Vimeo)
- [ ] Fill the Devpost form with the text above and submit before **19 Nov 2026, 1:30 AM IST**
