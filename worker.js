const MODEL = "gemini-3.6-flash";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store"
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS
      });
    }

    try {
      // -----------------------------
      // HEALTH
      // -----------------------------
      if (url.pathname === "/api/health") {
        return json({
          success: true,
          service: "Nexora AI",
          worker: "online",
          model: MODEL,
          geminiKey: Boolean(env.GEMINI_API_KEY),
          streaming: true,
          vision: true,
          files: true
        });
      }

      // -----------------------------
      // CHAT
      // -----------------------------
      if (
        url.pathname === "/api/chat" &&
        request.method === "POST"
      ) {
        return chat(request, env);
      }

      // -----------------------------
      // WEBSITE
      // -----------------------------
      if (env.ASSETS) {
        const asset = await env.ASSETS.fetch(request);

        if (asset.status !== 404) {
          return asset;
        }

        const fallback = await env.ASSETS.fetch(
          new Request(
            new URL("/index.html", request.url),
            request
          )
        );

        if (fallback.status !== 404) {
          return fallback;
        }
      }

      if (url.pathname === "/") {
        return json({
          success: true,
          service: "Nexora AI",
          status: "online",
          model: MODEL
        });
      }

      return json({
        success: false,
        error: "Endpoint not found"
      }, 404);

    } catch (error) {
      return json({
        success: false,
        error: error?.message || String(error)
      }, 500);
    }
  }
};


// =================================================
// CHAT
// =================================================

async function chat(request, env) {

  if (!env.GEMINI_API_KEY) {
    return json({
      success: false,
      error: "GEMINI_API_KEY is not configured."
    }, 500);
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json({
      success: false,
      error: "Invalid JSON request."
    }, 400);
  }

  const message =
    String(body?.message || "").trim();

  if (!message) {
    return json({
      success: false,
      error: "Message is empty."
    }, 400);
  }

  // ---------------------------------------------
  // Conversation history
  // ---------------------------------------------

  const contents = [];

  if (Array.isArray(body?.history)) {

    for (
      const item of body.history.slice(-12)
    ) {

      const text =
        String(item?.content || "").trim();

      if (!text) continue;

      contents.push({
        role:
          item.role === "assistant"
            ? "model"
            : "user",

        parts: [
          {
            text
          }
        ]
      });
    }
  }

  // ---------------------------------------------
  // Current message
  // ---------------------------------------------

  const parts = [
    {
      text: message
    }
  ];


  // ---------------------------------------------
  // Image support
  //
  // Frontend can send:
  //
  // {
  //   image: {
  //     mimeType: "image/jpeg",
  //     data: "BASE64..."
  //   }
  // }
  // ---------------------------------------------

  if (
    body?.image?.data &&
    body?.image?.mimeType
  ) {

    const mimeType =
      String(
        body.image.mimeType
      );

    const data =
      String(
        body.image.data
      );

    if (
      mimeType.startsWith("image/")
    ) {

      parts.push({
        inlineData: {
          mimeType,
          data
        }
      });

    }

  }


  contents.push({
    role: "user",
    parts
  });


  // ---------------------------------------------
  // Gemini API
  // ---------------------------------------------

  const endpoint =
    "https://generativelanguage.googleapis.com/" +
    "v1beta/models/" +
    encodeURIComponent(MODEL) +
    ":streamGenerateContent?alt=sse&key=" +
    encodeURIComponent(
      env.GEMINI_API_KEY
    );


  const geminiResponse =
    await fetch(
      endpoint,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({

          systemInstruction: {
            parts: [
              {
                text:
                  "You are Nexora AI. " +
                  "Be helpful, accurate, clear, " +
                  "and friendly. " +
                  "Use Markdown when useful."
              }
            ]
          },

          contents,

          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4096
          }

        })
      }
    );


  if (!geminiResponse.ok) {

    const errorText =
      await geminiResponse.text();

    let errorMessage =
      "Gemini API request failed.";

    try {

      const errorJSON =
        JSON.parse(errorText);

      errorMessage =
        errorJSON?.error?.message ||
        errorMessage;

    } catch {}

    return json({
      success: false,
      error: errorMessage,
      model: MODEL
    }, geminiResponse.status);
  }


  // ---------------------------------------------
  // STREAM TO BROWSER
  // ---------------------------------------------

  const encoder =
    new TextEncoder();

  const decoder =
    new TextDecoder();

  const reader =
    geminiResponse.body.getReader();


  const stream =
    new ReadableStream({

      async start(controller) {

        try {

          while (true) {

            const {
              value,
              done
            } = await reader.read();

            if (done) break;

            const chunk =
              decoder.decode(
                value,
                { stream: true }
              );

            controller.enqueue(
              encoder.encode(chunk)
            );
          }

        } catch (error) {

          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                error:
                  error?.message ||
                  "Streaming error"
              })
            )
          );

        } finally {

          controller.close();

        }

      }

    });


  return new Response(
    stream,
    {
      status: 200,
      headers: {
        ...CORS,
        "Content-Type":
          "text/event-stream; charset=utf-8",
        "X-Accel-Buffering": "no"
      }
    }
  );
}


// =================================================
// JSON
// =================================================

function json(
  data,
  status = 200
) {

  return new Response(
    JSON.stringify(
      data,
      null,
      2
    ),
    {
      status,

      headers: {
        ...CORS,
        "Content-Type":
          "application/json; charset=UTF-8"
      }
    }
  );
}
