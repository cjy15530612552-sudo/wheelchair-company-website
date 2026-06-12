(function () {
  "use strict";

  const WELCOME_TEXT = "你好，我是智能产品顾问，请告诉我你想找什么类型的轮椅。";

  function appendMessage(body, role, text) {
    const message = document.createElement("div");
    message.className = `agent-chat__message agent-chat__message--${role}`;

    const bubble = document.createElement("div");
    bubble.className = "agent-chat__bubble";
    bubble.textContent = text;

    message.appendChild(bubble);
    body.appendChild(message);
    body.scrollTop = body.scrollHeight;
  }

  function createAgentChat() {
    if (document.querySelector("[data-agent-chat]")) return;

    const launcher = document.createElement("button");
    launcher.className = "agent-chat-launcher";
    launcher.type = "button";
    launcher.setAttribute("data-agent-chat-launcher", "");
    launcher.setAttribute("aria-label", "打开智能产品顾问");
    launcher.innerHTML = `<span class="agent-chat-launcher__icon" aria-hidden="true"></span>`;

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
    document.body.appendChild(chat);

    const body = chat.querySelector("[data-agent-chat-body]");
    const form = chat.querySelector("[data-agent-chat-form]");
    const input = chat.querySelector("[data-agent-chat-input]");
    const closeButton = chat.querySelector("[data-agent-chat-close]");

    appendMessage(body, "agent", WELCOME_TEXT);

    function openChat() {
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

    form.addEventListener("submit", (event) => {
      event.preventDefault();

      const userText = input.value.trim();
      if (!userText) return;

      appendMessage(body, "user", userText);
      input.value = "";
      appendMessage(body, "agent", `我收到了你的问题：${userText}`);
    });
  }

  document.addEventListener("DOMContentLoaded", createAgentChat);
})();
