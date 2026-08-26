const MODEL = "gemini-3.6-flash";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "no-store"
    };

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    try {
      // =========================================
      // HEALTH CHECK
      // =========================================

      if (url.pathname === "/api/health") {
        return json(
          {
            success: true,
            service: "Nexora AI",
            worker: "online",
            model: MODEL,
            geminiKey: Boolean(env.GEMINI_API_KEY)
          },
          200,
          corsHeaders
        );
      }

      // =========================================
      // CHAT API
      // =========================================

      if (
        url.pathname === "/api/chat" &&
        request.method === "POST"
      ) {
        return await handleChat(
          request,
          env,
          corsHeaders
        );
      }

      // =========================================
      // WEBSITE
      // =========================================

      // Everything that is not an API endpoint
      // is served by the Cloudflare Assets binding.
      if (env.ASSETS) {
        const assetResponse =
          await env.ASSETS.fetch(request);

        if (assetResponse.status !== 404) {
          return assetResponse;
        }

        // SPA fallback:
        // If a normal page is requested, serve index.html.
        const indexRequest =
          new Request(
            new URL("/index.html", request.url),
            request
          );

        const indexResponse =
          await env.ASSETS.fetch(indexRequest);

        if (indexResponse.status !== 404) {
          return indexResponse;
        }
      }

      // =========================================
      // ROOT FALLBACK
      // =========================================

      if (url.pathname === "/") {
        return json(
          {
            success: true,
            service: "Nexora AI",
            status: "online",
            model: MODEL,
            message:
              "Nexora AI Worker is running, but index.html was not found."
          },
          200,
          corsHeaders
        );
      }

      // =========================================
      // 404
      // =========================================

      return json(
        {
          success: false,
          error: "Endpoint not found"
        },
        404,
        corsHeaders
      );

    } catch (error) {

      return json(
        {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : String(error)
        },
        500,
        corsHeaders
      );
    }
  }
};


// =================================================
// CHAT HANDLER
// =================================================

async function handleChat(
  request,
  env,
  headers
) {

  if (!env.GEMINI_API_KEY) {
    return json(
      {
        success: false,
        error:
          "GEMINI_API_KEY is not configured in Cloudflare."
      },
      500,
      headers
    );
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json(
      {
        success: false,
        error: "Invalid JSON request body."
      },
      400,
      headers
    );
  }

  const message =
    String(body?.message || "").trim();

  if (!message) {
    return json(
      {
        success: false,
        error: "Message is empty."
      },
      400,
      headers
    );
  }

  // Optional conversation history
  const history =
    Array.isArray(body?.history)
      ? body.history
      : [];

  const contents = [];

  // Keep only recent messages
  const recentHistory =
    history.slice(-12);

  for (const item of recentHistory) {

    if (!item) continue;

    const role =
      item.role === "assistant"
        ? "model"
        : "user";

    const text =
      String(item.content || "").trim();

    if (!text) continue;

    contents.push({
      role,
      parts: [
        {
          text
        }
      ]
    });
  }

  // Add current message
  contents.push({
    role: "user",
    parts: [
      {
        text: message
      }
    ]
  });


  // =========================================
  // GEMINI REQUEST
  // =========================================

  const endpoint =
    "https://generativelanguage.googleapis.com/" +
    "v1beta/models/" +
    encodeURIComponent(MODEL) +
    ":generateContent?key=" +
    encodeURIComponent(env.GEMINI_API_KEY);


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
                  "You are Nexora AI, a helpful, " +
                  "clear and friendly AI assistant. " +
                  "Answer accurately and naturally. " +
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


  let data;

  try {
    data =
      await geminiResponse.json();
  } catch {
    return json(
      {
        success: false,
        error:
          "Gemini returned an invalid response."
      },
      502,
      headers
    );
  }


  // =========================================
  // GEMINI ERROR
  // =========================================

  if (!geminiResponse.ok) {

    return json(
      {
        success: false,
        error:
          data?.error?.message ||
          "Gemini API request failed.",
        model: MODEL
      },
      geminiResponse.status,
      headers
    );
  }


  // =========================================
  // EXTRACT ANSWER
  // =========================================

  const candidates =
    Array.isArray(data?.candidates)
      ? data.candidates
      : [];

  const answer =
    candidates?.[0]?.content?.parts
      ?.map(part =>
        typeof part?.text === "string"
          ? part.text
          : ""
      )
      .join("")
      .trim();


  if (!answer) {

    const finishReason =
      candidates?.[0]?.finishReason;

    return json(
      {
        success: false,
        error:
          finishReason
            ? `No answer generated. Finish reason: ${finishReason}`
            : "No response received from Gemini.",
        model: MODEL
      },
      502,
      headers
    );
  }


  // =========================================
  // SUCCESS
  // =========================================

  return json(
    {
      success: true,
      answer,
      model: MODEL
    },
    200,
    headers
  );
}


// =================================================
// JSON RESPONSE HELPER
// =================================================

function json(
  data,
  status = 200,
  headers = {}
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
        ...headers,
        "Content-Type":
          "application/json; charset=UTF-8"
      }
    }
  );
}
