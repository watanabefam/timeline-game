/*
 * tools/narration/audio.mjs
 * ------------------------------------------------------------------
 * Turning raw Kokoro samples into a shipped clip, with ffmpeg:
 *
 *   1. trim to the speech envelope, keeping a little air on each side
 *      (0.09 s lead / 0.15 s tail) so the first and last phoneme survive
 *      but a 300 ms of dead air does not;
 *   2. loudness-normalise to the deck's target in two passes — measure,
 *      then apply one linear gain — because single-pass loudnorm moves
 *      the level but rides the peaks;
 *   3. verify what actually landed, re-measuring the encoded file;
 *   4. encode 24 kHz mono MP3 with the encoder's build signature
 *      stripped, so identical input gives identical bytes.
 *
 * Everything is piped, so no temporary files are written. The only
 * external tool required is ffmpeg: clip durations come from the MP3's
 * own frame count (see mp3DurationMs), not from a probing binary.
 *
 * Loudness notes: EBU R128 integrated measurement needs a few seconds of
 * material to settle (readings drift below ~0.4 s and the standard's own
 * gate wants ~3 s), and these clips run 5–15 s, so the two-pass figure is
 * trustworthy — but it is still measured again afterwards, because a
 * silent or clipped result must fail the run rather than ship.
 */
import { spawn } from "node:child_process";

/** Silence kept at each edge, in seconds. */
export const PAD_LEAD = 0.09;
export const PAD_TAIL = 0.15;

/**
 * Verification bands for the post-encode check.
 *
 * A speech clip with a high peak-to-loudness ratio cannot be both at the
 * loudness target and under the true-peak ceiling: loudnorm respects the
 * ceiling and arrives quieter. That is not a bug — it is the EBU R128
 * rule, and it is what the shipped clips already do (they sit at a mean
 * of -17.1 LUFS with peaks around -1.8 dBTP for a -16 LUFS / -1.5 dBTP
 * target). So the check is a band, and its real purpose is CONSISTENCY:
 * no clip may drift away from the others, and none may exceed the peak.
 *
 * There are TWO separate reasons the shipped file can sit above the
 * ceiling, and conflating them is what let a real bug through.
 *
 * 1. MEASUREMENT ROUNDING (small). loudnorm is driven by a measurement of
 *    the raw samples, then we verify the encoded file, and the two disagree
 *    by a fraction of a dB. The hijra clip measured -1.34 against a -1.5
 *    ceiling and was rejected over 0.01 dB of rounding, not for being loud.
 *    TRUE_PEAK_MARGIN absorbs this.
 *
 * 2. LOSSY ENCODING (large). MP3 encoding adds its own inter-sample
 *    overshoot, so the artefact a player decodes is hotter than the
 *    samples loudnorm capped. Measured on newcomen-engine: normalised to
 *    -1.5 dBTP, the encoded file measured -1.0. Aiming lower is the only
 *    way to make the ceiling true of the FILE rather than of the source,
 *    which is what ENCODER_OVERSHOOT is for. This was latent until a deck
 *    that had never been narrated was rendered: 39 of 40 cards passed and
 *    one failed, which is what it looks like when only some material is
 *    peaky enough for the overshoot to bite.
 *
 * A genuinely clipping clip lands near 0 dBTP, far outside both bands, so
 * nothing real slips through.
 */
export const LOUDNESS_FLOOR = 2.0; // LU the peak ceiling may cost us
const LOUDNESS_CEIL = 0.5; // never louder than the target
const TRUE_PEAK_MARGIN = 0.25;
/** dB the MP3 encode is expected to push the shipped file above the source. */
export const ENCODER_OVERSHOOT = 0.5;

/**
 * The true-peak ceiling to hand loudnorm, given the ceiling we intend the
 * SHIPPED FILE to respect.
 *
 * Aiming loudnorm at the ceiling is the bug: the ceiling is a property of the
 * MP3 a player decodes, and the encode runs hotter than the samples it capped.
 * So we aim below it by the expected overshoot and keep the verification
 * against the real ceiling. Exported because this is the one arithmetic step
 * that must not silently regress — see test/audio.test.mjs.
 */
