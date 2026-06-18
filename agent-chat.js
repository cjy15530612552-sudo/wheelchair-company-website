(function () {
  "use strict";

  const WELCOME_TEXT = "你好，我是智能产品顾问，请告诉我你想找什么类型的轮椅。";
  const TIP_TEXT = "和我聊天，您可以在这里找到符合您需求的产品";
  const TIP_STORAGE_KEY = "chatTipClosed";
  const CHAT_API_URL = "/api/chat";
  const CHAT_ERROR_TEXT = "连接后端失败，请检查后端是否正在运行。";

  function isTipClosed() {
    try {
      return window.sessionStorage.getItem(TIP_STORAGE_KEY) === "true";
    } catch (error) {
      return false;
    }
  }

  function rememberTipClosed() {
    try {
      window.sessionStorage.setItem(TIP_STORAGE_KEY, "true");
    } catch (error) {
      // Ignore storage errors so the chat launcher still works normally.
    }
  }

  function appendMessage(body, role, text) {
    const message = document.createElement("div");
    message.className = `agent-chat__message agent-chat__message--${role}`;

    const bubble = document.createElement("div");
    bubble.className = "agent-chat__bubble";
    bubble.textContent = text;

    message.appendChild(bubble);
    body.appendChild(message);
    body.scrollTop = body.scrollHeight;
    return bubble;
  }

  function createAgentChat() {
    if (document.querySelector("[data-agent-chat]")) return;

    const launcher = document.createElement("button");
    launcher.className = "agent-chat-launcher";
    launcher.type = "button";
    launcher.setAttribute("data-agent-chat-launcher", "");
    launcher.setAttribute("aria-label", "打开智能产品顾问");
    launcher.innerHTML = `<img class="agent-chat-launcher__icon" src="assets/chat/agent-service-icon.png" alt="" aria-hidden="true" />`;

    let tip = null;
    if (!isTipClosed()) {
      tip = document.createElement("aside");
      tip.className = "agent-chat-tip";
      tip.setAttribute("data-agent-chat-tip", "");
      tip.setAttribute("aria-label", "智能产品顾问提示");

      const tipText = document.createElement("p");
      tipText.className = "agent-chat-tip__text";
      tipText.textContent = TIP_TEXT;

      const tipClose = document.createElement("button");
      tipClose.className = "agent-chat-tip__close";
      tipClose.type = "button";
      tipClose.setAttribute("aria-label", "关闭智能产品顾问提示");
      tipClose.textContent = "×";

      tip.append(tipText, tipClose);
      tipClose.addEventListener("click", () => {
        tip.classList.add("is-hidden");
        tip.setAttribute("aria-hidden", "true");
        rememberTipClosed();
      });
    }

    const chat = document.createElement("section");
    chat.className = "agent-chat";
    chat.setAttribute("data-agent-chat", "");
    chat.setAttribute("aria-label", "智能产品顾问聊天框");
    chat.setAttribute("aria-hidden", "true");
    chat.innerHTML = `
      <header class="agent-chat__header">
        <span>智能产品顾问</span>
        <button class="agent-chat__close" type="button" aria-label="关闭智能产品顾问" data-agent-chat-close>×</button>
      </header>
      <div class="agent-chat__body" data-agent-chat-body></div>
      <form class="agent-chat__form" data-agent-chat-form>
        <input class="agent-chat__input" name="message" type="text" autocomplete="off" placeholder="请输入你的需求" data-agent-chat-input />
        <button class="agent-chat__send" type="submit">发送</button>
      </form>
    `;

    document.body.appendChild(launcher);
    if (tip) {
      document.body.appendChild(tip);
    }
    document.body.appendChild(chat);

    const body = chat.querySelector("[data-agent-chat-body]");
    const form = chat.querySelector("[data-agent-chat-form]");
    const input = chat.querySelector("[data-agent-chat-input]");
    const closeButton = chat.querySelector("[data-agent-chat-close]");

    appendMessage(body, "agent", WELCOME_TEXT);

    function hideTip() {
      if (!tip) return;
      tip.classList.add("is-hidden");
      tip.setAttribute("aria-hidden", "true");
    }

    function openChat() {
      hideTip();
      launcher.classList.add("is-hidden");
      chat.classList.add("is-open");
      chat.setAttribute("aria-hidden", "false");
      body.scrollTop = body.scrollHeight;
      window.setTimeout(() => input.focus(), 120);
    }

    function closeChat() {
      chat.classList.remove("is-open");
      chat.setAttribute("aria-hidden", "true");
      launcher.classList.remove("is-hidden");
    }

    launcher.addEventListener("click", openChat);
    closeButton.addEventListener("click", closeChat);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const userText = input.value.trim();
      if (!userText) return;

      appendMessage(body, "user", userText);
      input.value = "";

      const thinkingBubble = appendMessage(body, "agent", "正在思考...");

      try {
        const response = await fetch(CHAT_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message: userText }),
        });

        if (!response.ok) {
          throw new Error(`Chat API responded with ${response.status}`);
        }

        const data = await response.json();
        thinkingBubble.textContent = data.answer || CHAT_ERROR_TEXT;
      } catch (error) {
        thinkingBubble.textContent = CHAT_ERROR_TEXT;
      }

      body.scrollTop = body.scrollHeight;
    });
  }

  document.addEventListener("DOMContentLoaded", createAgentChat);
})();
