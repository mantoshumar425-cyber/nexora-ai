const MODEL = "gemini-3.6-flash";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers
      });
    }

    if (url.pathname === "/") {
      return new Response(
        JSON.stringify({
          success: true,
          service: "Nexora AI",
          status: "online",
          model: MODEL
        }, null, 2),
        {
          status: 200,
          headers
        }
      );
    }

    if (url.pathname === "/api/health") {
      return new Response(
        JSON.stringify({
          success: true,
          service: "Nexora AI",
          worker: "online",
          model: MODEL,
          geminiKey: Boolean(env.GEMINI_API_KEY)
        }, null, 2),
        {
          status: 200,
          headers
        }
      );
    }

    if (url.pathname === "/api/chat" && request.method === "POST") {
      if (!env.GEMINI_API_KEY) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "GEMINI_API_KEY is not configured"
          }),
          {
            status: 500,
            headers
          }
        );
      }

      const body = await request.json();
      const message = String(body.message || "").trim();

      if (!message) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Message is empty"
          }),
          {
            status: 400,
            headers
          }
        );
      }

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: message
                  }
                ]
              }
            ]
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return new Response(
          JSON.stringify({
            success: false,
            error: data?.error?.message || "Gemini API error"
          }),
          {
            status: response.status,
            headers
          }
        );
      }

      const answer =
        data?.candidates?.[0]?.content?.parts
          ?.map(part => part.text || "")
          .join("")
          .trim();

      return new Response(
        JSON.stringify({
          success: true,
          answer: answer || "No response received",
          model: MODEL
        }, null, 2),
        {
          status: 200,
          headers
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: "Endpoint not found"
      }),
      {
        status: 404,
        headers
      }
    );
  }
};
