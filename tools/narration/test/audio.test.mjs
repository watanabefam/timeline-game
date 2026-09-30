// The true-peak ceiling is a property of the FILE, not of the samples.
//
// renderClip normalises the raw signal with loudnorm and then measures the
// encoded MP3 — the thing players actually decode. Those two disagree: MP3
// encoding adds its own inter-sample overshoot, so the shipped file can
// measure hotter than the ceiling loudnorm was told to respect. On
// `newcomen-engine` that gap was 0.5 dB: normalised to a -1.5 dBTP ceiling,
// the encoded file measured -1.0, and the card was rejected.
//
// That was latent until a deck which had never been narrated was rendered:
// 39 of 40 cards passed and one failed.
//
// Two tests, because they catch different things. The arithmetic one is the
// regression guard — it fails the moment anyone aims loudnorm at the ceiling
// again. The end-to-end one states the user-visible property and needs only
// ffmpeg, since renderClip takes a Float32Array and no model.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  renderClip,
  haveFfmpeg,
  normaliseTruePeak,
  ENCODER_OVERSHOOT,
  LOUDNESS_FLOOR,
} from "../audio.mjs";

const skipFfmpeg = (await haveFfmpeg()) ? false : "ffmpeg not on PATH";

const CEILING = -1.5;
const SAMPLE_RATE = 24000;

test("loudnorm is aimed BELOW the ceiling, by the encoder's overshoot", () => {
  // The regression guard. Aiming at the ceiling is exactly the bug: it makes
  // the ceiling true of the samples and false of the file.
  assert.ok(ENCODER_OVERSHOOT > 0, "a zero allowance means the shipped file can exceed the ceiling");
  assert.ok(ENCODER_OVERSHOOT <= 1, "an allowance above 1 dB is not an encoder overshoot");
  assert.equal(
    normaliseTruePeak(CEILING),
    CEILING - ENCODER_OVERSHOOT,
    "the normalisation target must sit below the ceiling by the allowance"
  );
  assert.ok(normaliseTruePeak(CEILING) < CEILING, "loudnorm is being aimed at the ceiling itself");
  // The loudness band is the other half of the trade-off: a clip that cannot
  // be both loud enough and peak-safe is a bug, not a rounding miss.
  assert.ok(LOUDNESS_FLOOR > 0, "a zero loudness floor would reject every peak-limited clip");
});

/**
 * Voiced-sounding carrier under a slow envelope, crest factor near speech's
 * ~14 dB so loudnorm can actually reach the loudness target and the ceiling
 * becomes the binding constraint. (Much peakier material and loudnorm simply
 * gives up and ships quiet, which is loud but not the case under test.)
 */
function speechLike(seconds = 4) {
  const n = Math.round(seconds * SAMPLE_RATE);
  const out = new Float32Array(n);
  for (let t = 0; t < n; t += 1) {
    const s = t / SAMPLE_RATE;
    const envelope = 0.55 + 0.45 * (0.5 - 0.5 * Math.cos((2 * Math.PI * s) / 0.8));
    out[t] =
      envelope *
      (Math.sin(2 * Math.PI * 130 * s) * 0.6 +
        Math.sin(2 * Math.PI * 620 * s) * 0.28 +
        Math.sin(2 * Math.PI * 1900 * s) * 0.12);
  }
  return out;
}

test("the shipped MP3 honours the ceiling, not merely the normalised samples", { skip: skipFfmpeg }, async () => {
  const clip = await renderClip({ audio: speechLike(), samplingRate: SAMPLE_RATE });
  assert.ok(
    clip.truePeak <= CEILING,
    `shipped file measures ${clip.truePeak} dBTP, above the ${CEILING} dBTP ceiling — ` +
      "loudnorm is capping the samples but the encode is not honouring it"
  );
  // And it should still be a usable recording, not silence dressed as safety.
  assert.ok(clip.loudness <= -16 + 0.5, `shipped clip is ${clip.loudness} LUFS, above the target`);
});
