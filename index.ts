// Seedance 2.5 text-to-video through the Higgsfield SDK.
// Run with: npm run higgsfield
// HF_CREDENTIALS ("key-id:key-secret") comes from .env.local via Node's
// --env-file; it is never printed.

import { config, higgsfield, HiggsfieldError } from "@higgsfield/client/v2";

const MODEL = "bytedance/seedance-2.5/text-to-video";

if (!process.env.HF_CREDENTIALS) {
  console.error("HF_CREDENTIALS is not set. Add it to .env.local as key-id:key-secret.");
  process.exit(1);
}

config({
  credentials: process.env.HF_CREDENTIALS,
  // video takes longer than the SDK's 5-minute default
  maxPollTime: 15 * 60 * 1000,
});

try {
  console.log(`Submitting to ${MODEL} and waiting for it to finish...`);
  const result = await higgsfield.subscribe(MODEL, {
    input: {
      prompt: "A cinematic scene at sunset",
      duration: 5,
      resolution: "720p",
      aspect_ratio: "16:9",
    },
    withPolling: true,
  });

  // The SDK stops polling on completed, failed or nsfw; anything that isn't
  // a completed request with a video is a failure.
  const status: string = result.status;
  const url = result.video?.url;
  if (status === "completed" && url) {
    console.log(`Done (request ${result.request_id}).`);
    console.log(`Video URL: ${url}`);
  } else {
    const reason =
      status === "nsfw"
        ? "blocked by moderation"
        : status === "failed"
          ? "generation failed"
          : status === "canceled" || status === "cancelled"
            ? "request was canceled"
            : status === "completed"
              ? "completed without a video URL"
              : `unexpected status "${status}"`;
    console.error(`No video: ${reason} (request ${result.request_id}).`);
    process.exitCode = 1;
  }
} catch (err) {
  const name = err instanceof HiggsfieldError ? err.name : "Error";
  console.error(`Request failed: ${name}: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
}
