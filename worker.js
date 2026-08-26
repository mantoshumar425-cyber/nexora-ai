const MODEL = "gemini-3.6-flash";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Cache-Control": "no-store"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      // Home
      if (url.pathname === "/" && request.method === "GET") {
        return html(homePage(), cors);
      }

      // Health
      if (url.pathname === "/api/health") {
        return json({
          success: true,
          service: "Nexora AI",
          worker: "online",
          model: MODEL,
          geminiKey: Boolean(env.GEMINI_API_KEY),
          version: "1.0.0"
        }, 200, cors);
      }

      // Chat
      if (url.pathname === "/api/chat" && request.method === "POST") {
        return await chat(request, env, cors);
      }

      // Simple GET search compatibility
      if (url.pathname === "/api/search" && request.method === "GET") {
        const query = (url.searchParams.get("q") || "").trim();

        if (!query) {
          return json({
            success: false,
            error: "Query is required"
          }, 400, cors);
        }

        const answer = await askGemini(env, query);

        return json({
          success: true,
          query,
          answer,
          model: MODEL
        }, 200, cors);
      }

      return json({
        success: false,
        error: "Endpoint not found"
      }, 404, cors);

    } catch (error) {
      return json({
        success: false,
        error: error instanceof Error
          ? error.message
          : String(error)
      }, 500, cors);
    }
  }
};


// =====================================================
// CHAT
// =====================================================

async function chat(request, env, cors) {
  if (!env.GEMINI_API_KEY) {
    return json({
      success: false,
      error: "GEMINI_API_KEY is not configured."
    }, 500, cors);
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json({
      success: false,
      error: "Invalid JSON."
    }, 400, cors);
  }

  const message = String(body?.message || "").trim();

  if (!message) {
    return json({
      success: false,
      error: "Message is required."
    }, 400, cors);
  }

  const history = Array.isArray(body?.history)
    ? body.history.slice(-12)
    : [];

  const contents = [];

  for (const item of history) {
    const role =
      item?.role === "assistant"
        ? "model"
        : "user";

    const text = String(item?.content || "").trim();

    if (!text) continue;

    contents.push({
      role,
      parts: [{ text }]
    });
  }

  contents.push({
    role: "user",
    parts: [{ text: message }]
  });

  const answer = await askGeminiContents(
    env,
    contents
  );

  return json({
    success: true,
    answer,
    model: MODEL
  }, 200, cors);
}


// =====================================================
// SIMPLE GEMINI REQUEST
// =====================================================

async function askGemini(env, prompt) {
  return await askGeminiContents(env, [
    {
      role: "user",
      parts: [
        {
          text: prompt
        }
      ]
    }
  ]);
}


// =====================================================
// GEMINI API
// =====================================================

async function askGeminiContents(env, contents) {
  const apiKey = env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY secret is missing."
    );
  }

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(endpoint, {
    method: "POST",

    headers: {
      "Content-Type": "application/json"
    },

    body: JSON.stringify({
      systemInstruction: {
        parts: [
          {
            text:
              "You are Nexora AI, a helpful, accurate and friendly AI assistant. " +
              "Answer clearly and naturally. Use Markdown when useful. " +
              "Do not invent facts or sources. " +
              "If you are uncertain, say so."
          }
        ]
      },

      contents
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      `Gemini API error: ${response.status}`
    );
  }

  const answer =
    data?.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim();

  if (!answer) {
    throw new Error(
      "Gemini returned an empty response."
    );
  }

  return answer;
}


// =====================================================
// RESPONSE HELPERS
// =====================================================

function json(data, status, cors) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers: {
        ...cors,
        "Content-Type":
          "application/json; charset=UTF-8"
      }
    }
  );
}


function html(content, cors) {
  return new Response(content, {
    status: 200,
    headers: {
      ...cors,
      "Content-Type":
        "text/html; charset=UTF-8"
    }
  });
}


// =====================================================
// HOMEPAGE
// =====================================================

