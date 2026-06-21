(function () {
  "use strict";

  const LEGACY_LOCAL_SESSION_KEY = "junlongAuthSession";
  const LEGACY_TAB_SESSION_KEY = "junlongAuthSessionTab";
  let currentSession = null;
  let refreshPromise = null;

  function normalizeUser(user) {
    if (!user) return null;

    return {
      id: user.id || "",
      username: user.username || "",
      displayName: user.name || user.displayName || user.username || "",
      name: user.name || user.displayName || user.username || "",
      department: user.department || "",
      role: user.role || "",
      permissions: Array.isArray(user.permissions) ? user.permissions : [],
      active: user.active !== false
    };
  }

  function getSession() {
    return currentSession;
  }

  function isAuthorized(session = getSession()) {
    return Boolean(session && (
      session.permissions.includes("employee") ||
      session.username === "admin" ||
      session.role === "系统管理员"
    ));
  }

  function clearLegacySessions() {
    try {
      localStorage.removeItem(LEGACY_LOCAL_SESSION_KEY);
      sessionStorage.removeItem(LEGACY_TAB_SESSION_KEY);
    } catch (error) {
      // Storage can be unavailable in strict browser modes.
    }
  }

  function apiFetch(url, options = {}) {
    if (window.location.protocol === "file:") {
      return Promise.reject(new Error("登录系统需要通过服务器访问。"));
    }

    return fetch(url, {
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      ...options
    }).then(async (response) => {
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "请求失败");
      }

      return data;
    });
  }

  function currentPageTarget() {
    const pageName = decodeURIComponent(window.location.pathname.split("/").pop() || "index.html") || "index.html";

    if (pageName === "login.html") {
      return "index.html";
    }

    return `${pageName}${window.location.search}${window.location.hash}`;
  }

  function loginUrl(next = currentPageTarget()) {
    const loginPath = `login.html?next=${encodeURIComponent(next || "index.html")}`;

    return loginPath;
  }

  function updateNav() {
    const session = getSession();
    const openButton = document.querySelector("[data-auth-open]");
    const userBlock = document.querySelector("[data-auth-user]");
    const nameNode = document.querySelector("[data-auth-name]");

    if (openButton && userBlock && nameNode) {
      openButton.classList.toggle("auth-hidden", Boolean(session));
      userBlock.classList.toggle("auth-hidden", !session);
      nameNode.textContent = session ? session.displayName || session.username : "";
    }

    document.querySelectorAll(".auth-only").forEach((node) => {
      node.style.display = isAuthorized(session) ? "" : "none";
    });

    window.dispatchEvent(new CustomEvent("junlong-auth-change", {
      detail: {
        session,
        authorized: isAuthorized(session)
      }
    }));
  }

  async function refreshSession(force = false) {
    if (refreshPromise && !force) {
      return refreshPromise;
    }

    refreshPromise = (async () => {
      clearLegacySessions();

      try {
        const data = await apiFetch("/api/me");
        currentSession = data.loggedIn ? normalizeUser(data.user) : null;
      } catch (error) {
        currentSession = null;
      }

      updateNav();
      return currentSession;
    })();

    return refreshPromise;
  }

  async function logout() {
    try {
      await apiFetch("/api/logout", { method: "POST", body: "{}" });
    } catch (error) {
      // Keep the interface recoverable even if the server is already closed.
    }

    currentSession = null;
    updateNav();
  }

  function ensureNav() {
    const header = document.querySelector(".top-nav");
    const nav = document.querySelector(".nav-links");
    const container = header || nav;

    if (!container || container.querySelector("[data-auth-area]")) return;

    const authArea = document.createElement("div");
    authArea.className = "auth-nav";
    authArea.setAttribute("data-auth-area", "");
    authArea.innerHTML = `
      <button class="auth-entry" type="button" data-auth-open>登录</button>
      <div class="auth-user auth-hidden" data-auth-user>
        <span class="auth-name" data-auth-name></span>
        <button class="auth-logout" type="button" data-auth-logout>退出</button>
      </div>
    `;
    container.appendChild(authArea);
  }

  function bindEvents() {
    document.addEventListener("click", async (event) => {
      if (event.target.closest("[data-auth-open]")) {
        event.preventDefault();
        window.location.href = loginUrl();
        return;
      }

      if (event.target.closest("[data-auth-logout]")) {
        event.preventDefault();
        await logout();
      }
    });
  }

  window.JunlongAuth = {
    getSession,
    isAuthorized,
    refresh: refreshSession,
    logout,
    loginUrl
  };

  document.addEventListener("DOMContentLoaded", () => {
    ensureNav();
    bindEvents();
    updateNav();
    refreshSession(true);
  });
})();
