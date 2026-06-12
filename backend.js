// Unified interaction entry for the website.
// Authentication is handled by server.js through /api/* endpoints.
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
            throw new Error("登录系统需要通过后端服务器打开，请访问 http://localhost:3000/index.html，不要直接打开本地HTML文件。");
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
            throw new Error("无法连接登录服务器，请先运行 node server.js，然后访问 http://localhost:3000/index.html。");
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
                    <div class="employee-auth-hint">首次运行会生成测试账号：admin / 123456，staff / staff123。</div>
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

        ["startDate", "endDate", "customer", "product", "status", "wheelchairType"].forEach(function (name) {
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
                    <td>${escapeHtml(order.productModel)}<br><span style="color:#64748b;">${escapeHtml(salesTypeLabels[wheelchairType])}</span></td>
                    <td>${escapeHtml(order.quantity)}</td>
                    <td>${formatMoney(order.amount)}</td>
                    <td>${statusContent}</td>
                    <td>${escapeHtml(order.createdByName)}</td>
                    <td><span class="action-link" data-sales-edit="${escapeHtml(order.id)}">修改</span></td>
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

    function openSalesModal(order) {
        const modal = document.querySelector("[data-sales-modal]");
        const form = document.querySelector("[data-sales-form]");
        const title = document.querySelector("[data-sales-modal-title]");

        if (!modal || !form) {
            return;
        }

        form.reset();

        if (order) {
            title.textContent = `修改销售单 ${order.orderNo}`;
            form.elements.id.value = order.id;
            form.elements.orderDate.value = order.orderDate;
            form.elements.orderTime.value = order.orderTime;
            form.elements.status.value = normalizeSalesStatus(order.status);
            form.elements.wheelchairType.value = normalizeWheelchairType(order.wheelchairType, order.productModel);
            form.elements.customerName.value = order.customerName;
            form.elements.customerPhone.value = order.customerPhone || "";
            form.elements.customerType.value = order.customerType || "个人客户";
            form.elements.productModel.value = order.productModel;
            form.elements.quantity.value = order.quantity;
            form.elements.unitPrice.value = order.unitPrice;
            form.elements.remark.value = order.remark || "";
        } else {
            title.textContent = "创建销售单";
            form.elements.id.value = "";
            form.elements.wheelchairType.value = currentSalesWheelchairType || "manual";
            form.elements.status.value = "待打印";
            form.elements.customerType.value = "个人客户";
            setDefaultSalesDateTime(form);
        }

        modal.classList.add("active");
        form.elements.customerName.focus();
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
        const list = document.querySelector("[data-sales-list]");
        const checkAll = document.querySelector("[data-sales-check-all]");
        const form = document.querySelector("[data-sales-form]");
        const modal = document.querySelector("[data-sales-modal]");

        if (createButton) {
            createButton.addEventListener("click", function () {
                openSalesModal();
            });
        }

        if (topCreateButton) {
            topCreateButton.addEventListener("click", function () {
                openSalesModal();
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

        if (checkAll) {
            checkAll.addEventListener("change", function () {
                document.querySelectorAll("[data-sales-check]").forEach(function (checkbox) {
                    checkbox.checked = checkAll.checked;
                });
            });
        }

        if (list) {
            list.addEventListener("click", function (event) {
                const statusButton = event.target.closest("[data-sales-next-status]");

                if (statusButton) {
                    advanceSalesOrderStatus(statusButton.dataset.salesNextStatus);
                    return;
                }

                const editButton = event.target.closest("[data-sales-edit]");

                if (!editButton) {
                    return;
                }

                const order = salesOrdersCache.find((item) => item.id === editButton.dataset.salesEdit);

                if (order) {
                    openSalesModal(order);
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
            form.addEventListener("submit", async function (event) {
                event.preventDefault();

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

        if (!list) {
            return;
        }

        if (!parts.length) {
            list.innerHTML = '<tr><td colspan="9">没有符合条件的配件</td></tr>';
            partsMessage("共 0 条记录");
            return;
        }

        list.innerHTML = parts.map(function (part) {
            const wheelchairType = normalizeWheelchairType(part.wheelchairType, `${part.name || ""} ${part.remark || ""} ${part.category || ""}`);

            return `
                <tr>
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
            list.innerHTML = '<tr><td colspan="9">配件库存加载失败</td></tr>';
            partsMessage(error.message || "配件库存加载失败");
        }
    }

    function closePartModal() {
        const modal = document.querySelector("[data-part-modal]");

        if (modal) {
            modal.classList.remove("active");
        }
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
            form.elements.supplier.value = part.supplier || "";
            form.elements.remark.value = part.remark || "";
        } else {
            title.textContent = "新增配件";
            form.elements.id.value = "";
            form.elements.wheelchairType.value = currentPartsWheelchairType || "manual";
            form.elements.category.value = "电池电控";
            form.elements.currentStock.value = 0;
            form.elements.safetyStock.value = 0;
            form.elements.unit.value = "个";
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

    function bindWarehouseModule() {
        const createButton = document.querySelector("[data-part-create]");
        const createTopButton = document.querySelector("[data-part-create-top]");
        const filterForm = document.querySelector("[data-parts-filter]");
        const resetButton = document.querySelector("[data-parts-reset]");
        const exportButton = document.querySelector("[data-parts-export]");
        const list = document.querySelector("[data-parts-list]");
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

    function renderFinishedGoods(goods) {
        const list = document.querySelector("[data-finished-list]");

        if (!list) {
            return;
        }

        if (!goods.length) {
            list.innerHTML = '<tr><td colspan="9">没有符合条件的成品</td></tr>';
            finishedMessage("共 0 条记录");
            return;
        }

        list.innerHTML = goods.map(function (item) {
            const wheelchairType = normalizeWheelchairType(item.wheelchairType, item.model);

            return `
                <tr>
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
            list.innerHTML = '<tr><td colspan="9">成品库存加载失败</td></tr>';
            finishedMessage(error.message || "成品库存加载失败");
        }
    }

    function closeFinishedModal() {
        const modal = document.querySelector("[data-finished-modal]");

        if (modal) {
            modal.classList.remove("active");
        }
    }

    function openFinishedModal(item) {
        const modal = document.querySelector("[data-finished-modal]");
        const form = document.querySelector("[data-finished-form]");
        const title = document.querySelector("[data-finished-modal-title]");

        if (!modal || !form) {
            return;
        }

        form.reset();

        if (item) {
            title.textContent = `修改成品 ${item.sku}`;
            form.elements.id.value = item.id;
            form.elements.wheelchairType.value = normalizeWheelchairType(item.wheelchairType, item.model);
            form.elements.sku.value = item.sku;
            form.elements.model.value = item.model;
            form.elements.category.value = item.category;
            form.elements.currentStock.value = item.currentStock;
            form.elements.safetyStock.value = item.safetyStock;
            form.elements.unit.value = item.unit;
            form.elements.location.value = item.location || "";
            form.elements.batchNo.value = item.batchNo || "";
            form.elements.remark.value = item.remark || "";
        } else {
            title.textContent = "新增成品";
            form.elements.id.value = "";
            form.elements.wheelchairType.value = currentFinishedWheelchairType || "manual";
            form.elements.category.value = currentFinishedWheelchairType === "electric" ? "电动折叠" : "手动折叠";
            form.elements.currentStock.value = 0;
            form.elements.safetyStock.value = 0;
            form.elements.unit.value = "台";
        }

        modal.classList.add("active");
        form.elements.sku.focus();
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

    function bindFinishedGoodsModule() {
        const createButton = document.querySelector("[data-finished-create]");
        const createTopButton = document.querySelector("[data-finished-create-top]");
        const filterForm = document.querySelector("[data-finished-filter]");
        const resetButton = document.querySelector("[data-finished-reset]");
        const exportButton = document.querySelector("[data-finished-export]");
        const list = document.querySelector("[data-finished-list]");
        const form = document.querySelector("[data-finished-form]");
        const modal = document.querySelector("[data-finished-modal]");

        [createButton, createTopButton].forEach(function (button) {
            if (button) {
                button.addEventListener("click", function () {
                    openFinishedModal();
                });
            }
        });

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
                const payload = {
                    sku: form.elements.sku.value.trim(),
                    model: form.elements.model.value.trim(),
                    wheelchairType: form.elements.wheelchairType.value || currentFinishedWheelchairType || "manual",
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
            "finished-manual": "手动轮椅成品库",
            "finished-electric": "电动轮椅成品库",
            customers: "客户与经销商",
            settings: "系统设置"
        };

        if (!container || !navItems.length) {
            return;
        }

        function switchView(viewName) {
            const isSalesView = viewName === "sales-manual" || viewName === "sales-electric";
            const isWarehouseView = viewName === "warehouse-manual" || viewName === "warehouse-electric";
            const isFinishedView = viewName === "finished-manual" || viewName === "finished-electric";
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
                    finishedTitle.textContent = `${salesTypeLabels[finishedType]}成品库存工作区`;
                }

                if (finishedDesc && isFinishedView) {
                    finishedDesc.textContent = `这里集中管理${salesTypeLabels[finishedType]}成品型号、库存、批次、库位和低库存预警，可直接做入库/出库调整并导出成品库存表。`;
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
                    loadFinishedGoods();
                }

                container.classList.remove("view-transition");
                container.classList.add("view-ready");
            }, 180);
        }

        navItems.forEach(function (item) {
            item.addEventListener("click", function () {
                const viewName = item.dataset.workspaceView;

                if (viewName !== "overview" && viewName !== "sales-manual" && viewName !== "sales-electric" && viewName !== "warehouse-manual" && viewName !== "warehouse-electric" && viewName !== "finished-manual" && viewName !== "finished-electric") {
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

        if (!list) {
            return;
        }

        try {
            const data = await apiFetch("/api/employees");
            const employees = data.employees || [];

            if (!employees.length) {
                list.innerHTML = '<tr><td colspan="6">暂无员工账号</td></tr>';
                return;
            }

            list.innerHTML = employees.map(function (employee) {
                const permissions = employee.permissions && employee.permissions.length
                    ? employee.permissions.join(", ")
                    : "普通登录";
                const statusClass = employee.active ? "badge-success" : "badge-danger";
                const statusText = employee.active ? "启用" : "停用";

                return `
                    <tr>
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
            list.innerHTML = '<tr><td colspan="6">员工列表加载失败</td></tr>';

            if (message) {
                message.textContent = error.message || "员工列表加载失败";
            }
        }
    }

    function bindEmployeeForm() {
        const form = document.querySelector("[data-employee-form]");
        const message = document.querySelector("[data-employee-message]");

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
        bindEmployeeForm();
        loadSalesOrders();
        loadParts();
        loadFinishedGoods();
        loadEmployeeAccounts();
        refreshLoginButton();
        handleLoginQuery();
    });
})();