function homePage() {
  return `<!DOCTYPE html>
<html lang="en">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

<title>Nexora AI</title>

<meta
  name="description"
  content="Nexora AI - Your intelligent AI assistant."
>

<style>

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;

  font-family:
    Inter,
    Arial,
    sans-serif;

  background: #0b0d12;
  color: #f5f7fb;

  display: flex;
  flex-direction: column;
}

header {
  height: 64px;

  display: flex;
  align-items: center;
  justify-content: space-between;

  padding: 0 22px;

  border-bottom:
    1px solid #222631;

  background:
    rgba(11,13,18,.9);

  backdrop-filter: blur(16px);
}

.brand {
  font-size: 21px;
  font-weight: 800;
  letter-spacing: -.5px;
}

.brand span {
  background:
    linear-gradient(
      90deg,
      #8b7cff,
      #4fdcff
    );

  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.new-chat {
  border: 1px solid #303542;

  background: #151821;
  color: #fff;

  padding: 9px 14px;

  border-radius: 10px;

  cursor: pointer;
}

main {
  flex: 1;

  width: 100%;
  max-width: 900px;

  margin: auto;

  padding:
    50px 18px 130px;
}

.welcome {
  text-align: center;
  margin-top: 15vh;
}

.welcome h1 {
  margin: 0 0 10px;

  font-size:
    clamp(34px, 8vw, 58px);

  letter-spacing: -2px;
}

.welcome p {
  margin: 0;

  color: #9299a8;
  font-size: 16px;
}

.chat {
  display: none;
}

.message {
  display: flex;
  gap: 14px;

  padding: 22px 0;

  border-bottom:
    1px solid #1d212a;
}

.avatar {
  width: 34px;
  height: 34px;

  flex: 0 0 34px;

  border-radius: 50%;

  display: flex;
  align-items: center;
  justify-content: center;

  font-size: 13px;
  font-weight: 800;

  background: #202532;
}

.message-content {
  flex: 1;

  white-space: pre-wrap;

  line-height: 1.7;

  overflow-wrap: anywhere;
}

.user .avatar {
  background: #343947;
}

.assistant .avatar {
  background:
    linear-gradient(
      135deg,
      #655cf6,
      #25bfe2
    );
}

.composer {
  position: fixed;

  left: 50%;
  bottom: 18px;

  transform: translateX(-50%);

  width:
    min(850px, calc(100% - 28px));

  display: flex;

  gap: 8px;

  padding: 8px;

  background: #171a22;

  border:
    1px solid #303542;

  border-radius: 18px;

  box-shadow:
    0 15px 45px
    rgba(0,0,0,.4);
}

.composer textarea {
  flex: 1;

  min-height: 48px;
  max-height: 150px;

  resize: none;

  border: 0;
  outline: 0;

  background: transparent;

  color: white;

  padding: 13px;

  font-size: 15px;
}

.composer textarea::placeholder {
  color: #777f91;
}

.send {
  width: 48px;
  height: 48px;

  border: 0;

  border-radius: 13px;

  background:
    linear-gradient(
      135deg,
      #6961f7,
      #26c6e6
    );

  color: white;

  font-size: 18px;

  cursor: pointer;
}

.send:disabled {
  opacity: .5;
  cursor: wait;
}

@media(max-width:600px) {

  header {
    padding: 0 15px;
  }

  main {
    padding-top: 35px;
  }

  .welcome {
    margin-top: 18vh;
  }

  .message {
    padding: 17px 0;
  }

  .composer {
    bottom: 10px;
  }

}

</style>

</head>

<body>

<header>

  <div class="brand">
    <span>Nexora</span> AI
  </div>

  <button
    class="new-chat"
    onclick="newChat()"
  >
    + New chat
  </button>

</header>


<main>

  <section
    class="welcome"
    id="welcome"
  >

    <h1>
      What can I help with?
    </h1>

    <p>
      Ask Nexora AI anything.
    </p>

  </section>


  <section
    class="chat"
    id="chat"
  ></section>

</main>


<form
  class="composer"
  id="composer"
>

  <textarea
    id="message"
    placeholder="Message Nexora AI..."
    rows="1"
  ></textarea>

  <button
    class="send"
    id="send"
    type="submit"
  >
    ↑
  </button>

</form>


<script>

const welcome =
  document.getElementById("welcome");

const chat =
  document.getElementById("chat");

const message =
  document.getElementById("message");

const send =
  document.getElementById("send");

const composer =
  document.getElementById("composer");

let history = [];


function addMessage(role, text) {

  welcome.style.display = "none";
  chat.style.display = "block";

  const wrapper =
    document.createElement("div");

  wrapper.className =
    "message " + role;

  const avatar =
    document.createElement("div");

  avatar.className = "avatar";

  avatar.textContent =
    role === "user"
      ? "You"
      : "N";

  const content =
    document.createElement("div");

  content.className =
    "message-content";

  content.textContent = text;

  wrapper.appendChild(avatar);
  wrapper.appendChild(content);

  chat.appendChild(wrapper);

  window.scrollTo({
    top: document.body.scrollHeight,
    behavior: "smooth"
  });
}


async function sendMessage() {

  const text =
    message.value.trim();

  if (!text || send.disabled) {
    return;
  }

  addMessage("user", text);

  history.push({
    role: "user",
    content: text
  });

  message.value = "";

  send.disabled = true;

  const thinking =
    document.createElement("div");

  thinking.className =
    "message assistant";

  thinking.id =
    "thinking";

  thinking.innerHTML =
    '<div class="avatar">N</div>' +
    '<div class="message-content">' +
    'Nexora is thinking...' +
    '</div>';

  chat.appendChild(thinking);

  try {

    const response =
      await fetch("/api/chat", {

        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({
          message: text,
          history:
            history.slice(-12)
        })

      });

    const data =
      await response.json();

    thinking.remove();

    if (!response.ok ||
        !data.success) {

      throw new Error(
        data.error ||
        "Request failed"
      );
    }

    addMessage(
      "assistant",
      data.answer
    );

    history.push({
      role: "assistant",
      content: data.answer
    });

  } catch (error) {

    thinking.remove();

    addMessage(
      "assistant",
      "Sorry, something went wrong: " +
      error.message
    );

  } finally {

    send.disabled = false;

    message.focus();

  }
}


composer.addEventListener(
  "submit",
  function(event) {

    event.preventDefault();

    sendMessage();

  }
);


message.addEventListener(
  "keydown",
  function(event) {

    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {

      event.preventDefault();

      sendMessage();

    }

  }
);


function newChat() {

  history = [];

  chat.innerHTML = "";

  chat.style.display = "none";

  welcome.style.display = "block";

  message.focus();

}


message.focus();

</script>

</body>

</html>`;
          
