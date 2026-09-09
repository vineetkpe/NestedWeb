import "server-only";

const maxResponseBytes = 2 * 1024 * 1024;
export class ResponseTooLarge extends Error {}

export function discard(body: ReadableStream<Uint8Array> | null): void {
  // Cancellation failure cannot change an already selected safe error outcome.
  if (body && !body.locked) void body.cancel().catch(() => undefined);
}

export async function readProviderBody(
  response: Response,
  signal: AbortSignal,
  preserveBom = false,
): Promise<string> {
  const length = response.headers.get("content-length");
  if (length !== null && Number(length) > maxResponseBytes) {
    discard(response.body);
    throw new ResponseTooLarge();
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    signal.throwIfAborted();
    let bytes = 0;
    let text = "";
    const decoder = new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: preserveBom,
    });
    while (true) {
      const chunk = await reader.read();
      signal.throwIfAborted();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxResponseBytes) throw new ResponseTooLarge();
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    signal.removeEventListener("abort", cancel);
    cancel();
    reader.releaseLock();
  }
}