export function normaliseTruePeak(truePeakDb) {
  return Number((truePeakDb - ENCODER_OVERSHOOT).toFixed(2));
}

const TRIM = [
  "silenceremove=start_periods=1",
  `start_silence=${PAD_LEAD}`,
  "start_threshold=-50dB",
  "stop_periods=-1",
  `stop_silence=${PAD_TAIL}`,
  "stop_threshold=-50dB",
].join(":");

/** Run ffmpeg with `args`, feeding `input` on stdin, resolving its output. */
function ffmpeg(args, input) {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["pipe", "pipe", "pipe"] });
    const out = [];
    let err = "";
    proc.stdout.on("data", (d) => out.push(d));
    proc.stderr.on("data", (d) => {
      err += d;
    });
    proc.on("error", (e) =>
      reject(
        e.code === "ENOENT"
          ? new Error("ffmpeg is not installed (or not on PATH) — the narration pipeline needs it")
          : e
      )
    );
    proc.on("close", (code) => {
      const stdout = Buffer.concat(out);
      if (code === 0) resolve({ stdout, stderr: err });
      else reject(new Error(`ffmpeg exited ${code}: ${err.split("\n").slice(-4).join(" ").trim()}`));
    });
    proc.stdin.on("error", () => {});
    proc.stdin.end(input);
  });
}

