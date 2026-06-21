// Unified interaction entry for the website.
// Authentication is handled by the backend service through /api/* endpoints.
(function () {
    "use strict";

    const routes = {
        electric: "electric.html",
        manual: "manual.html",
        factory: "factory.html",
        employee: "staff.html",
        custom: "#"
    };

    let currentUserCache = null;
    let salesOrdersCache = [];
    let partsCache = [];
    let finishedGoodsCache = [];
    let finishedModelsCache = [];
    let employeeAccountsCache = [];
    let customerDirectoryCache = [];
    let currentSalesWheelchairType = "";
    let currentPartsWheelchairType = "";
    let currentFinishedWheelchairType = "";
    const salesStatusFlow = ["待打印", "待发货", "已发货（待确认）", "已完成"];
    const salesTypeLabels = {
        manual: "手动轮椅",
        electric: "电动轮椅"
    };

    async function apiFetch(url, options) {
        if (window.location.protocol === "file:") {
            throw new Error("登录系统需要通过正式网站域名或后端服务访问，不要直接打开本地HTML文件。");
        }

        let response;

        try {
            response = await fetch(url, {
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json",
                    ...(options && options.headers ? options.headers : {})
                },
                ...options
            });
        } catch (error) {
            throw new Error("无法连接登录服务器，请确认后端服务正在运行。");
        }

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.message || "请求失败");
        }

        return data;
    }

    async function loadCurrentUser(force) {
        if (currentUserCache && !force) {
            return currentUserCache;
        }

        try {
            const data = await apiFetch("/api/me");
            currentUserCache = data.loggedIn ? data.user : null;
            return currentUserCache;
        } catch (error) {
            currentUserCache = null;
            return null;
        }
    }

    function hasPermission(user, permissionName) {
        return Boolean(user && Array.isArray(user.permissions) && user.permissions.includes(permissionName));
    }

    function isSystemAdministrator(user) {
        return Boolean(user && user.role === "系统管理员");
    }

    function escapeHtml(value) {
        return String(value || "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function formatMoney(value) {
        return `¥ ${Number(value || 0).toLocaleString("zh-CN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })}`;
    }

    function statusBadgeClass(status) {
        const normalizedStatus = normalizeSalesStatus(status);

        if (normalizedStatus === "已完成") {
            return "badge-success";
        }

        if (normalizedStatus === "已发货（待确认）") {
            return "badge-success";
        }

        return "badge-warning";
    }

    function stockBadgeClass(status) {
        if (status === "充足") {
            return "badge-success";
        }

        if (status === "缺货") {
            return "badge-danger";
        }

        return "badge-warning";
    }

    function normalizeSalesStatus(status) {
        const value = String(status || "").trim();
        const map = {
            "待确认": "待打印",
            "pending": "待打印",
            "已发货": "已发货（待确认）",
            "shipped": "已发货（待确认）",
            "已取消": "已完成"
        };
        const normalized = map[value] || value || "待打印";

        return salesStatusFlow.includes(normalized) ? normalized : "待打印";
    }

    function nextSalesStatus(status) {
        const index = salesStatusFlow.indexOf(normalizeSalesStatus(status));

        if (index < 0 || index >= salesStatusFlow.length - 1) {
            return null;
        }

        return salesStatusFlow[index + 1];
    }

    function normalizeWheelchairType(value, productModel) {
        const type = String(value || "").trim();

        if (type === "manual" || type === "electric") {
            return type;
        }

        const model = String(productModel || "").toLowerCase();

        if (model.includes("jl-e") || model.includes("电动") || model.includes("电池") || model.includes("电控") || model.includes("摇杆") || model.includes("电磁")) {
            return "electric";
        }

        return "manual";
    }

    function goTo(routeName) {
        const target = routes[routeName];

        if (!target || target === "#") {
            return;
        }

        window.location.href = target;
    }

    function resolveRouteTarget(routeName) {
        return routes[routeName] && routes[routeName] !== "#" ? routes[routeName] : routeName || "index.html";
    }

    function goToLogin(nextRoute) {
        window.location.href = `login.html?next=${encodeURIComponent(resolveRouteTarget(nextRoute))}`;
    }

    async function requestProtectedRoute(routeName) {
        const user = await loadCurrentUser(true);

        if (!user) {
            goToLogin(routeName);
            return;
        }

        if (!hasPermission(user, routeName)) {
            alert("您无权访问");
            return;
        }

        goTo(routeName);
    }

    function addLoginStyles() {
        if (document.getElementById("employee-auth-modal-style")) {
            return;
        }

        const style = document.createElement("style");
        style.id = "employee-auth-modal-style";
        style.textContent = `
            .employee-auth-mask {
                position: fixed;
                inset: 0;
                z-index: 9999;
                display: flex;
                align-items: center;
                justify-content: center;
                background: rgba(15, 23, 42, 0.45);
                padding: 20px;
            }

            .employee-auth-modal {
                width: min(420px, 100%);
                background: #ffffff;
                border-radius: 8px;
                box-shadow: 0 20px 50px rgba(15, 23, 42, 0.24);
                padding: 28px;
                color: #1f2937;
            }

            .employee-auth-modal h3 {
                margin-bottom: 8px;
                color: #0056b3;
                font-size: 1.5rem;
            }

            .employee-auth-modal p {
                margin-bottom: 18px;
                color: #666666;
                line-height: 1.6;
            }

            .employee-auth-field {
                margin-bottom: 16px;
            }

            .employee-auth-field label {
                display: block;
                margin-bottom: 8px;
                font-weight: 700;
            }

            .employee-auth-field input {
                width: 100%;
                border: 1px solid #dddddd;
                border-radius: 4px;
                padding: 11px 12px;
                font-size: 1rem;
            }

            .employee-auth-actions {
                display: flex;
                gap: 12px;
                margin-top: 18px;
            }

            .employee-auth-actions button {
                flex: 1;
                border: 0;
                border-radius: 4px;
                padding: 11px 14px;
                cursor: pointer;
                font-weight: 700;
            }

            .employee-auth-submit {
                background: #0056b3;
                color: #ffffff;
            }

            .employee-auth-cancel {
                background: #f3f4f6;
                color: #333333;
            }

            .employee-auth-hint {
                margin-top: 14px;
                font-size: 0.88rem;
                color: #777777;
            }
        `;

        document.head.appendChild(style);
    }

    function closeLoginDialog() {
        const mask = document.querySelector(".employee-auth-mask");

        if (mask) {
            mask.remove();
        }
    }

    function showLoginDialog(nextRoute) {
        addLoginStyles();
        closeLoginDialog();

        const mask = document.createElement("div");
        mask.className = "employee-auth-mask";
        mask.innerHTML = `
            <div class="employee-auth-modal" role="dialog" aria-modal="true" aria-labelledby="employee-auth-title">
                <h3 id="employee-auth-title">员工登录</h3>
                <p>访问员工管理需要先登录，并且账号需要拥有员工管理权限。</p>
                <form class="employee-auth-form">
                    <div class="employee-auth-field">
                        <label for="employee-auth-username">账号</label>
                        <input id="employee-auth-username" name="username" type="text" autocomplete="username" required>
                    </div>
                    <div class="employee-auth-field">
                        <label for="employee-auth-password">密码</label>
                        <input id="employee-auth-password" name="password" type="password" autocomplete="current-password" required>
                    </div>
                    <div class="employee-auth-actions">
                        <button type="submit" class="employee-auth-submit">登录</button>
                        <button type="button" class="employee-auth-cancel">取消</button>
                    </div>
                    <div class="employee-auth-hint">首次运行的账号密码请以 .env 中配置的初始化账号密码为准。</div>
                </form>
            </div>
        `;

        const form = mask.querySelector(".employee-auth-form");
        const cancelButton = mask.querySelector(".employee-auth-cancel");

        cancelButton.addEventListener("click", closeLoginDialog);
        mask.addEventListener("click", function (event) {
            if (event.target === mask) {
                closeLoginDialog();
            }
        });

        form.addEventListener("submit", async function (event) {
            event.preventDefault();

            const username = form.username.value.trim();
            const password = form.password.value;

            try {
                const data = await apiFetch("/api/login", {
                    method: "POST",
                    body: JSON.stringify({ username, password })
                });

                currentUserCache = data.user;
                closeLoginDialog();
                refreshLoginButton();

                if (nextRoute) {
                    await requestProtectedRoute(nextRoute);
                }
            } catch (error) {
                alert(error.message || "登录失败");
            }
        });

        document.body.appendChild(mask);
        mask.querySelector("#auth-username").focus();
    }

    async function refreshLoginButton() {
        const loginButton = document.querySelector("[data-login-trigger]");

        if (!loginButton) {
            return;
        }

        const user = await loadCurrentUser();
        loginButton.textContent = user ? `${user.name} / 退出` : "登录 / 注册";
    }

    function bindLoginTrigger() {
        const loginButton = document.querySelector("[data-login-trigger]");

        if (!loginButton) {
            return;
        }

        loginButton.addEventListener("click", async function (event) {
            event.preventDefault();

            const user = await loadCurrentUser(true);

            if (user) {
                try {
                    await apiFetch("/api/logout", { method: "POST", body: "{}" });
                } catch (error) {
                    // Even if the request fails, clear the local cache so the UI can recover.
                }

                currentUserCache = null;
                await refreshLoginButton();
                alert("已退出登录");
                return;
            }

            goToLogin();
        });
    }

    function bindRoutes() {
        const routeLinks = document.querySelectorAll("[data-route]");

        routeLinks.forEach(function (link) {
            link.addEventListener("click", async function (event) {
                const routeName = link.dataset.route;

                if (!routes[routeName] || routes[routeName] === "#") {
                    return;
                }

                event.preventDefault();

                if (routeName === "employee") {
                    await requestProtectedRoute(routeName);
                    return;
                }

                goTo(routeName);
            });
        });
    }

    async function guardEmployeePage() {
        const pageName = decodeURIComponent(window.location.pathname.split("/").pop() || "");

        if (pageName !== "staff.html") {
            return;
        }

        const user = await loadCurrentUser(true);

        if (!user) {
            window.location.href = `login.html?next=${encodeURIComponent("staff.html")}`;
            return;
        }

        if (!hasPermission(user, "employee")) {
            alert("您无权访问");
            window.location.href = "index.html";
            return;
        }

        const userText = document.querySelector(".user-info span");
        const avatar = document.querySelector(".avatar");

        if (userText) {
            userText.textContent = `欢迎回来，${user.name} (${user.department})`;
        }

        if (avatar) {
            avatar.textContent = user.name.slice(0, 1);
        }
    }

    function bindLogoutButton() {
        const logoutButton = document.querySelector(".logout-btn");

        if (!logoutButton) {
            return;
        }

        logoutButton.addEventListener("click", async function () {
            try {
                await apiFetch("/api/logout", { method: "POST", body: "{}" });
            } catch (error) {
                // Redirect anyway; the server will require login next time.
            }

            currentUserCache = null;
            window.location.href = "index.html";
        });
    }

    function getSalesQuery() {
        const form = document.querySelector("[data-sales-filter]");
        const params = new URLSearchParams();

        if (!form) {
            return params;
        }

        ["startDate", "endDate", "customer", "customerType", "product", "remark", "status", "wheelchairType"].forEach(function (name) {
            if (!form.elements[name]) {
                return;
            }

            const value = form.elements[name].value.trim();

            if (value) {
                params.set(name, value);
            }
        });

        if (currentSalesWheelchairType) {
            params.set("wheelchairType", currentSalesWheelchairType);
        }

        return params;
    }

    function salesMessage(text) {
        const message = document.querySelector("[data-sales-message]");

        if (message) {
            message.textContent = text || "";
        }
    }

    function renderSalesOrders(orders) {
        const list = document.querySelector("[data-sales-list]");
        const checkAll = document.querySelector("[data-sales-check-all]");

        if (!list) {
            return;
        }

        if (checkAll) {
            checkAll.checked = false;
        }

        if (!orders.length) {
            list.innerHTML = '<tr><td colspan="10">没有符合条件的销售单</td></tr>';
            salesMessage("共 0 条记录");
            return;
        }

        list.innerHTML = orders.map(function (order) {
            const status = normalizeSalesStatus(order.status);
            const nextStatus = nextSalesStatus(status);
            const wheelchairType = normalizeWheelchairType(order.wheelchairType, order.productModel);
            const statusContent = nextStatus
                ? `<button class="badge ${statusBadgeClass(status)} status-action" data-sales-next-status="${escapeHtml(order.id)}" title="点击后变为：${escapeHtml(nextStatus)}">${escapeHtml(status)}</button>`
                : `<span class="badge ${statusBadgeClass(status)}">${escapeHtml(status)}</span>`;

            return `
                <tr>
                    <td class="checkbox-cell"><input type="checkbox" data-sales-check value="${escapeHtml(order.id)}"></td>
                    <td>${escapeHtml(order.orderNo)}</td>
                    <td>${escapeHtml(order.orderDate)} ${escapeHtml(order.orderTime)}</td>
                    <td>
                        <strong>${escapeHtml(order.customerName)}</strong><br>
                        <span style="color:#64748b;">${escapeHtml(order.customerPhone || order.customerType)}</span>
                    </td>
                    <td>${escapeHtml(order.customerType || "-")}</td>
                    <td>${escapeHtml(order.productModel)}<br><span style="color:#64748b;">${escapeHtml(salesTypeLabels[wheelchairType])}</span></td>
                    <td>${escapeHtml(order.quantity)}</td>
                    <td>${formatMoney(order.amount)}</td>
                    <td>${statusContent}</td>
                    <td class="sales-remark-cell">${escapeHtml(order.remark || "-")}</td>
                </tr>
            `;
        }).join("");

        salesMessage(`共 ${orders.length} 条记录，可勾选后导出`);
    }

    async function loadSalesOrders() {
        const list = document.querySelector("[data-sales-list]");

        if (!list) {
            return;
        }

        try {
            const query = getSalesQuery();
            const suffix = query.toString() ? `?${query.toString()}` : "";
            const data = await apiFetch(`/api/sales-orders${suffix}`);
            salesOrdersCache = data.orders || [];
            renderSalesOrders(salesOrdersCache);
        } catch (error) {
            list.innerHTML = '<tr><td colspan="10">销售单加载失败</td></tr>';
            salesMessage(error.message || "销售单加载失败");
        }
    }

    function closeSalesModal() {
        const modal = document.querySelector("[data-sales-modal]");

        if (modal) {
            modal.classList.remove("active");
        }
    }

    function setDefaultSalesDateTime(form) {
        const now = new Date();
        const date = now.toISOString().slice(0, 10);
        const time = now.toTimeString().slice(0, 5);

        form.elements.orderDate.value = date;
        form.elements.orderTime.value = time;
    }

    function normalizeSalesCustomerType(value) {
        if (value === "经销商" || value === "网站客户") {
            return value;
        }

        return "客户";
    }

    function isLikelyCustomerName(value) {
        const name = String(value || "").trim();
        const addressWords = /(省|市|区|县|路|街|道|号|弄|巷|楼|层|室|栋|单元|小区|大厦|公寓|园|镇|乡|村|院|店|公司|医院|科技|浙江|广东|江苏|上海|北京|天津|重庆|河北|河南|山东|山西|辽宁|吉林|黑龙江|安徽|福建|江西|湖北|湖南|四川|贵州|云南|陕西|甘肃|青海|海南|内蒙古|广西|西藏|宁夏|新疆|香港|澳门|台湾)/;
        const fieldWords = /(收货|收件|联系人|客户|姓名|电话|手机|地址|需求|需要|购买|发票|物流|备注)/;

        return /^[\u4e00-\u9fa5]{2,4}$/.test(name) && !addressWords.test(name) && !fieldWords.test(name);
    }

    function pickNameFromText(value) {
        const text = String(value || "");
        const candidates = text.match(/[\u4e00-\u9fa5]{2,4}/g) || [];

        for (let index = candidates.length - 1; index >= 0; index -= 1) {
            const candidate = candidates[index];

            if (isLikelyCustomerName(candidate)) {
                return candidate;
            }
        }

        return "";
    }

    function normalizeMainlandPhone(value) {
        const digits = String(value || "").replace(/\D/g, "");

        if (digits.length === 13 && digits.startsWith("86")) {
            return digits.slice(2);
        }

        if (digits.length === 11) {
            return digits;
        }

        return "";
    }

    function parseCustomerNameAndPhone(rawText) {
        const text = String(rawText || "").replace(/\r/g, "\n").trim();
        const result = { name: "", phone: "" };

        if (!text) {
            return result;
        }

        const phoneMatch = text.match(/(?:\+?86[-\s]?)?1[3-9]\d{9}/);

        if (phoneMatch) {
            result.phone = normalizeMainlandPhone(phoneMatch[0]);
        }

        const keywordPattern = /(客户姓名|收货人|联系人|收件人|姓名|客户)\s*[:：]?\s*([\u4e00-\u9fa5]{2,4})/g;
        let keywordMatch;

        while ((keywordMatch = keywordPattern.exec(text)) !== null) {
            const candidate = keywordMatch[2];

            if (isLikelyCustomerName(candidate)) {
                result.name = candidate;
                break;
            }
        }

        if (!result.name && phoneMatch) {
            result.name = pickNameFromText(text.slice(0, phoneMatch.index));
        }

        if (!result.name) {
            const startMatch = text.match(/^[^\u4e00-\u9fa5]*([\u4e00-\u9fa5]{2,4})/);

            if (startMatch && isLikelyCustomerName(startMatch[1])) {
                result.name = startMatch[1];
            }
        }

        return result;
    }

    function updateSalesSmartRecognitionVisibility(form) {
        const panel = form ? form.querySelector("[data-sales-smart-recognition]") : null;

        if (!panel || !form || !form.elements.customerType) {
            return;
        }

        panel.hidden = normalizeSalesCustomerType(form.elements.customerType.value) !== "网站客户";
    }

    function applyRecognizedSalesCustomer(form, parsed) {
        const name = parsed && parsed.name ? parsed.name : "";
        const phone = parsed && parsed.phone ? parsed.phone : "";

        if (!phone) {
            alert("未识别到手机号，请手动检查。");
        }

        if (!name) {
            alert("未识别到客户名称，请手动检查。");
        }

        if (!name && !phone) {
            return;
        }

        const hasExistingName = Boolean(name && form.elements.customerName.value.trim() && form.elements.customerName.value.trim() !== name);
        const hasExistingPhone = Boolean(phone && form.elements.customerPhone.value.trim() && form.elements.customerPhone.value.trim() !== phone);

        if ((hasExistingName || hasExistingPhone) && !window.confirm("当前已有客户信息，是否使用识别结果覆盖？")) {
            return;
        }

        if (name) {
            form.elements.customerName.value = name;
        }

        if (phone) {
            form.elements.customerPhone.value = phone;
        }

        closeSalesCustomerMenu(form);
    }

    function recognizeSalesSmartCustomer(form) {
        const textArea = form ? form.querySelector("[data-sales-smart-text]") : null;

        if (!form || !textArea) {
            return;
        }

        applyRecognizedSalesCustomer(form, parseCustomerNameAndPhone(textArea.value));
    }

    function salesCustomerKind(customerType) {
        return normalizeSalesCustomerType(customerType) === "经销商" ? "dealer" : "customer";
    }

    function getSalesCustomerDirectoryOptions(customerType) {
        const kind = salesCustomerKind(customerType);

        return loadStoredCustomerDirectory()
            .filter((item) => item.kind === kind)
            .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "zh-CN"));
    }

    function findSalesCustomerDirectoryItem(form) {
        if (!form || !form.elements.customerType || !form.elements.customerName) {
            return null;
        }

        const customerName = form.elements.customerName.value.trim();

        if (!customerName) {
            return null;
        }

        return getSalesCustomerDirectoryOptions(form.elements.customerType.value)
            .find((item) => item.name === customerName) || null;
    }

    function updateSalesCustomerPhone(form, options) {
        if (!form || !form.elements.customerName || !form.elements.customerPhone) {
            return;
        }

        const matchedItem = findSalesCustomerDirectoryItem(form);

        if (matchedItem) {
            form.elements.customerPhone.value = matchedItem.phone || "";
            return;
        }

        if (options && options.clearWhenMissing) {
            form.elements.customerPhone.value = "";
        }
    }

    function getSalesCustomerMenu(form) {
        return form ? form.querySelector("[data-sales-customer-menu]") : null;
    }

    function getSalesCustomerToggle(form) {
        return form ? form.querySelector("[data-sales-customer-toggle]") : null;
    }

    function closeSalesCustomerMenu(form) {
        const menu = getSalesCustomerMenu(form);
        const toggle = getSalesCustomerToggle(form);

        if (menu) {
            menu.classList.remove("active");
        }

        if (toggle) {
            toggle.setAttribute("aria-expanded", "false");
        }
    }

    function renderSalesCustomerMenu(form) {
        const menu = getSalesCustomerMenu(form);

        if (!menu || !form || !form.elements.customerType) {
            return;
        }

        const customerType = normalizeSalesCustomerType(form.elements.customerType.value);
        const options = getSalesCustomerDirectoryOptions(customerType);

        menu.innerHTML = "";

        if (!options.length) {
            const empty = document.createElement("div");
            empty.className = "customer-combo__empty";
            empty.textContent = customerType === "经销商" ? "暂无经销商资料" : "暂无客户资料";
            menu.appendChild(empty);
            return;
        }

        options.forEach(function (item) {
            const button = document.createElement("button");
            const name = document.createElement("strong");
            const detail = document.createElement("span");

            button.type = "button";
            button.className = "customer-combo__option";
            button.dataset.customerName = item.name || "";
            button.dataset.customerPhone = item.phone || "";
            name.textContent = item.name || "";
            detail.textContent = [item.contact, item.phone].filter(Boolean).join(" ");

            button.appendChild(name);
            button.appendChild(detail);
            menu.appendChild(button);
        });
    }

    function toggleSalesCustomerMenu(form) {
        const menu = getSalesCustomerMenu(form);
        const toggle = getSalesCustomerToggle(form);

        if (!menu) {
            return;
        }

        const shouldOpen = !menu.classList.contains("active");

        if (shouldOpen) {
            renderSalesCustomerMenu(form);
            menu.classList.add("active");
            if (toggle) {
                toggle.setAttribute("aria-expanded", "true");
            }
            return;
        }

        closeSalesCustomerMenu(form);
    }

    function populateSalesCustomerSelect(form, selectedName, selectedPhone) {
        if (!form || !form.elements.customerType || !form.elements.customerName) {
            return;
        }

        const customerType = normalizeSalesCustomerType(form.elements.customerType.value);
        const input = form.elements.customerName;
        const oldName = String(selectedName || "").trim();
        const oldPhone = String(selectedPhone || "").trim();

        form.elements.customerType.value = customerType;
        input.value = oldName;
        form.elements.customerPhone.value = oldPhone;
        renderSalesCustomerMenu(form);
        closeSalesCustomerMenu(form);
        updateSalesCustomerPhone(form);
        updateSalesSmartRecognitionVisibility(form);
    }

    async function loadSalesProductModelOptions(wheelchairType) {
        const type = normalizeWheelchairType(wheelchairType, "");
        const query = new URLSearchParams({ wheelchairType: type });
        const data = await apiFetch(`/api/finished-models?${query.toString()}`);

        return data.models || [];
    }

    function populateSalesProductModelSelect(form, models, wheelchairType, selectedModel) {
        const select = form && form.elements.productModel;

        if (!select) {
            return;
        }

        const type = normalizeWheelchairType(wheelchairType, selectedModel);
        const selectedValue = String(selectedModel || "").trim();
        const label = salesTypeLabels[type] || "轮椅";
        const hasSelectedValue = selectedValue && models.some((item) => item.model === selectedValue);

        select.innerHTML = "";

        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = models.length ? "请选择产品型号" : `暂无${label}成品型号`;
        select.appendChild(placeholder);

        if (selectedValue && !hasSelectedValue) {
            const legacyOption = document.createElement("option");

            legacyOption.value = selectedValue;
            legacyOption.textContent = `${selectedValue}（原销售单型号）`;
            select.appendChild(legacyOption);
        }

        models.forEach(function (item) {
            const option = document.createElement("option");

            option.value = item.model || "";
            option.textContent = item.model || "";
            select.appendChild(option);
        });

        select.value = selectedValue || "";
    }

    async function prepareSalesProductModelSelect(form, wheelchairType, selectedModel) {
        const select = form && form.elements.productModel;

        if (!select) {
            return;
        }

        const type = normalizeWheelchairType(wheelchairType, selectedModel);
        const label = salesTypeLabels[type] || "轮椅";

        select.innerHTML = '<option value="">正在加载产品型号...</option>';
        select.value = "";

        try {
            const models = await loadSalesProductModelOptions(type);
            populateSalesProductModelSelect(form, models, type, selectedModel);
        } catch (error) {
            select.innerHTML = "";

            const option = document.createElement("option");
            option.value = "";
            option.textContent = `${label}成品型号加载失败`;
            select.appendChild(option);

            throw error;
        }
    }

    async function openSalesModal(order) {
        const modal = document.querySelector("[data-sales-modal]");
        const form = document.querySelector("[data-sales-form]");
        const title = document.querySelector("[data-sales-modal-title]");

        if (!modal || !form) {
            return;
        }

        form.reset();
        const smartText = form.querySelector("[data-sales-smart-text]");

        if (smartText) {
            smartText.value = "";
        }

        if (order) {
            const wheelchairType = normalizeWheelchairType(order.wheelchairType, order.productModel);

            title.textContent = `修改销售单 ${order.orderNo}`;
            form.elements.id.value = order.id;
            form.elements.orderDate.value = order.orderDate;
            form.elements.orderTime.value = order.orderTime;
            form.elements.status.value = normalizeSalesStatus(order.status);
            form.elements.wheelchairType.value = wheelchairType;
            form.elements.customerType.value = normalizeSalesCustomerType(order.customerType);
            populateSalesCustomerSelect(form, order.customerName, order.customerPhone);
            await prepareSalesProductModelSelect(form, wheelchairType, order.productModel);
            form.elements.quantity.value = order.quantity;
            form.elements.unitPrice.value = order.unitPrice;
            form.elements.remark.value = order.remark || "";
        } else {
            const wheelchairType = currentSalesWheelchairType || "manual";

            title.textContent = "创建销售单";
            form.elements.id.value = "";
            form.elements.wheelchairType.value = wheelchairType;
            form.elements.status.value = "待打印";
            form.elements.customerType.value = "客户";
            populateSalesCustomerSelect(form);
            setDefaultSalesDateTime(form);
            await prepareSalesProductModelSelect(form, wheelchairType);
        }

        modal.classList.add("active");
        form.elements.customerName.focus();
    }

    async function showSalesModal(order) {
        try {
            await openSalesModal(order);
        } catch (error) {
            alert(error.message || "产品型号加载失败");
        }
    }

    function selectedSalesOrderIds() {
        return Array.from(document.querySelectorAll("[data-sales-check]:checked")).map((checkbox) => checkbox.value);
    }

    async function exportSelectedSalesOrders() {
        const ids = selectedSalesOrderIds();

        if (!ids.length) {
            alert("请先勾选需要导出的销售单");
            return;
        }

        try {
            const response = await fetch(`/api/sales-orders/export?ids=${encodeURIComponent(ids.join(","))}`, {
                credentials: "same-origin"
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.message || "导出失败");
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");

            link.href = url;
            link.download = `销售单导出-${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            salesMessage(`已导出 ${ids.length} 条销售单`);
        } catch (error) {
            alert(error.message || "导出失败");
        }
    }

    async function deleteSelectedSalesOrders() {
        const ids = selectedSalesOrderIds();

        if (!ids.length) {
            alert("请先勾选需要删除的销售单");
            return;
        }

        if (!window.confirm(`确定删除选中的 ${ids.length} 条销售单吗？删除后不可恢复。`)) {
            return;
        }

        try {
            const data = await apiFetch("/api/sales-orders", {
                method: "DELETE",
                body: JSON.stringify({ ids })
            });

            salesMessage(data.message || `已删除 ${ids.length} 条销售单`);
            await loadSalesOrders();
        } catch (error) {
            alert(error.message || "删除销售单失败");
        }
    }

    function editSelectedSalesOrder() {
        const ids = selectedSalesOrderIds();

        if (!ids.length) {
            alert("请先勾选需要修改的销售单");
            return;
        }

        if (ids.length > 1) {
            alert("一次只能修改一条销售单");
            return;
        }

        const order = salesOrdersCache.find((item) => item.id === ids[0]);

        if (!order) {
            alert("未找到需要修改的销售单，请刷新后重试");
            return;
        }

        showSalesModal(order);
    }

    async function advanceSalesOrderStatus(orderId) {
        const order = salesOrdersCache.find((item) => item.id === orderId);

        if (!order) {
            return;
        }

        const nextStatus = nextSalesStatus(order.status);

        if (!nextStatus) {
            alert("该销售单已完成，不能继续推进状态");
            return;
        }

        try {
            const data = await apiFetch(`/api/sales-orders/${encodeURIComponent(order.id)}`, {
                method: "PUT",
                body: JSON.stringify({
                    ...order,
                    status: nextStatus
                })
            });

            salesMessage(`状态已更新为：${data.order.status}`);
            await loadSalesOrders();
        } catch (error) {
            alert(error.message || "状态更新失败");
        }
    }

    function bindSalesModule() {
        const createButton = document.querySelector("[data-sales-create]");
        const topCreateButton = document.querySelector("[data-sales-create-top]");
        const filterForm = document.querySelector("[data-sales-filter]");
        const resetButton = document.querySelector("[data-sales-reset]");
        const exportButton = document.querySelector("[data-sales-export]");
        const deleteButton = document.querySelector("[data-sales-delete-selected]");
        const editSelectedButton = document.querySelector("[data-sales-edit-selected]");
        const list = document.querySelector("[data-sales-list]");
        const checkAll = document.querySelector("[data-sales-check-all]");
        const form = document.querySelector("[data-sales-form]");
        const modal = document.querySelector("[data-sales-modal]");

        if (createButton) {
            createButton.addEventListener("click", function () {
                showSalesModal();
            });
        }

        if (topCreateButton) {
            topCreateButton.addEventListener("click", function () {
                showSalesModal();
            });
        }

        if (filterForm) {
            filterForm.addEventListener("submit", function (event) {
                event.preventDefault();
                loadSalesOrders();
            });
        }

        if (resetButton && filterForm) {
            resetButton.addEventListener("click", function () {
                filterForm.reset();
                loadSalesOrders();
            });
        }

        if (exportButton) {
            exportButton.addEventListener("click", exportSelectedSalesOrders);
        }

        if (deleteButton) {
            deleteButton.addEventListener("click", deleteSelectedSalesOrders);
        }

        if (editSelectedButton) {
            editSelectedButton.addEventListener("click", editSelectedSalesOrder);
        }

        if (checkAll) {
            checkAll.addEventListener("change", function () {
                document.querySelectorAll("[data-sales-check]").forEach(function (checkbox) {
                    checkbox.checked = checkAll.checked;
                });
            });
        }

        if (list) {
            list.addEventListener("click", async function (event) {
                const statusButton = event.target.closest("[data-sales-next-status]");

                if (statusButton) {
                    advanceSalesOrderStatus(statusButton.dataset.salesNextStatus);
                }
            });
        }

        document.querySelectorAll("[data-sales-close]").forEach(function (button) {
            button.addEventListener("click", closeSalesModal);
        });

        if (modal) {
            modal.addEventListener("click", function (event) {
                if (event.target === modal) {
                    closeSalesModal();
                }
            });
        }

        if (form) {
            if (form.elements.customerType) {
                form.elements.customerType.addEventListener("change", function () {
                    populateSalesCustomerSelect(form);
                    updateSalesSmartRecognitionVisibility(form);
                });
            }

            const smartText = form.querySelector("[data-sales-smart-text]");
            const smartButton = form.querySelector("[data-sales-smart-recognize]");

            if (smartButton) {
                smartButton.addEventListener("click", function () {
                    recognizeSalesSmartCustomer(form);
                });
            }

            if (smartText) {
                smartText.addEventListener("paste", function () {
                    window.setTimeout(function () {
                        if (normalizeSalesCustomerType(form.elements.customerType.value) === "网站客户" && smartText.value.trim()) {
                            recognizeSalesSmartCustomer(form);
                        }
                    }, 0);
                });
            }

            if (form.elements.customerName) {
                form.elements.customerName.addEventListener("click", function () {
                    closeSalesCustomerMenu(form);
                });

                form.elements.customerName.addEventListener("input", function () {
                    closeSalesCustomerMenu(form);
                    updateSalesCustomerPhone(form, { clearWhenMissing: true });
                });

                form.elements.customerName.addEventListener("change", function () {
                    updateSalesCustomerPhone(form);
                });
            }

            const customerToggle = getSalesCustomerToggle(form);
            const customerMenu = getSalesCustomerMenu(form);

            if (customerToggle) {
                customerToggle.addEventListener("click", function (event) {
                    event.preventDefault();
                    event.stopPropagation();
                    toggleSalesCustomerMenu(form);
                });
            }

            if (customerMenu) {
                customerMenu.addEventListener("click", function (event) {
                    const option = event.target.closest("[data-customer-name]");

                    if (!option) {
                        return;
                    }

                    form.elements.customerName.value = option.dataset.customerName || "";
                    form.elements.customerPhone.value = option.dataset.customerPhone || "";
                    closeSalesCustomerMenu(form);
                    form.elements.customerName.focus();
                });
            }

            document.addEventListener("click", function (event) {
                const combo = form.querySelector("[data-sales-customer-combo]");

                if (!combo || !combo.contains(event.target)) {
                    closeSalesCustomerMenu(form);
                }
            });

            form.addEventListener("submit", async function (event) {
                event.preventDefault();

                updateSalesCustomerPhone(form);

                const id = form.elements.id.value;
                const payload = {
                    orderDate: form.elements.orderDate.value,
                    orderTime: form.elements.orderTime.value,
                    status: form.elements.status.value,
                    wheelchairType: form.elements.wheelchairType.value || currentSalesWheelchairType || "manual",
                    customerName: form.elements.customerName.value.trim(),
                    customerPhone: form.elements.customerPhone.value.trim(),
                    customerType: form.elements.customerType.value,
                    productModel: form.elements.productModel.value.trim(),
                    quantity: Number(form.elements.quantity.value),
                    unitPrice: Number(form.elements.unitPrice.value),
                    remark: form.elements.remark.value.trim()
                };

                try {
                    const endpoint = id ? `/api/sales-orders/${encodeURIComponent(id)}` : "/api/sales-orders";
                    const method = id ? "PUT" : "POST";
                    const data = await apiFetch(endpoint, {
                        method,
                        body: JSON.stringify(payload)
                    });

                    closeSalesModal();
                    salesMessage(data.message || "销售单已保存");
                    await loadSalesOrders();
                } catch (error) {
                    alert(error.message || "销售单保存失败");
                }
            });
        }
    }

    function getPartsQuery() {
        const form = document.querySelector("[data-parts-filter]");
        const params = new URLSearchParams();

        if (!form) {
            return params;
        }

        ["keyword", "category", "status", "wheelchairType"].forEach(function (name) {
            if (!form.elements[name]) {
                return;
            }

            const value = form.elements[name].value.trim();

            if (value) {
                params.set(name, value);
            }
        });

        if (currentPartsWheelchairType) {
            params.set("wheelchairType", currentPartsWheelchairType);
        }

        return params;
    }

    function partsMessage(text) {
        const message = document.querySelector("[data-parts-message]");

        if (message) {
            message.textContent = text || "";
        }
    }

    function renderParts(parts) {
        const list = document.querySelector("[data-parts-list]");
        const checkAll = document.querySelector("[data-parts-check-all]");

        if (!list) {
            return;
        }

        if (checkAll) {
            checkAll.checked = false;
        }

        if (!parts.length) {
            list.innerHTML = '<tr><td colspan="10">没有符合条件的配件</td></tr>';
            partsMessage("共 0 条记录");
            return;
        }

        list.innerHTML = parts.map(function (part) {
            const wheelchairType = normalizeWheelchairType(part.wheelchairType, `${part.name || ""} ${part.remark || ""} ${part.category || ""}`);

            return `
                <tr>
                    <td class="checkbox-cell"><input type="checkbox" data-parts-check value="${escapeHtml(part.id)}"></td>
                    <td>${escapeHtml(part.partNo)}</td>
                    <td><strong>${escapeHtml(part.name)}</strong><br><span style="color:#64748b;">${escapeHtml(salesTypeLabels[wheelchairType])} · ${escapeHtml(part.remark)}</span></td>
                    <td>${escapeHtml(part.category)}</td>
                    <td>${escapeHtml(part.currentStock)} ${escapeHtml(part.unit)}</td>
                    <td>${escapeHtml(part.safetyStock)} ${escapeHtml(part.unit)}</td>
                    <td><span class="badge ${stockBadgeClass(part.status)}">${escapeHtml(part.status)}</span></td>
                    <td>${escapeHtml(part.location)}</td>
                    <td>${escapeHtml(part.supplier)}</td>
                    <td>
                        <span class="action-link" data-part-adjust="${escapeHtml(part.id)}" data-adjust-type="in">入库</span>
                        <span style="color:#cbd5e1;"> / </span>
                        <span class="action-link" data-part-adjust="${escapeHtml(part.id)}" data-adjust-type="out">出库</span>
                        <span style="color:#cbd5e1;"> / </span>
                        <span class="action-link" data-part-edit="${escapeHtml(part.id)}">修改</span>
                    </td>
                </tr>
            `;
        }).join("");

        const lowCount = parts.filter((part) => part.status !== "充足").length;
        partsMessage(`共 ${parts.length} 条记录，${lowCount} 项需要关注`);
    }

    async function loadParts() {
        const list = document.querySelector("[data-parts-list]");

        if (!list) {
            return;
        }

        try {
            const query = getPartsQuery();
            const suffix = query.toString() ? `?${query.toString()}` : "";
            const data = await apiFetch(`/api/parts${suffix}`);
            partsCache = data.parts || [];
            renderParts(partsCache);
        } catch (error) {
            list.innerHTML = '<tr><td colspan="10">配件库存加载失败</td></tr>';
            partsMessage(error.message || "配件库存加载失败");
        }
    }

    function closePartModal() {
        const modal = document.querySelector("[data-part-modal]");

        if (modal) {
            modal.classList.remove("active");
        }
    }

    function getPartSupplierOptions() {
        return loadStoredCustomerDirectory()
            .filter((item) => item.kind === "sender")
            .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "zh-CN"));
    }

    function getPartSupplierMenu(form) {
        return form ? form.querySelector("[data-part-supplier-menu]") : null;
    }

    function getPartSupplierToggle(form) {
        return form ? form.querySelector("[data-part-supplier-toggle]") : null;
    }

    function closePartSupplierMenu(form) {
        const menu = getPartSupplierMenu(form);
        const toggle = getPartSupplierToggle(form);

        if (menu) {
            menu.classList.remove("active");
        }

        if (toggle) {
            toggle.setAttribute("aria-expanded", "false");
        }
    }

    function renderPartSupplierMenu(form) {
        const menu = getPartSupplierMenu(form);

        if (!menu) {
            return;
        }

        const suppliers = getPartSupplierOptions();

        menu.innerHTML = "";

        if (!suppliers.length) {
            const empty = document.createElement("div");
            empty.className = "customer-combo__empty";
            empty.textContent = "暂无供应方资料";
            menu.appendChild(empty);
            return;
        }

        suppliers.forEach(function (item) {
            const button = document.createElement("button");
            const name = document.createElement("strong");
            const detail = document.createElement("span");

            button.type = "button";
            button.className = "customer-combo__option";
            button.dataset.supplierName = item.name || "";
            name.textContent = item.name || "";
            detail.textContent = [item.contact, item.phone, item.label].filter(Boolean).join(" ");

            button.appendChild(name);
            button.appendChild(detail);
            menu.appendChild(button);
        });
    }

    function togglePartSupplierMenu(form) {
        const menu = getPartSupplierMenu(form);
        const toggle = getPartSupplierToggle(form);

        if (!menu) {
            return;
        }

        const shouldOpen = !menu.classList.contains("active");

        if (shouldOpen) {
            renderPartSupplierMenu(form);
            menu.classList.add("active");
            if (toggle) {
                toggle.setAttribute("aria-expanded", "true");
            }
            return;
        }

        closePartSupplierMenu(form);
    }

    function populatePartSupplierInput(form, supplierName) {
        if (!form || !form.elements.supplier) {
            return;
        }

        form.elements.supplier.value = String(supplierName || "").trim();
        renderPartSupplierMenu(form);
        closePartSupplierMenu(form);
    }

    function openPartModal(part) {
        const modal = document.querySelector("[data-part-modal]");
        const form = document.querySelector("[data-part-form]");
        const title = document.querySelector("[data-part-modal-title]");

        if (!modal || !form) {
            return;
        }

        form.reset();

        if (part) {
            title.textContent = `修改配件 ${part.partNo}`;
            form.elements.id.value = part.id;
            form.elements.wheelchairType.value = normalizeWheelchairType(part.wheelchairType, `${part.name || ""} ${part.remark || ""} ${part.category || ""}`);
            form.elements.partNo.value = part.partNo;
            form.elements.name.value = part.name;
            form.elements.category.value = part.category;
            form.elements.currentStock.value = part.currentStock;
            form.elements.safetyStock.value = part.safetyStock;
            form.elements.unit.value = part.unit;
            form.elements.location.value = part.location || "";
            populatePartSupplierInput(form, part.supplier || "");
            form.elements.remark.value = part.remark || "";
        } else {
            title.textContent = "新增配件";
            form.elements.id.value = "";
            form.elements.wheelchairType.value = currentPartsWheelchairType || "manual";
            form.elements.category.value = "电池电控";
            form.elements.currentStock.value = 0;
            form.elements.safetyStock.value = 0;
            form.elements.unit.value = "个";
            populatePartSupplierInput(form);
        }

        modal.classList.add("active");
        form.elements.partNo.focus();
    }

    function closeStockAdjustModal() {
        const modal = document.querySelector("[data-stock-adjust-modal]");

        if (modal) {
            modal.classList.remove("active");
        }
    }

    function openStockAdjustModal(part, type) {
        const modal = document.querySelector("[data-stock-adjust-modal]");
        const form = document.querySelector("[data-stock-adjust-form]");
        const title = document.querySelector("[data-stock-adjust-title]");

        if (!modal || !form || !part) {
            return;
        }

        form.reset();
        form.elements.id.value = part.id;
        form.elements.type.value = type || "in";
        form.elements.quantity.value = 1;

        if (title) {
            title.textContent = `${type === "out" ? "出库" : "入库"}：${part.name}`;
        }

        modal.classList.add("active");
        form.elements.quantity.focus();
    }

    async function exportParts() {
        try {
            const query = getPartsQuery();
            const suffix = query.toString() ? `?${query.toString()}` : "";
            const response = await fetch(`/api/parts/export${suffix}`, {
                credentials: "same-origin"
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.message || "导出失败");
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");

            link.href = url;
            link.download = `配件库存导出-${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            partsMessage("库存表已导出");
        } catch (error) {
            alert(error.message || "导出失败");
        }
    }

    function selectedPartIds() {
        return Array.from(document.querySelectorAll("[data-parts-check]:checked")).map((checkbox) => checkbox.value);
    }

    async function deleteSelectedParts() {
        const ids = selectedPartIds();

        if (!ids.length) {
            alert("请先勾选需要删除的配件");
            return;
        }

        if (!window.confirm(`确定删除选中的 ${ids.length} 条配件吗？删除后不可恢复。`)) {
            return;
        }

        try {
            const data = await apiFetch("/api/parts", {
                method: "DELETE",
                body: JSON.stringify({ ids })
            });

            partsMessage(data.message || `已删除 ${ids.length} 条配件`);
            await loadParts();
        } catch (error) {
            alert(error.message || "删除配件失败");
        }
    }

    function bindWarehouseModule() {
        const createButton = document.querySelector("[data-part-create]");
        const createTopButton = document.querySelector("[data-part-create-top]");
        const filterForm = document.querySelector("[data-parts-filter]");
        const resetButton = document.querySelector("[data-parts-reset]");
        const exportButton = document.querySelector("[data-parts-export]");
        const deleteButton = document.querySelector("[data-parts-delete-selected]");
        const list = document.querySelector("[data-parts-list]");
        const checkAll = document.querySelector("[data-parts-check-all]");
        const partForm = document.querySelector("[data-part-form]");
        const adjustForm = document.querySelector("[data-stock-adjust-form]");
        const partModal = document.querySelector("[data-part-modal]");
        const adjustModal = document.querySelector("[data-stock-adjust-modal]");

        [createButton, createTopButton].forEach(function (button) {
            if (button) {
                button.addEventListener("click", function () {
                    openPartModal();
                });
            }
        });

        if (filterForm) {
            filterForm.addEventListener("submit", function (event) {
                event.preventDefault();
                loadParts();
            });
        }

        if (resetButton && filterForm) {
            resetButton.addEventListener("click", function () {
                filterForm.reset();
                loadParts();
            });
        }

        if (exportButton) {
            exportButton.addEventListener("click", exportParts);
        }

        if (deleteButton) {
            deleteButton.addEventListener("click", deleteSelectedParts);
        }

        if (checkAll) {
            checkAll.addEventListener("change", function () {
                document.querySelectorAll("[data-parts-check]").forEach(function (checkbox) {
                    checkbox.checked = checkAll.checked;
                });
            });
        }

        if (list) {
            list.addEventListener("click", function (event) {
                const editButton = event.target.closest("[data-part-edit]");
                const adjustButton = event.target.closest("[data-part-adjust]");

                if (editButton) {
                    const part = partsCache.find((item) => item.id === editButton.dataset.partEdit);

                    if (part) {
                        openPartModal(part);
                    }

                    return;
                }

                if (adjustButton) {
                    const part = partsCache.find((item) => item.id === adjustButton.dataset.partAdjust);

                    if (part) {
                        openStockAdjustModal(part, adjustButton.dataset.adjustType);
                    }
                }
            });
        }

        document.querySelectorAll("[data-part-close]").forEach(function (button) {
            button.addEventListener("click", closePartModal);
        });

        document.querySelectorAll("[data-stock-adjust-close]").forEach(function (button) {
            button.addEventListener("click", closeStockAdjustModal);
        });

        if (partModal) {
            partModal.addEventListener("click", function (event) {
                if (event.target === partModal) {
                    closePartModal();
                }
            });
        }

        if (adjustModal) {
            adjustModal.addEventListener("click", function (event) {
                if (event.target === adjustModal) {
                    closeStockAdjustModal();
                }
            });
        }

        if (partForm) {
            if (partForm.elements.supplier) {
                partForm.elements.supplier.addEventListener("click", function () {
                    closePartSupplierMenu(partForm);
                });

                partForm.elements.supplier.addEventListener("input", function () {
                    closePartSupplierMenu(partForm);
                });
            }

            const supplierToggle = getPartSupplierToggle(partForm);
            const supplierMenu = getPartSupplierMenu(partForm);

            if (supplierToggle) {
                supplierToggle.addEventListener("click", function (event) {
                    event.preventDefault();
                    event.stopPropagation();
                    togglePartSupplierMenu(partForm);
                });
            }

            if (supplierMenu) {
                supplierMenu.addEventListener("click", function (event) {
                    const option = event.target.closest("[data-supplier-name]");

                    if (!option) {
                        return;
                    }

                    partForm.elements.supplier.value = option.dataset.supplierName || "";
                    closePartSupplierMenu(partForm);
                    partForm.elements.supplier.focus();
                });
            }

            document.addEventListener("click", function (event) {
                const combo = partForm.querySelector("[data-part-supplier-combo]");

                if (!combo || !combo.contains(event.target)) {
                    closePartSupplierMenu(partForm);
                }
            });

            partForm.addEventListener("submit", async function (event) {
                event.preventDefault();

                const id = partForm.elements.id.value;
                const payload = {
                    partNo: partForm.elements.partNo.value.trim(),
                    name: partForm.elements.name.value.trim(),
                    wheelchairType: partForm.elements.wheelchairType.value || currentPartsWheelchairType || "manual",
                    category: partForm.elements.category.value,
                    currentStock: Number(partForm.elements.currentStock.value),
                    safetyStock: Number(partForm.elements.safetyStock.value),
                    unit: partForm.elements.unit.value.trim(),
                    location: partForm.elements.location.value.trim(),
                    supplier: partForm.elements.supplier.value.trim(),
                    remark: partForm.elements.remark.value.trim()
                };

                try {
                    const endpoint = id ? `/api/parts/${encodeURIComponent(id)}` : "/api/parts";
                    const method = id ? "PUT" : "POST";
                    const data = await apiFetch(endpoint, {
                        method,
                        body: JSON.stringify(payload)
                    });

                    closePartModal();
                    partsMessage(data.message || "配件已保存");
                    await loadParts();
                } catch (error) {
                    alert(error.message || "配件保存失败");
                }
            });
        }

        if (adjustForm) {
            adjustForm.addEventListener("submit", async function (event) {
                event.preventDefault();

                const id = adjustForm.elements.id.value;
                const isFinishedGood = id.startsWith("finished:");
                const realId = isFinishedGood ? id.slice("finished:".length) : id;
                const payload = {
                    type: adjustForm.elements.type.value,
                    quantity: Number(adjustForm.elements.quantity.value),
                    remark: adjustForm.elements.remark.value.trim()
                };

                try {
                    const endpoint = isFinishedGood
                        ? `/api/finished-goods/${encodeURIComponent(realId)}/adjust`
                        : `/api/parts/${encodeURIComponent(realId)}/adjust`;
                    const data = await apiFetch(endpoint, {
                        method: "POST",
                        body: JSON.stringify(payload)
                    });

                    closeStockAdjustModal();
                    if (isFinishedGood) {
                        finishedMessage(data.message || "成品库存已调整");
                        await loadFinishedGoods();
                    } else {
                        partsMessage(data.message || "库存已调整");
                        await loadParts();
                    }
                } catch (error) {
                    alert(error.message || "库存调整失败");
                }
            });
        }
    }

    function getFinishedQuery() {
        const form = document.querySelector("[data-finished-filter]");
        const params = new URLSearchParams();

        if (!form) {
            return params;
        }

        ["keyword", "category", "status", "wheelchairType"].forEach(function (name) {
            if (!form.elements[name]) {
                return;
            }

            const value = form.elements[name].value.trim();

            if (value) {
                params.set(name, value);
            }
        });

        if (currentFinishedWheelchairType) {
            params.set("wheelchairType", currentFinishedWheelchairType);
        }

        return params;
    }

    function finishedMessage(text) {
        const message = document.querySelector("[data-finished-message]");

        if (message) {
            message.textContent = text || "";
        }
    }

    function getFinishedModelQuery() {
        const params = new URLSearchParams();

        if (currentFinishedWheelchairType) {
            params.set("wheelchairType", currentFinishedWheelchairType);
        }

        return params;
    }

    function finishedModelMessage(text) {
        const message = document.querySelector("[data-finished-model-message]");

        if (message) {
            message.textContent = text || "";
        }
    }

    function renderFinishedModels(models) {
        const list = document.querySelector("[data-finished-model-list]");
        const checkAll = document.querySelector("[data-finished-model-check-all]");

        if (!list) {
            return;
        }

        if (checkAll) {
            checkAll.checked = false;
        }

        if (!models.length) {
            list.innerHTML = '<tr><td colspan="3">暂无成品型号</td></tr>';
            finishedModelMessage("共 0 个型号");
            return;
        }

        list.innerHTML = models.map(function (item) {
            const wheelchairType = normalizeWheelchairType(item.wheelchairType, item.model);

            return `
                <tr>
                    <td class="checkbox-cell"><input type="checkbox" data-finished-model-check value="${escapeHtml(item.id)}"></td>
                    <td>
                        <strong>${escapeHtml(item.model)}</strong><br>
                        <span style="color:#64748b;">${escapeHtml(salesTypeLabels[wheelchairType])}成品型号</span>
                    </td>
                    <td>
                        <span class="action-link" data-finished-model-edit="${escapeHtml(item.id)}">修改</span>
                        <span style="color:#cbd5e1;"> / </span>
                        <span class="action-link danger-link" data-finished-model-delete="${escapeHtml(item.id)}">删除</span>
                    </td>
                </tr>
            `;
        }).join("");

        finishedModelMessage(`共 ${models.length} 个型号`);
    }

    async function loadFinishedModels() {
        const list = document.querySelector("[data-finished-model-list]");

        if (!list) {
            return;
        }

        try {
            const query = getFinishedModelQuery();
            const suffix = query.toString() ? `?${query.toString()}` : "";
            const data = await apiFetch(`/api/finished-models${suffix}`);
            finishedModelsCache = data.models || [];
            renderFinishedModels(finishedModelsCache);
        } catch (error) {
            list.innerHTML = '<tr><td colspan="3">成品型号加载失败</td></tr>';
            finishedModelMessage(error.message || "成品型号加载失败");
        }
    }

    function renderFinishedGoods(goods) {
        const list = document.querySelector("[data-finished-list]");
        const checkAll = document.querySelector("[data-finished-check-all]");

        if (!list) {
            return;
        }

        if (checkAll) {
            checkAll.checked = false;
        }

        if (!goods.length) {
            list.innerHTML = '<tr><td colspan="10">没有符合条件的成品</td></tr>';
            finishedMessage("共 0 条记录");
            return;
        }

        list.innerHTML = goods.map(function (item) {
            const wheelchairType = normalizeWheelchairType(item.wheelchairType, item.model);

            return `
                <tr>
                    <td class="checkbox-cell"><input type="checkbox" data-finished-check value="${escapeHtml(item.id)}"></td>
                    <td>${escapeHtml(item.sku)}</td>
                    <td><strong>${escapeHtml(item.model)}</strong><br><span style="color:#64748b;">${escapeHtml(salesTypeLabels[wheelchairType])} · ${escapeHtml(item.remark)}</span></td>
                    <td>${escapeHtml(item.category)}</td>
                    <td>${escapeHtml(item.currentStock)} ${escapeHtml(item.unit)}</td>
                    <td>${escapeHtml(item.safetyStock)} ${escapeHtml(item.unit)}</td>
                    <td><span class="badge ${stockBadgeClass(item.status)}">${escapeHtml(item.status)}</span></td>
                    <td>${escapeHtml(item.location)}</td>
                    <td>${escapeHtml(item.batchNo)}</td>
                    <td>
                        <span class="action-link" data-finished-adjust="${escapeHtml(item.id)}" data-adjust-type="in">入库</span>
                        <span style="color:#cbd5e1;"> / </span>
                        <span class="action-link" data-finished-adjust="${escapeHtml(item.id)}" data-adjust-type="out">出库</span>
                        <span style="color:#cbd5e1;"> / </span>
                        <span class="action-link" data-finished-edit="${escapeHtml(item.id)}">修改</span>
                    </td>
                </tr>
            `;
        }).join("");

        const lowCount = goods.filter((item) => item.status !== "充足").length;
        finishedMessage(`共 ${goods.length} 条记录，${lowCount} 项需要关注`);
    }

    async function loadFinishedGoods() {
        const list = document.querySelector("[data-finished-list]");

        if (!list) {
            return;
        }

        try {
            const query = getFinishedQuery();
            const suffix = query.toString() ? `?${query.toString()}` : "";
            const data = await apiFetch(`/api/finished-goods${suffix}`);
            finishedGoodsCache = data.goods || [];
            renderFinishedGoods(finishedGoodsCache);
        } catch (error) {
            list.innerHTML = '<tr><td colspan="10">成品库存加载失败</td></tr>';
            finishedMessage(error.message || "成品库存加载失败");
        }
    }

    function closeFinishedModal() {
        const modal = document.querySelector("[data-finished-modal]");

        if (modal) {
            modal.classList.remove("active");
            modal.classList.remove("simple-model-mode");
        }
    }

    function openFinishedModal(item, options) {
        const modal = document.querySelector("[data-finished-modal]");
        const form = document.querySelector("[data-finished-form]");
        const title = document.querySelector("[data-finished-modal-title]");
        const submitButton = form ? form.querySelector('button[type="submit"]') : null;

        if (!modal || !form) {
            return;
        }

        form.reset();
        const simpleModelMode = Boolean(options && options.simpleModel);
        modal.classList.toggle("simple-model-mode", simpleModelMode);

        if (simpleModelMode) {
            const finishedType = normalizeWheelchairType(item ? item.wheelchairType : currentFinishedWheelchairType || "manual", item ? item.model : "");
            title.textContent = item ? `修改${salesTypeLabels[finishedType]}成品型号` : `新增${salesTypeLabels[finishedType]}成品`;
            if (submitButton) {
                submitButton.textContent = "保存型号";
            }
            form.elements.id.value = item ? item.id : "";
            form.elements.sku.value = "";
            form.elements.sku.required = false;
            form.elements.model.value = item ? item.model : "";
            form.elements.wheelchairType.value = finishedType;
            form.elements.category.value = finishedType === "electric" ? "电动折叠" : "手动折叠";
            form.elements.currentStock.value = 0;
            form.elements.safetyStock.value = 0;
            form.elements.unit.value = "台";
            form.elements.location.value = "";
            form.elements.batchNo.value = "";
            form.elements.remark.value = "";
        } else if (item) {
            title.textContent = `修改成品 ${item.sku}`;
            if (submitButton) {
                submitButton.textContent = "保存成品";
            }
            form.elements.id.value = item.id;
            form.elements.wheelchairType.value = normalizeWheelchairType(item.wheelchairType, item.model);
            form.elements.sku.value = item.sku;
            form.elements.sku.required = true;
            form.elements.model.value = item.model;
            form.elements.category.value = item.category;
            form.elements.currentStock.value = item.currentStock;
            form.elements.safetyStock.value = item.safetyStock;
            form.elements.unit.value = item.unit;
            form.elements.location.value = item.location || "";
            form.elements.batchNo.value = item.batchNo || "";
            form.elements.remark.value = item.remark || "";
        } else {
            const finishedType = currentFinishedWheelchairType || "manual";
            title.textContent = simpleModelMode ? `新增${salesTypeLabels[finishedType]}成品` : "新增成品";
            if (submitButton) {
                submitButton.textContent = simpleModelMode ? "保存型号" : "保存成品";
            }
            form.elements.id.value = "";
            form.elements.sku.value = "";
            form.elements.sku.required = !simpleModelMode;
            form.elements.wheelchairType.value = finishedType;
            form.elements.category.value = finishedType === "electric" ? "电动折叠" : "手动折叠";
            form.elements.currentStock.value = 0;
            form.elements.safetyStock.value = 0;
            form.elements.unit.value = "台";
            form.elements.location.value = "";
            form.elements.batchNo.value = "";
            form.elements.remark.value = "";
        }

        modal.classList.add("active");
        if (simpleModelMode) {
            form.elements.model.focus();
        } else {
            form.elements.sku.focus();
        }
    }

    async function exportFinishedGoods() {
        try {
            const query = getFinishedQuery();
            const suffix = query.toString() ? `?${query.toString()}` : "";
            const response = await fetch(`/api/finished-goods/export${suffix}`, {
                credentials: "same-origin"
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.message || "导出失败");
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");

            link.href = url;
            link.download = `成品库存导出-${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            finishedMessage("成品库存表已导出");
        } catch (error) {
            alert(error.message || "导出失败");
        }
    }

    function selectedFinishedModelIds() {
        return Array.from(document.querySelectorAll("[data-finished-model-check]:checked")).map((checkbox) => checkbox.value);
    }

    async function deleteFinishedModels(ids) {
        if (!ids.length) {
            alert("请先勾选需要删除的成品型号");
            return;
        }

        if (!window.confirm(`确定删除选中的 ${ids.length} 个成品型号吗？删除后不可恢复。`)) {
            return;
        }

        try {
            const data = await apiFetch("/api/finished-models", {
                method: "DELETE",
                body: JSON.stringify({ ids })
            });

            finishedModelMessage(data.message || `已删除 ${ids.length} 个成品型号`);
            await loadFinishedModels();
        } catch (error) {
            alert(error.message || "删除成品型号失败");
        }
    }

    function deleteSelectedFinishedModels() {
        return deleteFinishedModels(selectedFinishedModelIds());
    }

    function selectedFinishedGoodIds() {
        return Array.from(document.querySelectorAll("[data-finished-check]:checked")).map((checkbox) => checkbox.value);
    }

    async function deleteSelectedFinishedGoods() {
        const ids = selectedFinishedGoodIds();

        if (!ids.length) {
            alert("请先勾选需要删除的成品");
            return;
        }

        if (!window.confirm(`确定删除选中的 ${ids.length} 条成品吗？删除后不可恢复。`)) {
            return;
        }

        try {
            const data = await apiFetch("/api/finished-goods", {
                method: "DELETE",
                body: JSON.stringify({ ids })
            });

            finishedMessage(data.message || `已删除 ${ids.length} 条成品`);
            await loadFinishedGoods();
        } catch (error) {
            alert(error.message || "删除成品失败");
        }
    }

    function bindFinishedGoodsModule() {
        const createButton = document.querySelector("[data-finished-create]");
        const createTopButton = document.querySelector("[data-finished-create-top]");
        const filterForm = document.querySelector("[data-finished-filter]");
        const resetButton = document.querySelector("[data-finished-reset]");
        const exportButton = document.querySelector("[data-finished-export]");
        const deleteButton = document.querySelector("[data-finished-delete-selected]");
        const modelDeleteButton = document.querySelector("[data-finished-model-delete-selected]");
        const modelList = document.querySelector("[data-finished-model-list]");
        const modelCheckAll = document.querySelector("[data-finished-model-check-all]");
        const list = document.querySelector("[data-finished-list]");
        const checkAll = document.querySelector("[data-finished-check-all]");
        const form = document.querySelector("[data-finished-form]");
        const modal = document.querySelector("[data-finished-modal]");

        if (createButton) {
            createButton.addEventListener("click", function () {
                openFinishedModal();
            });
        }

        if (createTopButton) {
            createTopButton.addEventListener("click", function () {
                openFinishedModal(null, { simpleModel: true });
            });
        }

        if (filterForm) {
            filterForm.addEventListener("submit", function (event) {
                event.preventDefault();
                loadFinishedGoods();
            });
        }

        if (resetButton && filterForm) {
            resetButton.addEventListener("click", function () {
                filterForm.reset();
                loadFinishedGoods();
            });
        }

        if (exportButton) {
            exportButton.addEventListener("click", exportFinishedGoods);
        }

        if (deleteButton) {
            deleteButton.addEventListener("click", deleteSelectedFinishedGoods);
        }

        if (modelDeleteButton) {
            modelDeleteButton.addEventListener("click", deleteSelectedFinishedModels);
        }

        if (modelCheckAll) {
            modelCheckAll.addEventListener("change", function () {
                document.querySelectorAll("[data-finished-model-check]").forEach(function (checkbox) {
                    checkbox.checked = modelCheckAll.checked;
                });
            });
        }

        if (modelList) {
            modelList.addEventListener("click", function (event) {
                const editButton = event.target.closest("[data-finished-model-edit]");
                const deleteModelButton = event.target.closest("[data-finished-model-delete]");

                if (editButton) {
                    const item = finishedModelsCache.find((entry) => entry.id === editButton.dataset.finishedModelEdit);

                    if (item) {
                        openFinishedModal(item, { simpleModel: true });
                    }

                    return;
                }

                if (deleteModelButton) {
                    deleteFinishedModels([deleteModelButton.dataset.finishedModelDelete]);
                }
            });
        }

        if (checkAll) {
            checkAll.addEventListener("change", function () {
                document.querySelectorAll("[data-finished-check]").forEach(function (checkbox) {
                    checkbox.checked = checkAll.checked;
                });
            });
        }

        if (list) {
            list.addEventListener("click", function (event) {
                const editButton = event.target.closest("[data-finished-edit]");
                const adjustButton = event.target.closest("[data-finished-adjust]");

                if (editButton) {
                    const item = finishedGoodsCache.find((entry) => entry.id === editButton.dataset.finishedEdit);

                    if (item) {
                        openFinishedModal(item);
                    }

                    return;
                }

                if (adjustButton) {
                    const item = finishedGoodsCache.find((entry) => entry.id === adjustButton.dataset.finishedAdjust);

                    if (item) {
                        openStockAdjustModal({
                            id: `finished:${item.id}`,
                            name: item.model
                        }, adjustButton.dataset.adjustType);
                    }
                }
            });
        }

        document.querySelectorAll("[data-finished-close]").forEach(function (button) {
            button.addEventListener("click", closeFinishedModal);
        });

        if (modal) {
            modal.addEventListener("click", function (event) {
                if (event.target === modal) {
                    closeFinishedModal();
                }
            });
        }

        if (form) {
            form.addEventListener("submit", async function (event) {
                event.preventDefault();

                const id = form.elements.id.value;
                const simpleModelMode = modal && modal.classList.contains("simple-model-mode");
                const wheelchairType = form.elements.wheelchairType.value || currentFinishedWheelchairType || "manual";

                if (simpleModelMode) {
                    const payload = {
                        model: form.elements.model.value.trim(),
                        wheelchairType
                    };

                    try {
                        const endpoint = id ? `/api/finished-models/${encodeURIComponent(id)}` : "/api/finished-models";
                        const method = id ? "PUT" : "POST";
                        const data = await apiFetch(endpoint, {
                            method,
                            body: JSON.stringify(payload)
                        });

                        closeFinishedModal();
                        finishedModelMessage(data.message || "成品型号已保存");
                        await loadFinishedModels();
                    } catch (error) {
                        alert(error.message || "成品型号保存失败");
                    }

                    return;
                }

                const payload = {
                    sku: form.elements.sku.value.trim(),
                    model: form.elements.model.value.trim(),
                    wheelchairType,
                    category: form.elements.category.value,
                    currentStock: Number(form.elements.currentStock.value),
                    safetyStock: Number(form.elements.safetyStock.value),
                    unit: form.elements.unit.value.trim(),
                    location: form.elements.location.value.trim(),
                    batchNo: form.elements.batchNo.value.trim(),
                    remark: form.elements.remark.value.trim()
                };

                try {
                    const endpoint = id ? `/api/finished-goods/${encodeURIComponent(id)}` : "/api/finished-goods";
                    const method = id ? "PUT" : "POST";
                    const data = await apiFetch(endpoint, {
                        method,
                        body: JSON.stringify(payload)
                    });

                    closeFinishedModal();
                    finishedMessage(data.message || "成品已保存");
                    await loadFinishedGoods();
                } catch (error) {
                    alert(error.message || "成品保存失败");
                }
            });
        }
    }

    const customerDirectoryStorageKey = "staff.customerDirectory.v1";
    const customerDirectoryMeta = {
        customer: {
            itemName: "客户",
            emptyText: "暂无客户资料",
            nameLabel: "客户名称",
            namePlaceholder: "例如 王女士 / 上海长海医院",
            labelLabel: "客户类型",
            labelPlaceholder: "例如 个人客户 / 医院客户",
            addressLabel: "常用地址",
            addressPlaceholder: "客户常用收货地址"
        },
        dealer: {
            itemName: "经销商",
            emptyText: "暂无经销商资料",
            nameLabel: "经销商名称",
            namePlaceholder: "例如 北京瑞康医疗器械店",
            labelLabel: "覆盖区域",
            labelPlaceholder: "例如 华北区域 / 浙江省",
            addressLabel: "结算方式",
            addressPlaceholder: "例如 月结30天 / 现结"
        },
        sender: {
            itemName: "供应方",
            emptyText: "暂无供应方资料",
            nameLabel: "供应方名称",
            namePlaceholder: "例如 常州电池供应商",
            labelLabel: "供应范围",
            labelPlaceholder: "例如 电池配件 / 五金件",
            addressLabel: "地址/结算方式",
            addressPlaceholder: "供应方地址或结算方式"
        }
    };

    function getDefaultCustomerDirectory() {
        return [
            {
                id: "customer-001",
                kind: "customer",
                name: "上海长海医院",
                contact: "采购科",
                phone: "021-55556666",
                label: "医院客户",
                address: "上海市杨浦区长海路",
                status: "启用",
                remark: "优先安排发票和批量配送"
            },
            {
                id: "customer-002",
                kind: "customer",
                name: "王女士",
                contact: "王女士",
                phone: "13800008888",
                label: "个人客户",
                address: "北京市朝阳区",
                status: "待跟进",
                remark: "关注电动轮椅续航"
            },
            {
                id: "dealer-001",
                kind: "dealer",
                name: "北京瑞康医疗器械店",
                contact: "刘经理",
                phone: "010-88886666",
                label: "华北区域",
                address: "月结30天",
                status: "启用",
                remark: "重点经销商"
            },
            {
                id: "dealer-002",
                kind: "dealer",
                name: "宁波康复用品中心",
                contact: "陈经理",
                phone: "0574-66228888",
                label: "浙江区域",
                address: "现结",
                status: "启用",
                remark: "常订手动折叠款"
            },
            {
                id: "sender-001",
                kind: "sender",
                name: "常州电池供应商",
                contact: "周经理",
                phone: "0519-66228888",
                label: "电池配件",
                address: "月结30天",
                status: "启用",
                remark: "常供24V锂电池"
            },
            {
                id: "sender-002",
                kind: "sender",
                name: "宁波五金配件供应商",
                contact: "张经理",
                phone: "0574-88996666",
                label: "五金件",
                address: "现结",
                status: "启用",
                remark: "常供轮组和车架配件"
            }
        ];
    }

    function loadStoredCustomerDirectory() {
        if (customerDirectoryCache.length) {
            return customerDirectoryCache;
        }

        try {
            const raw = window.localStorage.getItem(customerDirectoryStorageKey);

            if (raw) {
                const parsed = JSON.parse(raw);
                customerDirectoryCache = Array.isArray(parsed) ? parsed : [];
                return customerDirectoryCache;
            }
        } catch (error) {
            customerDirectoryCache = [];
        }

        customerDirectoryCache = getDefaultCustomerDirectory();
        saveCustomerDirectory();
        return customerDirectoryCache;
    }

    let customerDirectoryUsesServer = false;

    async function syncCustomerDirectoryFromServer() {
        try {
            const data = await apiFetch("/api/customer-directory");
            customerDirectoryCache = data.items || [];
            customerDirectoryUsesServer = true;
            saveCustomerDirectory();
            return true;
        } catch (error) {
            customerDirectoryUsesServer = false;
            loadStoredCustomerDirectory();
            return false;
        }
    }

    function saveCustomerDirectory() {
        try {
            window.localStorage.setItem(customerDirectoryStorageKey, JSON.stringify(customerDirectoryCache));
        } catch (error) {
            // 本地存储不可用时，当前页面仍可继续临时管理。
        }
    }

    function createCustomerDirectoryId(kind) {
        return `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    }

    function customerDirectoryBadgeClass(status) {
        if (status === "启用") {
            return "badge-success";
        }

        if (status === "停用") {
            return "badge-danger";
        }

        return "badge-warning";
    }

    function customerDirectoryMessage(kind, text) {
        const message = document.querySelector(`[data-directory-message="${kind}"]`);

        if (message) {
            message.textContent = text || "";
        }
    }

    function getFilteredCustomerDirectory(kind) {
        const form = document.querySelector(`[data-directory-filter="${kind}"]`);
        const keyword = form && form.elements.keyword ? form.elements.keyword.value.trim().toLowerCase() : "";
        const status = form && form.elements.status ? form.elements.status.value.trim() : "";

        return loadStoredCustomerDirectory().filter(function (item) {
            if (item.kind !== kind) {
                return false;
            }

            if (status && item.status !== status) {
                return false;
            }

            if (!keyword) {
                return true;
            }

            const haystack = [
                item.name,
                item.contact,
                item.phone,
                item.label,
                item.address,
                item.status,
                item.remark
            ].join(" ").toLowerCase();

            return haystack.includes(keyword);
        });
    }

    function renderCustomerDirectory(kind) {
        const list = document.querySelector(`[data-directory-list="${kind}"]`);
        const meta = customerDirectoryMeta[kind] || customerDirectoryMeta.customer;

        if (!list) {
            return;
        }

        const rows = getFilteredCustomerDirectory(kind);

        if (!rows.length) {
            list.innerHTML = `<tr><td colspan="8">${meta.emptyText}</td></tr>`;
            customerDirectoryMessage(kind, "共 0 条记录");
            return;
        }

        list.innerHTML = rows.map(function (item) {
            const status = item.status || "启用";

            return `
                <tr>
                    <td><strong>${escapeHtml(item.name)}</strong></td>
                    <td>${escapeHtml(item.contact)}</td>
                    <td>${escapeHtml(item.phone)}</td>
                    <td>${escapeHtml(item.label)}</td>
                    <td>${escapeHtml(item.address)}</td>
                    <td><span class="badge ${customerDirectoryBadgeClass(status)}">${escapeHtml(status)}</span></td>
                    <td>${escapeHtml(item.remark)}</td>
                    <td>
                        <span class="action-link" data-directory-kind="${escapeHtml(kind)}" data-directory-edit="${escapeHtml(item.id)}">修改</span>
                        <span class="action-link danger-link" data-directory-kind="${escapeHtml(kind)}" data-directory-delete="${escapeHtml(item.id)}">删除</span>
                    </td>
                </tr>
            `;
        }).join("");

        const total = loadStoredCustomerDirectory().filter((item) => item.kind === kind).length;
        customerDirectoryMessage(kind, `共 ${rows.length} 条记录 / ${total} 条${meta.itemName}资料`);
    }

    function renderAllCustomerDirectories() {
        Object.keys(customerDirectoryMeta).forEach(renderCustomerDirectory);
    }

    function closeCustomerDirectoryModal() {
        const modal = document.querySelector("[data-directory-modal]");

        if (modal) {
            modal.classList.remove("active");
        }
    }

    function openCustomerDirectoryModal(kind, item) {
        const modal = document.querySelector("[data-directory-modal]");
        const form = document.querySelector("[data-directory-form]");
        const title = document.querySelector("[data-directory-modal-title]");
        const meta = customerDirectoryMeta[kind] || customerDirectoryMeta.customer;

        if (!modal || !form) {
            return;
        }

        form.reset();
        form.elements.kind.value = kind;
        form.elements.id.value = item ? item.id : "";
        form.elements.name.value = item ? item.name : "";
        form.elements.contact.value = item ? item.contact : "";
        form.elements.phone.value = item ? item.phone : "";
        form.elements.label.value = item ? item.label : "";
        form.elements.address.value = item ? item.address : "";
        form.elements.status.value = item ? item.status || "启用" : "启用";
        form.elements.remark.value = item ? item.remark || "" : "";

        const nameLabel = document.querySelector("[data-directory-name-label]");
        const labelLabel = document.querySelector("[data-directory-label-label]");
        const addressLabel = document.querySelector("[data-directory-address-label]");

        if (title) {
            title.textContent = item ? `修改${meta.itemName} ${item.name}` : `新增${meta.itemName}`;
        }

        if (nameLabel) {
            nameLabel.textContent = meta.nameLabel;
        }

        if (labelLabel) {
            labelLabel.textContent = meta.labelLabel;
        }

        if (addressLabel) {
            addressLabel.textContent = meta.addressLabel;
        }

        form.elements.name.placeholder = meta.namePlaceholder;
        form.elements.label.placeholder = meta.labelPlaceholder;
        form.elements.address.placeholder = meta.addressPlaceholder;

        modal.classList.add("active");
        form.elements.name.focus();
    }

    function bindCustomerDirectoryModule() {
        const form = document.querySelector("[data-directory-form]");
        const modal = document.querySelector("[data-directory-modal]");

        document.querySelectorAll("[data-directory-create]").forEach(function (button) {
            button.addEventListener("click", function () {
                openCustomerDirectoryModal(button.dataset.directoryCreate || "customer");
            });
        });

        document.querySelectorAll("[data-directory-filter]").forEach(function (filterForm) {
            filterForm.addEventListener("submit", function (event) {
                event.preventDefault();
                renderCustomerDirectory(filterForm.dataset.directoryFilter);
            });
        });

        document.querySelectorAll("[data-directory-reset]").forEach(function (button) {
            button.addEventListener("click", function () {
                const kind = button.dataset.directoryReset;
                const filterForm = document.querySelector(`[data-directory-filter="${kind}"]`);

                if (filterForm) {
                    filterForm.reset();
                }

                renderCustomerDirectory(kind);
            });
        });

        document.querySelectorAll("[data-directory-list]").forEach(function (list) {
            list.addEventListener("click", async function (event) {
                const editButton = event.target.closest("[data-directory-edit]");
                const deleteButton = event.target.closest("[data-directory-delete]");

                if (editButton) {
                    const kind = editButton.dataset.directoryKind;
                    const item = loadStoredCustomerDirectory().find((entry) => entry.id === editButton.dataset.directoryEdit);

                    if (item) {
                        openCustomerDirectoryModal(kind, item);
                    }

                    return;
                }

                if (deleteButton) {
                    const kind = deleteButton.dataset.directoryKind;
                    const meta = customerDirectoryMeta[kind] || customerDirectoryMeta.customer;
                    const item = loadStoredCustomerDirectory().find((entry) => entry.id === deleteButton.dataset.directoryDelete);

                    if (!item) {
                        return;
                    }

                    if (window.confirm(`确定删除${meta.itemName}“${item.name}”吗？`)) {
                        try {
                            if (customerDirectoryUsesServer) {
                                await apiFetch(`/api/customer-directory/${encodeURIComponent(item.id)}`, {
                                    method: "DELETE"
                                });
                            }

                            customerDirectoryCache = loadStoredCustomerDirectory().filter((entry) => entry.id !== item.id);
                            saveCustomerDirectory();
                            renderCustomerDirectory(kind);
                            customerDirectoryMessage(kind, `${meta.itemName}资料已删除`);
                        } catch (error) {
                            alert(error.message || `${meta.itemName}资料删除失败`);
                        }
                    }
                }
            });
        });

        document.querySelectorAll("[data-directory-close]").forEach(function (button) {
            button.addEventListener("click", closeCustomerDirectoryModal);
        });

        if (modal) {
            modal.addEventListener("click", function (event) {
                if (event.target === modal) {
                    closeCustomerDirectoryModal();
                }
            });
        }

        if (form) {
            form.addEventListener("submit", async function (event) {
                event.preventDefault();

                const id = form.elements.id.value;
                const kind = form.elements.kind.value || "customer";
                const meta = customerDirectoryMeta[kind] || customerDirectoryMeta.customer;
                const payload = {
                    id: id || createCustomerDirectoryId(kind),
                    kind,
                    name: form.elements.name.value.trim(),
                    contact: form.elements.contact.value.trim(),
                    phone: form.elements.phone.value.trim(),
                    label: form.elements.label.value.trim(),
                    address: form.elements.address.value.trim(),
                    status: form.elements.status.value,
                    remark: form.elements.remark.value.trim()
                };

                try {
                    customerDirectoryCache = loadStoredCustomerDirectory();

                    if (customerDirectoryUsesServer) {
                        const endpoint = id ? `/api/customer-directory/${encodeURIComponent(id)}` : "/api/customer-directory";
                        const method = id ? "PUT" : "POST";
                        const data = await apiFetch(endpoint, {
                            method,
                            body: JSON.stringify(payload)
                        });
                        const savedItem = data.item || payload;
                        const index = customerDirectoryCache.findIndex((item) => item.id === savedItem.id);

                        if (index >= 0) {
                            customerDirectoryCache[index] = savedItem;
                        } else {
                            customerDirectoryCache.push(savedItem);
                        }
                    } else if (id) {
                        const index = customerDirectoryCache.findIndex((item) => item.id === id);

                        if (index >= 0) {
                            customerDirectoryCache[index] = payload;
                        }
                    } else {
                        customerDirectoryCache.push(payload);
                    }

                    saveCustomerDirectory();
                    closeCustomerDirectoryModal();
                    renderCustomerDirectory(kind);
                    customerDirectoryMessage(kind, `${meta.itemName}资料已保存`);
                } catch (error) {
                    alert(error.message || `${meta.itemName}资料保存失败`);
                }
            });
        }

        syncCustomerDirectoryFromServer().then(renderAllCustomerDirectories);
    }

    function bindWorkspaceNavigation() {
        const container = document.querySelector("[data-dashboard-container]");
        const title = document.querySelector("[data-page-title]");
        const navItems = document.querySelectorAll("[data-workspace-view]");
        const salesTitle = document.querySelector("[data-sales-workspace-title]");
        const salesDesc = document.querySelector("[data-sales-workspace-desc]");
        const salesCreateTop = document.querySelector("[data-sales-create-top]");
        const titleMap = {
            overview: "工作台",
            "sales-manual": "手动轮椅销售单",
            "sales-electric": "电动轮椅销售单",
            "warehouse-manual": "手动轮椅配件",
            "warehouse-electric": "电动轮椅配件",
            "finished-manual": "手动轮椅成品型号",
            "finished-electric": "电动轮椅成品型号",
            customers: "客户与收货方管理",
            settings: "系统设置"
        };

        if (!container || !navItems.length) {
            return;
        }

        function switchView(viewName) {
            const isSalesView = viewName === "sales-manual" || viewName === "sales-electric";
            const isWarehouseView = viewName === "warehouse-manual" || viewName === "warehouse-electric";
            const isFinishedView = viewName === "finished-manual" || viewName === "finished-electric";
            const isCustomerView = viewName === "customers";
            const salesType = viewName === "sales-electric" ? "electric" : viewName === "sales-manual" ? "manual" : "";
            const partsType = viewName === "warehouse-electric" ? "electric" : viewName === "warehouse-manual" ? "manual" : "";
            const finishedType = viewName === "finished-electric" ? "electric" : viewName === "finished-manual" ? "manual" : "";

            navItems.forEach(function (item) {
                item.classList.toggle("active", item.dataset.workspaceView === viewName);
            });

            container.classList.remove("view-ready");
            container.classList.add("view-transition");

            window.setTimeout(function () {
                currentSalesWheelchairType = salesType;
                currentPartsWheelchairType = partsType;
                currentFinishedWheelchairType = finishedType;
                container.classList.toggle("sales-mode", isSalesView);
                container.classList.toggle("warehouse-mode", isWarehouseView);
                container.classList.toggle("finished-mode", isFinishedView);
                container.classList.toggle("customer-mode", isCustomerView);

                if (title) {
                    title.textContent = titleMap[viewName] || "工作台";
                }

                if (salesTitle && isSalesView) {
                    salesTitle.textContent = `${salesTypeLabels[salesType]}销售工作区`;
                }

                if (salesDesc && isSalesView) {
                    salesDesc.textContent = `这里集中处理${salesTypeLabels[salesType]}销售单录入、修改、查询和导出。左侧菜单可随时切换手动或电动销售单。`;
                }

                if (salesCreateTop && isSalesView) {
                    salesCreateTop.textContent = `+ 创建${salesTypeLabels[salesType]}销售单`;
                }

                const filterForm = document.querySelector("[data-sales-filter]");

                if (filterForm && filterForm.elements.wheelchairType) {
                    filterForm.elements.wheelchairType.value = salesType;
                }

                const partsFilterForm = document.querySelector("[data-parts-filter]");

                if (partsFilterForm && partsFilterForm.elements.wheelchairType) {
                    partsFilterForm.elements.wheelchairType.value = partsType;
                }

                const warehouseTitle = document.querySelector("[data-warehouse-workspace-title]");
                const warehouseDesc = document.querySelector("[data-warehouse-workspace-desc]");
                const partCreateTop = document.querySelector("[data-part-create-top]");

                if (warehouseTitle && isWarehouseView) {
                    warehouseTitle.textContent = `${salesTypeLabels[partsType]}配件仓库工作区`;
                }

                if (warehouseDesc && isWarehouseView) {
                    warehouseDesc.textContent = `这里集中管理${salesTypeLabels[partsType]}配件库存、库位、供应商和低库存预警，可直接做入库/出库调整并导出库存表。`;
                }

                if (partCreateTop && isWarehouseView) {
                    partCreateTop.textContent = `+ 新增${salesTypeLabels[partsType]}配件`;
                }

                const finishedFilterForm = document.querySelector("[data-finished-filter]");

                if (finishedFilterForm && finishedFilterForm.elements.wheelchairType) {
                    finishedFilterForm.elements.wheelchairType.value = finishedType;
                }

                const finishedTitle = document.querySelector("[data-finished-workspace-title]");
                const finishedDesc = document.querySelector("[data-finished-workspace-desc]");
                const finishedCreateTop = document.querySelector("[data-finished-create-top]");

                if (finishedTitle && isFinishedView) {
                    finishedTitle.textContent = `${salesTypeLabels[finishedType]}成品型号`;
                }

                if (finishedDesc && isFinishedView) {
                    finishedDesc.textContent = `这里集中维护${salesTypeLabels[finishedType]}成品型号，方便销售、库存和生产环节统一选择型号。`;
                }

                if (finishedCreateTop && isFinishedView) {
                    finishedCreateTop.textContent = `+ 新增${salesTypeLabels[finishedType]}成品`;
                }

                if (isSalesView) {
                    loadSalesOrders();
                }

                if (isWarehouseView) {
                    loadParts();
                }

                if (isFinishedView) {
                    loadFinishedModels();
                    loadFinishedGoods();
                }

                if (isCustomerView) {
                    renderAllCustomerDirectories();
                }

                container.classList.remove("view-transition");
                container.classList.add("view-ready");
            }, 180);
        }

        navItems.forEach(function (item) {
            item.addEventListener("click", function () {
                const viewName = item.dataset.workspaceView;

                if (viewName !== "overview" && viewName !== "sales-manual" && viewName !== "sales-electric" && viewName !== "warehouse-manual" && viewName !== "warehouse-electric" && viewName !== "finished-manual" && viewName !== "finished-electric" && viewName !== "customers") {
                    alert("这个模块后续可以继续扩展，目前已完成销售、配件仓库和成品库存。");
                    return;
                }

                switchView(viewName);
            });
        });
    }

    async function loadEmployeeAccounts() {
        const list = document.querySelector("[data-employee-list]");
        const message = document.querySelector("[data-employee-message]");
        const checkAll = document.querySelector("[data-employee-check-all]");
        const deleteButton = document.querySelector("[data-employee-delete-selected]");

        if (!list) {
            return;
        }

        if (checkAll) {
            checkAll.checked = false;
            checkAll.indeterminate = false;
        }

        try {
            const currentUser = await loadCurrentUser();
            const canDeleteAccounts = isSystemAdministrator(currentUser);
            if (deleteButton) {
                deleteButton.hidden = !canDeleteAccounts;
            }
            if (checkAll) {
                checkAll.disabled = !canDeleteAccounts;
            }
            const data = await apiFetch("/api/employees");
            const employees = data.employees || [];
            employeeAccountsCache = employees;

            if (!employees.length) {
                list.innerHTML = '<tr><td colspan="7">暂无员工账号</td></tr>';
                return;
            }

            list.innerHTML = employees.map(function (employee) {
                const permissions = employee.permissions && employee.permissions.length
                    ? employee.permissions.join(", ")
                    : "普通登录";
                const statusClass = employee.active ? "badge-success" : "badge-danger";
                const statusText = employee.active ? "启用" : "停用";
                const isCurrentUser = currentUser && currentUser.id === employee.id;
                const cannotDelete = !canDeleteAccounts || isCurrentUser;

                return `
                    <tr>
                        <td class="checkbox-cell">
                            <input type="checkbox" data-employee-check value="${escapeHtml(employee.id)}" ${cannotDelete ? "disabled" : ""}>
                        </td>
                        <td>${escapeHtml(employee.username)}</td>
                        <td>${escapeHtml(employee.name)}</td>
                        <td>${escapeHtml(employee.department)}</td>
                        <td>${escapeHtml(employee.role)}</td>
                        <td>${escapeHtml(permissions)}</td>
                        <td><span class="badge ${statusClass}">${statusText}</span></td>
                    </tr>
                `;
            }).join("");

            if (message) {
                message.textContent = "";
            }
        } catch (error) {
            employeeAccountsCache = [];
            list.innerHTML = '<tr><td colspan="7">员工列表加载失败</td></tr>';

            if (message) {
                message.textContent = error.message || "员工列表加载失败";
            }
        }
    }

    function employeeMessage(text) {
        const message = document.querySelector("[data-employee-message]");

        if (message) {
            message.textContent = text || "";
        }
    }

    function selectedEmployeeAccountIds() {
        return Array.from(document.querySelectorAll("[data-employee-check]:checked")).map((checkbox) => checkbox.value);
    }

    function updateEmployeeCheckAllState() {
        const checkAll = document.querySelector("[data-employee-check-all]");

        if (!checkAll) {
            return;
        }

        const checkboxes = Array.from(document.querySelectorAll("[data-employee-check]:not(:disabled)"));
        const checked = checkboxes.filter((checkbox) => checkbox.checked);
        checkAll.checked = Boolean(checkboxes.length && checked.length === checkboxes.length);
        checkAll.indeterminate = Boolean(checked.length && checked.length < checkboxes.length);
    }

    async function deleteSelectedEmployeeAccounts() {
        const currentUser = await loadCurrentUser();

        if (!isSystemAdministrator(currentUser)) {
            employeeMessage("只有系统管理员可以删除账号");
            return;
        }

        const ids = selectedEmployeeAccountIds();

        if (!ids.length) {
            alert("请先勾选需要删除的账号");
            return;
        }

        const idSet = new Set(ids);
        const names = employeeAccountsCache
            .filter((employee) => idSet.has(employee.id))
            .map((employee) => employee.username)
            .join("、");

        if (!window.confirm(`确定删除选中的 ${ids.length} 个账号${names ? `（${names}）` : ""}吗？删除后不可恢复。`)) {
            return;
        }

        try {
            const data = await apiFetch("/api/employees", {
                method: "DELETE",
                body: JSON.stringify({ ids })
            });

            employeeMessage(data.message || `已删除 ${ids.length} 个账号`);
            await loadEmployeeAccounts();
        } catch (error) {
            employeeMessage(error.message || "删除账号失败");
        }
    }

    function bindEmployeeForm() {
        const form = document.querySelector("[data-employee-form]");
        const message = document.querySelector("[data-employee-message]");
        const deleteButton = document.querySelector("[data-employee-delete-selected]");
        const checkAll = document.querySelector("[data-employee-check-all]");
        const list = document.querySelector("[data-employee-list]");

        if (deleteButton) {
            deleteButton.addEventListener("click", deleteSelectedEmployeeAccounts);
        }

        if (checkAll) {
            checkAll.addEventListener("change", function () {
                document.querySelectorAll("[data-employee-check]:not(:disabled)").forEach(function (checkbox) {
                    checkbox.checked = checkAll.checked;
                });
                updateEmployeeCheckAllState();
            });
        }

        if (list) {
            list.addEventListener("change", function (event) {
                if (event.target.closest("[data-employee-check]")) {
                    updateEmployeeCheckAllState();
                }
            });
        }

        if (!form) {
            return;
        }

        form.addEventListener("submit", async function (event) {
            event.preventDefault();

            const permission = form.elements.permission.value;
            const payload = {
                username: form.elements.username.value.trim(),
                password: form.elements.password.value,
                name: form.elements.name.value.trim(),
                department: form.elements.department.value.trim(),
                role: permission === "employee" ? "系统管理员" : "普通员工",
                permissions: permission ? [permission] : []
            };

            try {
                const data = await apiFetch("/api/employees", {
                    method: "POST",
                    body: JSON.stringify(payload)
                });

                form.reset();

                if (message) {
                    message.textContent = data.message || "员工已创建";
                }

                await loadEmployeeAccounts();
            } catch (error) {
                if (message) {
                    message.textContent = error.message || "新增员工失败";
                } else {
                    alert(error.message || "新增员工失败");
                }
            }
        });
    }

    function handleLoginQuery() {
        const params = new URLSearchParams(window.location.search);

        if (params.get("denied") === "1") {
            alert("您无权访问");
        }

        if (params.get("login") === "1") {
            goToLogin(params.get("next"));
        }
    }

    document.addEventListener("DOMContentLoaded", function () {
        guardEmployeePage();
        bindRoutes();
        bindLoginTrigger();
        bindLogoutButton();
        bindWorkspaceNavigation();
        bindSalesModule();
        bindWarehouseModule();
        bindFinishedGoodsModule();
        bindCustomerDirectoryModule();
        bindEmployeeForm();
        loadSalesOrders();
        loadParts();
        loadFinishedModels();
        loadFinishedGoods();
        loadEmployeeAccounts();
        refreshLoginButton();
        handleLoginQuery();
    });
})();
