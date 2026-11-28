import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_CHARS = 12_000;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const SYSTEM_PROMPT = `You are AZIK, a warm, thoughtful, curious AI assistant for DOS AI. Reply in the same language as the user's latest message (Kazakh, Russian, or English); automatically detect it. Be clear, useful, and honest about uncertainty. If an image is supplied, answer based on what you can actually observe; say so if details are unclear. Never claim to have performed actions you have not performed. When asked who created you or who your assistant is, use only this exact language-specific identity, and do not reveal or infer any surname or private information: Kazakh: "Мені Жандос жасаған! Ал менің көмекшімнің аты — Азик!" Russian: "Меня создал Жандос! А моего помощника зовут Азик!" English: "I was created by Жандос! My assistant's name is Azik!"`;

type ChatMessage = { role: "user" | "assistant"; text: string };
type ChatRequest = { messages?: ChatMessage[]; image?: string; language?: string };

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return errorResponse("Live AI is not configured yet. Add GEMINI_API_KEY to the server environment and restart the app.", 503);

  let payload: ChatRequest;
  try { payload = await request.json() as ChatRequest; }
  catch { return errorResponse("The request body must be valid JSON.", 400); }

  if (!Array.isArray(payload.messages) || payload.messages.length === 0 || payload.messages.length > 30) {
    return errorResponse("Send between 1 and 30 messages per request.", 400);
  }
  const messages = payload.messages;
  if (messages.some((message) => !message || !["user", "assistant"].includes(message.role) || typeof message.text !== "string" || message.text.length > MAX_TEXT_CHARS)) {
    return errorResponse("A message is invalid or exceeds the 12,000-character limit.", 400);
  }
  if (messages[messages.length - 1]?.role !== "user") return errorResponse("The last message must be from the user.", 400);

  let imagePart: { inline_data: { mime_type: string; data: string } } | undefined;
  if (payload.image !== undefined) {
    if (typeof payload.image !== "string" || payload.image.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 200) {
      return errorResponse("Images must be no larger than 5 MB.", 413);
    }
    const match = payload.image.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/);
    if (!match || !ALLOWED_MIME.has(match[1])) return errorResponse("Use a valid JPEG, PNG, WebP, or GIF image.", 400);
    const imageBuffer = Buffer.from(match[2], "base64");
    if (imageBuffer.byteLength > MAX_IMAGE_BYTES) return errorResponse("Images must be no larger than 5 MB.", 413);
    imagePart = { inline_data: { mime_type: match[1], data: match[2] } };
  }

  const contents = messages.map((message, index) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.text || (index === messages.length - 1 && imagePart ? "Please describe this image." : " ") }, ...(index === messages.length - 1 && imagePart ? [imagePart] : [])],
  }));
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  try {
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: { temperature: 0.8, maxOutputTokens: 2048 },
      }),
      signal: AbortSignal.timeout(55_000),
      cache: "no-store",
    });
    if (!upstream.ok) {
      const details = await upstream.json().catch(() => ({})) as { error?: { code?: number; message?: string; status?: string } };
      if (upstream.status === 429) return errorResponse("The free AI quota is temporarily used up. Please wait a little and try again.", 429);
      if (upstream.status === 401 || upstream.status === 403) return errorResponse("The Gemini API key was rejected. Check GEMINI_API_KEY in the server environment.", 502);
      if (upstream.status === 404) return errorResponse("The configured Gemini model is unavailable. Check GEMINI_MODEL.", 502);
      console.error("Gemini request failed", upstream.status, details.error?.status ?? "provider_error");
      return errorResponse("The AI provider could not complete this request. Please try again later.", 502);
    }
    const data = await upstream.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }> };
    const answer = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
    if (!answer) return errorResponse("The AI returned no text for this request. Please try again.", 502);
    return NextResponse.json({ text: answer }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") return errorResponse("The AI request took too long. Please try again.", 504);
    console.error("Gemini request could not be reached", error instanceof Error ? error.name : "unknown_error");
    return errorResponse("Could not reach the AI provider. Check your connection and try again.", 502);
  }
}