/** Raw 32-bit float samples (Kokoro's output) → little-endian 16-bit PCM. */
export function toPcm16(audio) {
  const out = Buffer.allocUnsafe(audio.length * 2);
  for (let i = 0; i < audio.length; i += 1) {
    const v = Math.max(-1, Math.min(1, audio[i]));
    out.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  return out;
}

const pcmArgs = (sampleRate) => ["-f", "s16le", "-ar", String(sampleRate), "-ac", "1", "-i", "pipe:0"];

/** Read loudnorm's JSON report out of ffmpeg's stderr. */
function parseLoudnorm(stderr) {
  const start = stderr.lastIndexOf("{");
  const end = stderr.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error(`could not read loudnorm output: ${stderr.slice(-300)}`);
  const json = JSON.parse(stderr.slice(start, end + 1));
  const num = (v) => (v === "-inf" || v == null ? -Infinity : Number(v));
  return {
    input_i: num(json.input_i),
    input_tp: num(json.input_tp),
    input_lra: num(json.input_lra),
    input_thresh: num(json.input_thresh),
    target_offset: num(json.target_offset),
  };
}

/** Measure a buffer's integrated loudness (LUFS) and true peak (dBTP). */
export async function measure(buffer, { sampleRate = 24000, isPcm = false } = {}) {
  const head = isPcm
    ? pcmArgs(sampleRate)
    : ["-i", "pipe:0"];
  const { stderr } = await ffmpeg(
    [
      "-hide_banner",
      "-nostdin",
      ...head,
      "-af",
      `${TRIM},loudnorm=print_format=json`,
      "-f",
      "null",
      "-",
    ],
    buffer
  );
  return parseLoudnorm(stderr);
}

/**
 * Synthesised audio → a shipped MP3.
 *
 * @param {{ audio: Float32Array, samplingRate: number, loudnessLufs?: number, bitrateKbps?: number, truePeakDb?: number }} input
 * @returns {Promise<{ mp3: Buffer, pcm: Buffer, bytes: number, durationMs: number, loudness: number, truePeak: number, trimmedMs: number }>}
 */
export async function renderClip({
  audio,
  samplingRate,
  loudnessLufs = -16,
  bitrateKbps = 64,
  truePeakDb = -1.5,
}) {
  if (!audio || !audio.length) throw new Error("renderClip: no samples");
  const raw = toPcm16(audio);
  const lead = pcmArgs(samplingRate);

  // Pass 1 — trim, then measure what the trim left behind.
  const measured = await measure(raw, { sampleRate: samplingRate, isPcm: true });
  if (!Number.isFinite(measured.input_i)) {
    throw new Error("renderClip: the source is silent — nothing to normalise");
  }

  // loudnorm's own parameters are colon-separated; a comma would make
  // each one a separate filter in the chain and ffmpeg refuses it.
  const normalise = [
    TRIM,
    [
      `loudnorm=I=${loudnessLufs}`,
      // Aim below the ceiling by the encoder's overshoot, so the FILE we
      // ship lands under it rather than merely the samples we normalised.
      `TP=${normaliseTruePeak(truePeakDb)}`,
      "LRA=11",
      "linear=true",
      `measured_I=${measured.input_i}`,
      `measured_TP=${measured.input_tp}`,
      `measured_LRA=${measured.input_lra}`,
      `measured_thresh=${measured.input_thresh}`,
      `offset=${measured.target_offset}`,
      "print_format=summary",
    ].join(":"),
  ].join(",");

  // Pass 2 — apply one linear gain and encode.
  const { stdout: mp3, stderr } = await ffmpeg(
    [
      "-hide_banner",
      "-nostdin",
      ...lead,
      "-af",
      normalise,
      "-c:a",
      "libmp3lame",
      "-b:a",
      `${bitrateKbps}k`,
      "-ar",
      String(samplingRate),
      "-ac",
      "1",
      // Byte stability: no metadata block carrying the ffmpeg build
      // (verified — a plain encode bakes in `TAG:encoder=Lavf…`).
      "-map_metadata",
      "-1",
      "-fflags",
      "+bitexact",
      "-write_id3v2",
      "0",
      "-f",
      "mp3",
      "-",
    ],
    raw
  );
  if (!mp3.length) throw new Error("renderClip: ffmpeg produced no audio");

  // Verify the file that will actually ship.
  const check = await measure(mp3);
  if (!Number.isFinite(check.input_i)) throw new Error("renderClip: encoded clip measures as silence");
  const shortfall = loudnessLufs - check.input_i;
  if (shortfall < -LOUDNESS_CEIL) {
    throw new Error(`renderClip: louder than target (${check.input_i} LUFS vs ${loudnessLufs})`);
  }
  if (shortfall > LOUDNESS_FLOOR) {
    throw new Error(
      `renderClip: ${check.input_i} LUFS — ${shortfall.toFixed(2)} LU under the ${loudnessLufs} LUFS target, ` +
        `beyond what the ${truePeakDb} dBTP ceiling can explain; the material may be broken`
    );
  }
  if (check.input_tp > truePeakDb + TRUE_PEAK_MARGIN) {
    throw new Error(`renderClip: true peak ${check.input_tp} dBTP exceeds the ${truePeakDb} dBTP ceiling`);
  }

  const durationMs = mp3DurationMs(mp3) ?? Math.round((raw.length / 2 / samplingRate) * 1000);
  const sourceMs = Math.round((audio.length / samplingRate) * 1000);
  return {
    mp3,
    pcm: raw,
    bytes: mp3.length,
    durationMs,
    sourceMs,
    // what the trim removed, ignoring the MP3 encoder's own ~46 ms delay
    trimmedMs: Math.max(0, sourceMs - durationMs),
    loudness: Number(check.input_i.toFixed(2)),
    truePeak: Number(check.input_tp.toFixed(2)),
    /** true when the peak ceiling cost us loudness (the normal case) */
    peakLimited: shortfall > 0.2,
    summary: stderr.trim().split("\n").slice(-2).join(" ").trim(),
  };
}

/**
 * Duration of an MP3 in ms, without any external tool.
 *
 * Reads the frame count LAME writes into the Xing/Info header — the number
 * players use — and falls back to a constant-bitrate size estimate for a
 * file without one. The figure includes the encoder's own delay and
 * padding (~60 ms, measured), unlike a probing tool's stream duration;
 * what matters is that the generator and the content gate both use this
 * one function, so the recorded value and the checked value agree exactly.
 *
 * @param {Buffer} buffer
 * @returns {number|null} milliseconds, or null if no frame header was found
 */
export function mp3DurationMs(buffer) {
  // Sample rates are per MPEG version: our 24 kHz mono clips are MPEG2,
  // whose table is not the familiar 44.1/48/32 kHz one.
  const RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
  const BITRATES = [
    [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0], // MPEG1 layer III
    [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0], // MPEG2/2.5 layer III
  ];
  let offset = 0;
  if (buffer.length > 10 && buffer.toString("latin1", 0, 3) === "ID3") {
    // ID3v2 size is a 28-bit syncsafe integer at byte 6
    offset = 10 + ((buffer[6] << 21) | (buffer[7] << 14) | (buffer[8] << 7) | buffer[9]);
  }
  for (let i = offset; i + 4 <= buffer.length; i += 1) {
    if (buffer[i] !== 0xff || (buffer[i + 1] & 0xe0) !== 0xe0) continue;
    const versionBits = (buffer[i + 1] >> 3) & 0x3; // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
    const layerBits = (buffer[i + 1] >> 1) & 0x3; // 1 = layer III
    if (layerBits !== 1) continue;
    const mpeg1 = versionBits === 3;
    const bitrate = BITRATES[mpeg1 ? 0 : 1][(buffer[i + 2] >> 4) & 0xf] * 1000;
    const rate = (RATES[versionBits] || RATES[2])[(buffer[i + 2] >> 2) & 0x3];
    const mono = ((buffer[i + 3] >> 6) & 0x3) === 3;
    if (!bitrate || !rate) continue;
    const perFrame = mpeg1 ? 1152 : 576;

    const xingAt = i + 4 + (mpeg1 ? (mono ? 17 : 32) : mono ? 9 : 17);
    const tag = buffer.toString("latin1", xingAt, xingAt + 4);
    if (tag === "Xing" || tag === "Info") {
      const flags = buffer.readUInt32BE(xingAt + 4);
      if (flags & 0x1) {
        const frames = buffer.readUInt32BE(xingAt + 8);
        return Math.round((frames * perFrame * 1000) / rate);
      }
    }
    // No frame count: a CBR file's audio bytes give the duration.
    return Math.round(((buffer.length - i) * 8 * 1000) / bitrate);
  }
  return null;
}

/**
 * One word → a tiny audition clip.
 *
 * Audition strips are evidence, not product: they exist so a listening pass
 * can hear forty risky words in ninety seconds instead of scrubbing through
 * forty card-length clips. That means two deliberate departures from
 * renderClip — the gain comes from the raw samples (a 0.3 s word cannot hold
 * a trustworthy EBU R128 reading, see the note at the top of this file), and
 * nothing is verified, because a strip is never shipped.
 *
 * The gain is computed from the PRE-trim peak: trimming can only lower a
 * peak, so the post-trim result cannot clip.
 */
export const STRIP_PEAK_DB = -3;
const STRIP_MAX_GAIN_DB = 12; // a near-silent word is a bug, not a quiet one

export async function renderStrip({ audio, samplingRate, peakDb = STRIP_PEAK_DB }) {
  if (!audio || !audio.length) throw new Error("renderStrip: no samples");
  let peak = 0;
  for (let i = 0; i < audio.length; i += 1) peak = Math.max(peak, Math.abs(audio[i]));
  const want = 10 ** (peakDb / 20);
  const gainDb = peak > 0 ? Math.min(20 * Math.log10(want / peak), STRIP_MAX_GAIN_DB) : 0;

  const { stdout: mp3 } = await ffmpeg(
    [
      "-hide_banner",
      "-nostdin",
      ...pcmArgs(samplingRate),
      "-af",
      [TRIM, gainDb ? `volume=${gainDb.toFixed(2)}dB` : null].filter(Boolean).join(","),
      "-c:a",
      "libmp3lame",
      "-b:a",
      "32k",
      "-ar",
      String(samplingRate),
      "-ac",
      "1",
      "-map_metadata",
      "-1",
      "-fflags",
      "+bitexact",
      "-write_id3v2",
      "0",
      "-f",
      "mp3",
      "-",
    ],
    toPcm16(audio)
  );
  if (!mp3.length) throw new Error("renderStrip: ffmpeg produced no audio");
  return {
    mp3,
    bytes: mp3.length,
    durationMs: mp3DurationMs(mp3) ?? Math.round((audio.length / samplingRate) * 1000),
    gainDb: Number(gainDb.toFixed(2)),
  };
}

/** ffmpeg present? Reported once, up front, by the CLI. */
export async function haveFfmpeg() {
  try {
    await ffmpeg(["-hide_banner", "-version"], Buffer.alloc(0));
    return true;
  } catch {
    return false;
  }
}
