import type { Effect } from "./effects.ts";

const ENDPOINT = "https://api.elevenlabs.io/v1/sound-generation";
const OUTPUT_FORMAT = "mp3_44100_128";
const MODEL_ID = "eleven_text_to_sound_v2";
const MIN_API_DURATION = 0.5;
const PROMPT_INFLUENCE = 0.5;
const MAX_ERROR_BODY = 300;

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface SoundRequestBody {
  text: string;
  duration_seconds: number;
  prompt_influence: number;
  loop: boolean;
  model_id: string;
}

export function buildRequestBody(effect: Effect): SoundRequestBody {
  return {
    text: effect.prompt,
    duration_seconds: Math.max(effect.duration, MIN_API_DURATION),
    prompt_influence: PROMPT_INFLUENCE,
    loop: effect.loop,
    model_id: MODEL_ID,
  };
}

export async function requestSoundEffect(
  effect: Effect,
  apiKey: string,
  fetchImpl: FetchLike = fetch,
): Promise<Buffer> {
  const url = `${ENDPOINT}?output_format=${OUTPUT_FORMAT}`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "content-type": "application/json",
      accept: "audio/mpeg",
    },
    body: JSON.stringify(buildRequestBody(effect)),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, MAX_ERROR_BODY);
    throw new Error(`${effect.id}: ElevenLabs returned ${response.status}: ${detail}`);
  }
  const audio = Buffer.from(await response.arrayBuffer());
  if (audio.length === 0) {
    throw new Error(`${effect.id}: ElevenLabs returned an empty file`);
  }
  return audio;
}
