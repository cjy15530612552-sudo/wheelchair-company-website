const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");

const rootDir = __dirname;

function loadEnvFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return;
    }

    const lines = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/);

    lines.forEach((line) => {
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith("#")) {
            return;
        }

        const equalIndex = trimmed.indexOf("=");

        if (equalIndex <= 0) {
            return;
        }

        const key = trimmed.slice(0, equalIndex).trim();
        let value = trimmed.slice(equalIndex + 1).trim();

        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }

        if (!process.env[key]) {
            process.env[key] = value;
        }
    });
}

loadEnvFile(path.join(rootDir, ".env"));

const dataDir = path.join(rootDir, "data");
const employeesFile = path.join(dataDir, "employees.json");
const salesOrdersFile = path.join(dataDir, "sales-orders.json");
const partsInventoryFile = path.join(dataDir, "parts-inventory.json");
const finishedGoodsFile = path.join(dataDir, "finished-goods.json");
const finishedModelsFile = path.join(dataDir, "finished-models.json");
const customerDirectoryFile = path.join(dataDir, "customer-directory.json");
const port = Number(process.env.PORT || 3000);

const sessions = new Map();
const sessionMaxAgeSeconds = 60 * 60 * 8;
const salesStatusFlow = ["待打印", "待发货", "已发货（待确认）", "已完成"];

const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".ico": "image/x-icon"
};

function requiredEnv(name) {
    const value = String(process.env[name] || "").trim();

    if (!value) {
        throw new Error(`请在 .env 中配置 ${name}，用于初始化员工账号密码。`);
    }

    return value;
}

function ensureDataStore() {
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    if (!fs.existsSync(employeesFile)) {
        const employees = [
            {
                id: crypto.randomUUID(),
                username: "admin",
                name: "管理员",
                department: "管理部",
                role: "系统管理员",
                permissions: ["employee"],
                active: true,
                passwordHash: hashPassword(requiredEnv("ADMIN_INITIAL_PASSWORD")),
                createdAt: new Date().toISOString()
            },
            {
                id: crypto.randomUUID(),
                username: "customer",
                name: "客户",
                department: "客户",
                role: "客户",
                permissions: [],
                active: true,
                passwordHash: hashPassword(requiredEnv("CUSTOMER_INITIAL_PASSWORD")),
                createdAt: new Date().toISOString()
            },
            {
                id: crypto.randomUUID(),
                username: "staff",
                name: "普通员工",
                department: "销售部",
                role: "普通员工",
                permissions: [],
                active: true,
                passwordHash: hashPassword(requiredEnv("STAFF_INITIAL_PASSWORD")),
                createdAt: new Date().toISOString()
            }
        ];

        writeEmployees(employees);
    }

    if (!fs.existsSync(salesOrdersFile)) {
        writeSalesOrders(seedSalesOrders());
    }

    if (!fs.existsSync(partsInventoryFile)) {
        writePartsInventory(seedPartsInventory());
    }

    if (!fs.existsSync(finishedGoodsFile)) {
        writeFinishedGoods(seedFinishedGoods());
    }

    if (!fs.existsSync(finishedModelsFile)) {
        writeFinishedModels(seedFinishedModels());
    }

    if (!fs.existsSync(customerDirectoryFile)) {
        writeCustomerDirectory(seedCustomerDirectory());
    }
}

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");

    return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
    const parts = String(storedHash || "").split("$");

    if (parts.length !== 3 || parts[0] !== "scrypt") {
        return false;
    }

    const [, salt, hash] = parts;
    const verifyHash = crypto.scryptSync(password, salt, 64);
    const storedBuffer = Buffer.from(hash, "hex");

    return storedBuffer.length === verifyHash.length && crypto.timingSafeEqual(storedBuffer, verifyHash);
}

function readEmployees() {
    ensureDataStore();
    return readJsonFile(employeesFile);
}

function writeEmployees(employees) {
    fs.writeFileSync(employeesFile, JSON.stringify(employees, null, 2), "utf8");
}

function readJsonFile(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function seedCustomerDirectory() {
    const now = new Date().toISOString();

    return [
        {
            id: crypto.randomUUID(),
            kind: "customer",
            name: "上海长海医院",
            contact: "采购科",
            phone: "021-55556666",
            label: "医院客户",
            address: "上海市杨浦区长海路",
            status: "启用",
            remark: "优先安排发票和批量配送",
            createdAt: now,
            updatedAt: now
        },
        {
            id: crypto.randomUUID(),
            kind: "customer",
            name: "王女士",
            contact: "王女士",
            phone: "13800008888",
            label: "个人客户",
            address: "北京市朝阳区",
            status: "待跟进",
            remark: "关注电动轮椅续航",
            createdAt: now,
            updatedAt: now
        },
        {
            id: crypto.randomUUID(),
            kind: "dealer",
            name: "北京瑞康医疗器械店",
            contact: "刘经理",
            phone: "010-88886666",
            label: "华北区域",
            address: "月结30天",
            status: "启用",
            remark: "重点经销商",
            createdAt: now,
            updatedAt: now
        },
        {
            id: crypto.randomUUID(),
            kind: "dealer",
            name: "宁波康复用品中心",
            contact: "陈经理",
            phone: "0574-66228888",
            label: "浙江区域",
            address: "现结",
            status: "启用",
            remark: "常订手动折叠款",
            createdAt: now,
            updatedAt: now
        },
        {
            id: crypto.randomUUID(),
            kind: "sender",
            name: "常州电池供应商",
            contact: "周经理",
            phone: "0519-66228888",
            label: "电池配件",
            address: "月结30天",
            status: "启用",
            remark: "常供24V锂电池",
            createdAt: now,
            updatedAt: now
        },
        {
            id: crypto.randomUUID(),
            kind: "sender",
            name: "宁波五金配件供应商",
            contact: "张经理",
            phone: "0574-88996666",
            label: "五金件",
            address: "现结",
            status: "启用",
            remark: "常供轮组和车架配件",
            createdAt: now,
            updatedAt: now
        }
    ];
}

function readCustomerDirectory() {
    ensureDataStore();
    return readJsonFile(customerDirectoryFile);
}

function writeCustomerDirectory(items) {
    fs.writeFileSync(customerDirectoryFile, JSON.stringify(items, null, 2), "utf8");
}

function seedSalesOrders() {
    const now = new Date().toISOString();

    return [
        {
            id: crypto.randomUUID(),
            orderNo: "SO-20260529-001",
            orderDate: "2026-05-29",
            orderTime: "09:30",
            customerName: "北京瑞康医疗器械店",
            customerPhone: "010-88886666",
            customerType: "经销商",
            wheelchairType: "electric",
            productModel: "JL-E100 电动折叠",
            quantity: 5,
            unitPrice: 6800,
            amount: 34000,
            status: "待发货",
            remark: "优先安排物流",
            createdBy: "admin",
            createdByName: "管理员",
            createdAt: now,
            updatedAt: now
        },
        {
            id: crypto.randomUUID(),
            orderNo: "SO-20260528-004",
            orderDate: "2026-05-28",
            orderTime: "14:10",
            customerName: "上海长海医院",
            customerPhone: "021-55556666",
            customerType: "医院",
            wheelchairType: "manual",
            productModel: "JL-M300 全躺护理",
            quantity: 20,
            unitPrice: 3200,
            amount: 64000,
            status: "已发货（待确认）",
            remark: "",
            createdBy: "admin",
            createdByName: "管理员",
            createdAt: now,
            updatedAt: now
        }
    ];
}

function readSalesOrders() {
    ensureDataStore();
    return readJsonFile(salesOrdersFile);
}

function writeSalesOrders(orders) {
    fs.writeFileSync(salesOrdersFile, JSON.stringify(orders, null, 2), "utf8");
}

function seedPartsInventory() {
    const now = new Date().toISOString();

    return [
        {
            id: crypto.randomUUID(),
            partNo: "P-BAT-24V20AH",
            name: "24V 20AH 锂电池",
            category: "电池电控",
            wheelchairType: "electric",
            currentStock: 8,
            safetyStock: 20,
            unit: "块",
            location: "A区-01",
            supplier: "宁波动力电池",
            remark: "电动轮椅通用",
            updatedAt: now
        },
        {
            id: crypto.randomUUID(),
            partNo: "P-JOY-360",
            name: "360度智能摇杆",
            category: "电池电控",
            wheelchairType: "electric",
            currentStock: 15,
            safetyStock: 30,
            unit: "个",
            location: "A区-02",
            supplier: "杭州智控",
            remark: "",
            updatedAt: now
        },
        {
            id: crypto.randomUUID(),
            partNo: "P-WHL-F8",
            name: "8寸前置万向轮",
            category: "轮组",
            wheelchairType: "manual",
            currentStock: 24,
            safetyStock: 40,
            unit: "个",
            location: "B区-03",
            supplier: "霸州轮业",
            remark: "手动/电动通用",
            updatedAt: now
        },
        {
            id: crypto.randomUUID(),
            partNo: "P-BRK-EM",
            name: "电磁刹车组件",
            category: "制动安全",
            wheelchairType: "electric",
            currentStock: 18,
            safetyStock: 25,
            unit: "套",
            location: "C区-01",
            supplier: "苏州制动",
            remark: "电动系列",
            updatedAt: now
        },
        {
            id: crypto.randomUUID(),
            partNo: "P-CUS-HONEY",
            name: "蜂窝透气坐垫",
            category: "坐垫靠背",
            wheelchairType: "manual",
            currentStock: 150,
            safetyStock: 50,
            unit: "套",
            location: "D区-02",
            supplier: "广州康垫",
            remark: "",
            updatedAt: now
        }
    ];
}

function readPartsInventory() {
    ensureDataStore();
    return readJsonFile(partsInventoryFile);
}

function writePartsInventory(parts) {
    fs.writeFileSync(partsInventoryFile, JSON.stringify(parts, null, 2), "utf8");
}

function seedFinishedGoods() {
    const now = new Date().toISOString();

    return [
        {
            id: crypto.randomUUID(),
            sku: "FG-E100",
            model: "JL-E100 电动折叠",
            wheelchairType: "electric",
            category: "电动折叠",
            currentStock: 12,
            safetyStock: 8,
            unit: "台",
            location: "成品A区-01",
            batchNo: "B202605-E100",
            remark: "城市轻便款",
            updatedAt: now
        },
        {
            id: crypto.randomUUID(),
            sku: "FG-E200",
            model: "JL-E200 全地形越野",
            wheelchairType: "electric",
            category: "全地形",
            currentStock: 6,
            safetyStock: 6,
            unit: "台",
            location: "成品A区-02",
            batchNo: "B202605-E200",
            remark: "",
            updatedAt: now
        },
        {
            id: crypto.randomUUID(),
            sku: "FG-M100",
            model: "JL-M100 超轻折叠",
            wheelchairType: "manual",
            category: "手动折叠",
            currentStock: 28,
            safetyStock: 15,
            unit: "台",
            location: "成品B区-01",
            batchNo: "B202605-M100",
            remark: "轻量便携",
            updatedAt: now
        },
        {
            id: crypto.randomUUID(),
            sku: "FG-M300",
            model: "JL-M300 全躺护理",
            wheelchairType: "manual",
            category: "护理型",
            currentStock: 9,
            safetyStock: 12,
            unit: "台",
            location: "成品B区-02",
            batchNo: "B202605-M300",
            remark: "医院常用",
            updatedAt: now
        }
    ];
}

function seedFinishedModels() {
    const now = new Date().toISOString();

    return [
        {
            id: crypto.randomUUID(),
            model: "JL-E100 电动折叠",
            wheelchairType: "electric",
            createdAt: now,
            updatedAt: now
        },
        {
            id: crypto.randomUUID(),
            model: "JL-E200 全地形越野",
            wheelchairType: "electric",
            createdAt: now,
            updatedAt: now
        },
        {
            id: crypto.randomUUID(),
            model: "JL-M100 超轻折叠",
            wheelchairType: "manual",
            createdAt: now,
            updatedAt: now
        },
        {
            id: crypto.randomUUID(),
            model: "JL-M300 全躺护理",
            wheelchairType: "manual",
            createdAt: now,
            updatedAt: now
        }
    ];
}

function readFinishedGoods() {
    ensureDataStore();
    return readJsonFile(finishedGoodsFile);
}

function writeFinishedGoods(goods) {
    fs.writeFileSync(finishedGoodsFile, JSON.stringify(goods, null, 2), "utf8");
}

function readFinishedModels() {
    ensureDataStore();
    return readJsonFile(finishedModelsFile);
}

function writeFinishedModels(models) {
    fs.writeFileSync(finishedModelsFile, JSON.stringify(models, null, 2), "utf8");
}

function publicEmployee(employee) {
    return {
        id: employee.id,
        username: employee.username,
        name: employee.name,
        department: employee.department,
        role: employee.role,
        permissions: employee.permissions || [],
        active: employee.active !== false,
        createdAt: employee.createdAt
    };
}

function parseCookies(req) {
    const cookies = {};
    const header = req.headers.cookie || "";

    header.split(";").forEach((cookie) => {
        const index = cookie.indexOf("=");

        if (index < 0) {
            return;
        }

        const key = cookie.slice(0, index).trim();
        const value = cookie.slice(index + 1).trim();
        cookies[key] = decodeURIComponent(value);
    });

    return cookies;
}

function createSession(employee) {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = Date.now() + sessionMaxAgeSeconds * 1000;

    sessions.set(token, {
        employeeId: employee.id,
        expiresAt
    });

    return token;
}

function getSessionUser(req) {
    const token = parseCookies(req).session;

    if (!token || !sessions.has(token)) {
        return null;
    }

    const session = sessions.get(token);

    if (session.expiresAt < Date.now()) {
        sessions.delete(token);
        return null;
    }

    return readEmployees().find((employee) => employee.id === session.employeeId && employee.active !== false) || null;
}

function hasPermission(employee, permission) {
    return Boolean(employee && Array.isArray(employee.permissions) && employee.permissions.includes(permission));
}

function requireEmployeeAccess(req, res) {
    const user = getSessionUser(req);

    if (!hasPermission(user, "employee")) {
        sendJson(res, 403, { message: "您无权访问" });
        return null;
    }

    return user;
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

function sendJson(res, statusCode, payload, extraHeaders = {}) {
    res.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        ...extraHeaders
    });
    res.end(JSON.stringify(payload));
}

function redirect(res, location) {
    res.writeHead(302, { Location: encodeURI(location) });
    res.end();
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = "";

        req.on("data", (chunk) => {
            body += chunk;

            if (body.length > 1024 * 1024) {
                reject(new Error("请求内容过大"));
                req.destroy();
            }
        });

        req.on("end", () => {
            if (!body) {
                resolve({});
                return;
            }

            try {
                resolve(JSON.parse(body));
            } catch (error) {
                reject(new Error("JSON格式错误"));
            }
        });
    });
}

function generateOrderNo(orderDate) {
    const compactDate = String(orderDate || new Date().toISOString().slice(0, 10)).replaceAll("-", "");
    const prefix = `SO-${compactDate}-`;
    const todayCount = readSalesOrders().filter((order) => order.orderNo.startsWith(prefix)).length + 1;

    return `${prefix}${String(todayCount).padStart(3, "0")}`;
}

function normalizeSalesOrder(body, user, existingOrder) {
    const orderDate = String(body.orderDate || "").trim();
    const orderTime = String(body.orderTime || "").trim();
    const customerName = String(body.customerName || "").trim();
    const customerPhone = String(body.customerPhone || "").trim();
    const rawCustomerType = String(body.customerType || "客户").trim();
    const allowedCustomerTypes = new Set(["客户", "网站客户", "经销商"]);
    const customerType = allowedCustomerTypes.has(rawCustomerType) ? rawCustomerType : "客户";
    const productModel = String(body.productModel || "").trim();
    const wheelchairType = normalizeWheelchairType(body.wheelchairType, productModel);
    const quantity = Number(body.quantity || 0);
    const unitPrice = Number(body.unitPrice || 0);
    const status = normalizeSalesStatus(body.status || "待打印");
    const remark = String(body.remark || "").trim();

    if (!orderDate || !orderTime || !customerName || !productModel) {
        throw new Error("请填写日期、时间、客户名称和产品型号");
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error("数量必须大于0");
    }

    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new Error("单价不能小于0");
    }

    const now = new Date().toISOString();

    return {
        id: existingOrder ? existingOrder.id : crypto.randomUUID(),
        orderNo: existingOrder ? existingOrder.orderNo : generateOrderNo(orderDate),
        orderDate,
        orderTime,
        customerName,
        customerPhone,
        customerType,
        wheelchairType,
        productModel,
        quantity,
        unitPrice,
        amount: Number((quantity * unitPrice).toFixed(2)),
        status,
        remark,
        createdBy: existingOrder ? existingOrder.createdBy : user.username,
        createdByName: existingOrder ? existingOrder.createdByName : user.name,
        createdAt: existingOrder ? existingOrder.createdAt : now,
        updatedAt: now
    };
}

function filterSalesOrders(orders, query) {
    const startDate = query.get("startDate");
    const endDate = query.get("endDate");
    const customer = String(query.get("customer") || "").trim().toLowerCase();
    const customerType = String(query.get("customerType") || "").trim();
    const product = String(query.get("product") || "").trim().toLowerCase();
    const remark = String(query.get("remark") || "").trim().toLowerCase();
    const wheelchairType = String(query.get("wheelchairType") || "").trim();
    const status = normalizeSalesStatus(query.get("status") || "");
    const ids = String(query.get("ids") || "").split(",").map((id) => id.trim()).filter(Boolean);
    const hasQuery = Array.from(query.keys()).some((key) => key !== "ids" && key !== "wheelchairType");

    return orders.filter((order) => {
        const orderStatus = normalizeSalesStatus(order.status);
        const orderWheelchairType = normalizeWheelchairType(order.wheelchairType, order.productModel);

        if (ids.length && !ids.includes(order.id)) {
            return false;
        }

        if (!ids.length && !hasQuery && orderStatus === "已完成") {
            return false;
        }

        if (startDate && order.orderDate < startDate) {
            return false;
        }

        if (endDate && order.orderDate > endDate) {
            return false;
        }

        if (customer) {
            const haystack = `${order.customerName} ${order.customerPhone} ${order.customerType}`.toLowerCase();

            if (!haystack.includes(customer)) {
                return false;
            }
        }

        if (customerType && order.customerType !== customerType) {
            return false;
        }

        if (product && !String(order.productModel || "").toLowerCase().includes(product)) {
            return false;
        }

        if (remark && !String(order.remark || "").toLowerCase().includes(remark)) {
            return false;
        }

        if (wheelchairType && orderWheelchairType !== wheelchairType) {
            return false;
        }

        if (query.get("status") && orderStatus !== status) {
            return false;
        }

        return true;
    }).map((order) => ({
        ...order,
        status: normalizeSalesStatus(order.status),
        wheelchairType: normalizeWheelchairType(order.wheelchairType, order.productModel)
    })).sort((a, b) => `${b.orderDate} ${b.orderTime}`.localeCompare(`${a.orderDate} ${a.orderTime}`));
}

function normalizeCustomerDirectoryItem(body, existingItem) {
    const allowedKinds = new Set(["customer", "dealer", "sender"]);
    const allowedStatuses = new Set(["启用", "停用", "待跟进"]);
    const kind = String(body.kind || (existingItem && existingItem.kind) || "customer").trim();
    const name = String(body.name || "").trim();
    const contact = String(body.contact || "").trim();
    const phone = String(body.phone || "").trim();
    const label = String(body.label || "").trim();
    const address = String(body.address || "").trim();
    const rawStatus = String(body.status || "启用").trim();
    const remark = String(body.remark || "").trim();
    const now = new Date().toISOString();

    if (!allowedKinds.has(kind)) {
        throw new Error("资料类型不正确");
    }

    if (!name || !contact || !phone) {
        throw new Error("请填写名称、联系人和联系电话");
    }

    return {
        id: existingItem ? existingItem.id : crypto.randomUUID(),
        kind,
        name,
        contact,
        phone,
        label,
        address,
        status: allowedStatuses.has(rawStatus) ? rawStatus : "启用",
        remark,
        createdAt: existingItem ? existingItem.createdAt : now,
        updatedAt: now
    };
}

function filterCustomerDirectory(items, query) {
    const kind = String(query.get("kind") || "").trim();
    const keyword = String(query.get("keyword") || "").trim().toLowerCase();
    const status = String(query.get("status") || "").trim();

    return items.filter((item) => {
        if (kind && item.kind !== kind) {
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
    }).sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

function csvCell(value) {
    return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function sendSalesOrdersCsv(res, orders) {
    const headers = ["单号", "日期", "时间", "客户", "电话", "客户类型", "轮椅类型", "产品型号", "数量", "单价", "金额", "状态", "备注", "创建人", "创建时间"];
    const rows = orders.map((order) => [
        order.orderNo,
        order.orderDate,
        order.orderTime,
        order.customerName,
        order.customerPhone,
        order.customerType,
        normalizeWheelchairType(order.wheelchairType, order.productModel) === "electric" ? "电动轮椅" : "手动轮椅",
        order.productModel,
        order.quantity,
        order.unitPrice,
        order.amount,
        order.status,
        order.remark,
        order.createdByName,
        order.createdAt
    ]);
    const csv = "\uFEFF" + [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const filename = encodeURIComponent(`销售单导出-${new Date().toISOString().slice(0, 10)}.csv`);

    res.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${filename}`
    });
    res.end(csv);
}

function normalizePart(body, existingPart) {
    const partNo = String(body.partNo || "").trim();
    const name = String(body.name || "").trim();
    const category = String(body.category || "其他").trim();
    const wheelchairType = normalizeWheelchairType(body.wheelchairType, `${body.name || ""} ${body.remark || ""} ${body.category || ""}`);
    const currentStock = Number(body.currentStock || 0);
    const safetyStock = Number(body.safetyStock || 0);
    const unit = String(body.unit || "个").trim();
    const location = String(body.location || "").trim();
    const supplier = String(body.supplier || "").trim();
    const remark = String(body.remark || "").trim();

    if (!partNo || !name) {
        throw new Error("请填写配件编号和配件名称");
    }

    if (!Number.isFinite(currentStock) || currentStock < 0) {
        throw new Error("当前库存不能小于0");
    }

    if (!Number.isFinite(safetyStock) || safetyStock < 0) {
        throw new Error("安全库存不能小于0");
    }

    return {
        id: existingPart ? existingPart.id : crypto.randomUUID(),
        partNo,
        name,
        category,
        wheelchairType,
        currentStock,
        safetyStock,
        unit,
        location,
        supplier,
        remark,
        updatedAt: new Date().toISOString()
    };
}

function partStockStatus(part) {
    if (part.currentStock <= 0) {
        return "缺货";
    }

    if (part.currentStock < part.safetyStock) {
        return "低库存";
    }

    return "充足";
}

function filterPartsInventory(parts, query) {
    const keyword = String(query.get("keyword") || "").trim().toLowerCase();
    const category = String(query.get("category") || "").trim();
    const wheelchairType = String(query.get("wheelchairType") || "").trim();
    const status = String(query.get("status") || "").trim();

    return parts.filter((part) => {
        const partWheelchairType = normalizeWheelchairType(part.wheelchairType, `${part.name || ""} ${part.remark || ""} ${part.category || ""}`);

        if (keyword) {
            const haystack = `${part.partNo} ${part.name} ${part.location} ${part.supplier}`.toLowerCase();

            if (!haystack.includes(keyword)) {
                return false;
            }
        }

        if (category && part.category !== category) {
            return false;
        }

        if (wheelchairType && partWheelchairType !== wheelchairType) {
            return false;
        }

        if (status && partStockStatus(part) !== status) {
            return false;
        }

        return true;
    }).map((part) => ({
        ...part,
        wheelchairType: normalizeWheelchairType(part.wheelchairType, `${part.name || ""} ${part.remark || ""} ${part.category || ""}`),
        status: partStockStatus(part)
    })).sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

function sendPartsCsv(res, parts) {
    const headers = ["配件编号", "配件名称", "适用类型", "分类", "当前库存", "安全库存", "单位", "状态", "库位", "供应商", "备注", "更新时间"];
    const rows = parts.map((part) => [
        part.partNo,
        part.name,
        normalizeWheelchairType(part.wheelchairType, `${part.name || ""} ${part.remark || ""} ${part.category || ""}`) === "electric" ? "电动轮椅" : "手动轮椅",
        part.category,
        part.currentStock,
        part.safetyStock,
        part.unit,
        partStockStatus(part),
        part.location,
        part.supplier,
        part.remark,
        part.updatedAt
    ]);
    const csv = "\uFEFF" + [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const filename = encodeURIComponent(`配件库存导出-${new Date().toISOString().slice(0, 10)}.csv`);

    res.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${filename}`
    });
    res.end(csv);
}

function generateFinishedSku(wheelchairType) {
    const prefix = wheelchairType === "electric" ? "FG-E" : "FG-M";
    return `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
}

function normalizeFinishedGood(body, existingItem) {
    const model = String(body.model || "").trim();
    const wheelchairType = normalizeWheelchairType(body.wheelchairType, model);
    const sku = String(body.sku || "").trim() || (existingItem ? existingItem.sku : generateFinishedSku(wheelchairType));
    const category = String(body.category || "其他").trim();
    const currentStock = Number(body.currentStock || 0);
    const safetyStock = Number(body.safetyStock || 0);
    const unit = String(body.unit || "台").trim();
    const location = String(body.location || "").trim();
    const batchNo = String(body.batchNo || "").trim();
    const remark = String(body.remark || "").trim();

    if (!model) {
        throw new Error("请填写成品型号");
    }

    if (!Number.isFinite(currentStock) || currentStock < 0) {
        throw new Error("当前库存不能小于0");
    }

    if (!Number.isFinite(safetyStock) || safetyStock < 0) {
        throw new Error("安全库存不能小于0");
    }

    return {
        id: existingItem ? existingItem.id : crypto.randomUUID(),
        sku,
        model,
        wheelchairType,
        category,
        currentStock,
        safetyStock,
        unit,
        location,
        batchNo,
        remark,
        updatedAt: new Date().toISOString()
    };
}

function normalizeFinishedModel(body, existingItem) {
    const model = String(body.model || "").trim();
    const wheelchairType = normalizeWheelchairType(body.wheelchairType, model);
    const now = new Date().toISOString();

    if (!model) {
        throw new Error("请填写成品型号");
    }

    return {
        id: existingItem ? existingItem.id : crypto.randomUUID(),
        model,
        wheelchairType,
        createdAt: existingItem ? existingItem.createdAt : now,
        updatedAt: now
    };
}

function stockStatus(item) {
    if (item.currentStock <= 0) {
        return "缺货";
    }

    if (item.currentStock < item.safetyStock) {
        return "低库存";
    }

    return "充足";
}

function filterFinishedModels(models, query) {
    const wheelchairType = String(query.get("wheelchairType") || "").trim();
    const keyword = String(query.get("keyword") || "").trim().toLowerCase();

    return models.filter((item) => {
        const itemWheelchairType = normalizeWheelchairType(item.wheelchairType, item.model);

        if (wheelchairType && itemWheelchairType !== wheelchairType) {
            return false;
        }

        if (keyword && !String(item.model || "").toLowerCase().includes(keyword)) {
            return false;
        }

        return true;
    }).map((item) => ({
        ...item,
        wheelchairType: normalizeWheelchairType(item.wheelchairType, item.model)
    })).sort((a, b) => a.model.localeCompare(b.model, "zh-CN"));
}

function filterFinishedGoods(goods, query) {
    const keyword = String(query.get("keyword") || "").trim().toLowerCase();
    const category = String(query.get("category") || "").trim();
    const wheelchairType = String(query.get("wheelchairType") || "").trim();
    const status = String(query.get("status") || "").trim();

    return goods.filter((item) => {
        const itemWheelchairType = normalizeWheelchairType(item.wheelchairType, item.model);

        if (keyword) {
            const haystack = `${item.sku} ${item.model} ${item.location} ${item.batchNo}`.toLowerCase();

            if (!haystack.includes(keyword)) {
                return false;
            }
        }

        if (category && item.category !== category) {
            return false;
        }

        if (wheelchairType && itemWheelchairType !== wheelchairType) {
            return false;
        }

        if (status && stockStatus(item) !== status) {
            return false;
        }

        return true;
    }).map((item) => ({
        ...item,
        wheelchairType: normalizeWheelchairType(item.wheelchairType, item.model),
        status: stockStatus(item)
    })).sort((a, b) => a.model.localeCompare(b.model, "zh-CN"));
}

function sendFinishedGoodsCsv(res, goods) {
    const headers = ["成品编号", "产品型号", "类型", "分类", "当前库存", "安全库存", "单位", "状态", "库位", "批次", "备注", "更新时间"];
    const rows = goods.map((item) => [
        item.sku,
        item.model,
        normalizeWheelchairType(item.wheelchairType, item.model) === "electric" ? "电动轮椅" : "手动轮椅",
        item.category,
        item.currentStock,
        item.safetyStock,
        item.unit,
        stockStatus(item),
        item.location,
        item.batchNo,
        item.remark,
        item.updatedAt
    ]);
    const csv = "\uFEFF" + [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const filename = encodeURIComponent(`成品库存导出-${new Date().toISOString().slice(0, 10)}.csv`);

    res.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${filename}`
    });
    res.end(csv);
}

async function handleApi(req, res, url) {
    if (url.pathname === "/api/me" && req.method === "GET") {
        const employee = getSessionUser(req);

        if (!employee) {
            sendJson(res, 200, { loggedIn: false, user: null });
            return;
        }

        sendJson(res, 200, { loggedIn: true, user: publicEmployee(employee) });
        return;
    }

    if (url.pathname === "/api/login" && req.method === "POST") {
        const body = await readBody(req);
        const username = String(body.username || "").trim();
        const password = String(body.password || "");
        const employee = readEmployees().find((item) => item.username === username && item.active !== false);

        if (!employee || !verifyPassword(password, employee.passwordHash)) {
            sendJson(res, 401, { message: "账号或密码错误" });
            return;
        }

        const token = createSession(employee);

        sendJson(res, 200, {
            message: "登录成功",
            user: publicEmployee(employee)
        }, {
            "Set-Cookie": `session=${token}; HttpOnly; Path=/; Max-Age=${sessionMaxAgeSeconds}; SameSite=Lax`
        });
        return;
    }

    if (url.pathname === "/api/logout" && req.method === "POST") {
        const token = parseCookies(req).session;

        if (token) {
            sessions.delete(token);
        }

        sendJson(res, 200, { message: "已退出登录" }, {
            "Set-Cookie": "session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax"
        });
        return;
    }

    if (url.pathname === "/api/employees" && req.method === "GET") {
        const user = requireEmployeeAccess(req, res);

        if (!user) {
            return;
        }

        sendJson(res, 200, { employees: readEmployees().map(publicEmployee) });
        return;
    }

    if (url.pathname === "/api/employees" && req.method === "POST") {
        const user = requireEmployeeAccess(req, res);

        if (!user) {
            return;
        }

        const body = await readBody(req);
        const username = String(body.username || "").trim();
        const password = String(body.password || "");
        const name = String(body.name || "").trim();
        const department = String(body.department || "").trim();
        const role = String(body.role || "普通员工").trim();
        const permissions = Array.isArray(body.permissions) ? body.permissions : [];

        if (!username || !password || !name || !department) {
            sendJson(res, 400, { message: "请填写账号、密码、姓名和部门" });
            return;
        }

        if (password.length < 6) {
            sendJson(res, 400, { message: "密码至少需要6位" });
            return;
        }

        const employees = readEmployees();

        if (employees.some((employee) => employee.username === username)) {
            sendJson(res, 409, { message: "账号已存在" });
            return;
        }

        const employee = {
            id: crypto.randomUUID(),
            username,
            name,
            department,
            role,
            permissions,
            active: true,
            passwordHash: hashPassword(password),
            createdAt: new Date().toISOString()
        };

        employees.push(employee);
        writeEmployees(employees);
        sendJson(res, 201, { message: "员工已创建", employee: publicEmployee(employee) });
        return;
    }

    if (url.pathname === "/api/customer-directory" && req.method === "GET") {
        const user = requireEmployeeAccess(req, res);

        if (!user) {
            return;
        }

        const items = filterCustomerDirectory(readCustomerDirectory(), url.searchParams);
        sendJson(res, 200, { items });
        return;
    }

    if (url.pathname === "/api/customer-directory" && req.method === "POST") {
        const user = requireEmployeeAccess(req, res);

        if (!user) {
            return;
        }

        try {
            const body = await readBody(req);
            const items = readCustomerDirectory();
            const item = normalizeCustomerDirectoryItem(body);

            items.push(item);
            writeCustomerDirectory(items);
            sendJson(res, 201, { message: "资料已创建", item });
        } catch (error) {
            sendJson(res, 400, { message: error.message || "资料创建失败" });
        }

        return;
    }

    const customerDirectoryMatch = url.pathname.match(/^\/api\/customer-directory\/([^/]+)$/);

    if (customerDirectoryMatch && req.method === "PUT") {
        const user = requireEmployeeAccess(req, res);

        if (!user) {
            return;
        }

        try {
            const itemId = decodeURIComponent(customerDirectoryMatch[1]);
            const body = await readBody(req);
            const items = readCustomerDirectory();
            const index = items.findIndex((item) => item.id === itemId);

            if (index < 0) {
                sendJson(res, 404, { message: "资料不存在" });
                return;
            }

            const item = normalizeCustomerDirectoryItem(body, items[index]);
            items[index] = item;
            writeCustomerDirectory(items);
            sendJson(res, 200, { message: "资料已修改", item });
        } catch (error) {
            sendJson(res, 400, { message: error.message || "资料修改失败" });
        }

        return;
    }

    if (customerDirectoryMatch && req.method === "DELETE") {
        const user = requireEmployeeAccess(req, res);

        if (!user) {
            return;
        }

        const itemId = decodeURIComponent(customerDirectoryMatch[1]);
        const items = readCustomerDirectory();
        const nextItems = items.filter((item) => item.id !== itemId);

        if (nextItems.length === items.length) {
            sendJson(res, 404, { message: "资料不存在" });
            return;
        }

        writeCustomerDirectory(nextItems);
        sendJson(res, 200, { message: "资料已删除" });
        return;
    }

    if (url.pathname === "/api/sales-orders" && req.method === "GET") {
        const user = requireEmployeeAccess(req, res);

        if (!user) {
            return;
        }

        const orders = filterSalesOrders(readSalesOrders(), url.searchParams);
        sendJson(res, 200, { orders });
        return;
    }

    if (url.pathname === "/api/sales-orders" && req.method === "POST") {
        const user = requireEmployeeAccess(req, res);

        if (!user) {
            return;
        }

        try {
            const body = await readBody(req);
            const orders = readSalesOrders();
            const order = normalizeSalesOrder(body, user);

            orders.push(order);
            writeSalesOrders(orders);
            sendJson(res, 201, { message: "销售单已创建", order });
        } catch (error) {
            sendJson(res, 400, { message: error.message || "销售单创建失败" });
        }

        return;
    }

    if (url.pathname === "/api/sales-orders" && req.method === "DELETE") {
        const user = requireEmployeeAccess(req, res);

        if (!user) {
            return;
        }

        try {
            const body = await readBody(req);
            const ids = Array.isArray(body.ids) ? body.ids.map((id) => String(id).trim()).filter(Boolean) : [];

            if (!ids.length) {
                sendJson(res, 400, { message: "请先勾选需要删除的销售单" });
                return;
            }

            const idSet = new Set(ids);
            const orders = readSalesOrders();
            const nextOrders = orders.filter((order) => !idSet.has(order.id));
            const deletedCount = orders.length - nextOrders.length;

            if (!deletedCount) {
                sendJson(res, 404, { message: "未找到需要删除的销售单" });
                return;
            }

            writeSalesOrders(nextOrders);
            sendJson(res, 200, { message: `已删除 ${deletedCount} 条销售单`, deletedCount });
        } catch (error) {
            sendJson(res, 400, { message: error.message || "销售单删除失败" });
        }

        return;
    }

    const salesOrderMatch = url.pathname.match(/^\/api\/sales-orders\/([^/]+)$/);

    if (salesOrderMatch && req.method === "PUT") {
        const user = requireEmployeeAccess(req, res);

        if (!user) {
            return;
        }

        try {
            const orderId = decodeURIComponent(salesOrderMatch[1]);
            const body = await readBody(req);
            const orders = readSalesOrders();
            const index = orders.findIndex((order) => order.id === orderId);

            if (index < 0) {
                sendJson(res, 404, { message: "销售单不存在" });
                return;
            }

            const order = normalizeSalesOrder(body, user, orders[index]);
            orders[index] = order;
            writeSalesOrders(orders);
            sendJson(res, 200, { message: "销售单已修改", order });
        } catch (error) {
            sendJson(res, 400, { message: error.message || "销售单修改失败" });
        }

        return;
    }

    if (url.pathname === "/api/sales-orders/export" && req.method === "GET") {
        const user = requireEmployeeAccess(req, res);

        if (!user) {
            return;
        }

        const orders = filterSalesOrders(readSalesOrders(), url.searchParams);
        sendSalesOrdersCsv(res, orders);
        return;
    }

    if (url.pathname === "/api/parts" && req.method === "GET") {
        const user = requireEmployeeAccess(req, res);

        if (!user) {
            return;
        }

        const parts = filterPartsInventory(readPartsInventory(), url.searchParams);
        sendJson(res, 200, { parts });
        return;
    }

    if (url.pathname === "/api/parts" && req.method === "POST") {
        const user = requireEmployeeAccess(req, res);

        if (!user) {
            return;
        }

        try {
            const body = await readBody(req);
            const parts = readPartsInventory();

            if (parts.some((part) => part.partNo === String(body.partNo || "").trim())) {
                sendJson(res, 409, { message: "配件编号已存在" });
                return;
            }

            const part = normalizePart(body);
            parts.push(part);
            writePartsInventory(parts);
            sendJson(res, 201, { message: "配件已创建", part: { ...part, status: partStockStatus(part) } });
        } catch (error) {
            sendJson(res, 400, { message: error.message || "配件创建失败" });
        }

        return;
    }

    if (url.pathname === "/api/parts" && req.method === "DELETE") {
        const user = requireEmployeeAccess(req, res);

        if (!user) {
            return;
        }

        try {
            const body = await readBody(req);
            const ids = Array.isArray(body.ids) ? body.ids.map((id) => String(id).trim()).filter(Boolean) : [];

            if (!ids.length) {
                sendJson(res, 400, { message: "请先勾选需要删除的配件" });
                return;
            }

            const idSet = new Set(ids);
            const parts = readPartsInventory();
            const nextParts = parts.filter((part) => !idSet.has(part.id));
            const deletedCount = parts.length - nextParts.length;

            if (!deletedCount) {
                sendJson(res, 404, { message: "未找到需要删除的配件" });
                return;
            }

            writePartsInventory(nextParts);
            sendJson(res, 200, { message: `已删除 ${deletedCount} 条配件`, deletedCount });
        } catch (error) {
            sendJson(res, 400, { message: error.message || "配件删除失败" });
        }

        return;
    }

    const partMatch = url.pathname.match(/^\/api\/parts\/([^/]+)$/);

    if (partMatch && req.method === "PUT") {
        const user = requireEmployeeAccess(req, res);

        if (!user) {
            return;
        }

        try {
            const partId = decodeURIComponent(partMatch[1]);
            const body = await readBody(req);
            const parts = readPartsInventory();
            const index = parts.findIndex((part) => part.id === partId);

            if (index < 0) {
                sendJson(res, 404, { message: "配件不存在" });
                return;
            }

            if (parts.some((part) => part.id !== partId && part.partNo === String(body.partNo || "").trim())) {
                sendJson(res, 409, { message: "配件编号已存在" });
                return;
            }

            const part = normalizePart(body, parts[index]);
            parts[index] = part;
            writePartsInventory(parts);
            sendJson(res, 200, { message: "配件已修改", part: { ...part, status: partStockStatus(part) } });
        } catch (error) {
            sendJson(res, 400, { message: error.message || "配件修改失败" });
        }

        return;
    }

    const partAdjustMatch = url.pathname.match(/^\/api\/parts\/([^/]+)\/adjust$/);

    if (partAdjustMatch && req.method === "POST") {
        const user = requireEmployeeAccess(req, res);

        if (!user) {
            return;
        }

        try {
            const partId = decodeURIComponent(partAdjustMatch[1]);
            const body = await readBody(req);
            const quantity = Number(body.quantity || 0);
            const type = String(body.type || "").trim();
            const parts = readPartsInventory();
            const index = parts.findIndex((part) => part.id === partId);

            if (index < 0) {
                sendJson(res, 404, { message: "配件不存在" });
                return;
            }

            if (!Number.isFinite(quantity) || quantity <= 0) {
                sendJson(res, 400, { message: "调整数量必须大于0" });
                return;
            }

            const sign = type === "out" ? -1 : 1;
            const nextStock = parts[index].currentStock + sign * quantity;

            if (nextStock < 0) {
                sendJson(res, 400, { message: "库存不足，不能出库" });
                return;
            }

            parts[index] = {
                ...parts[index],
                currentStock: nextStock,
                updatedAt: new Date().toISOString()
            };
            writePartsInventory(parts);
            sendJson(res, 200, {
                message: type === "out" ? "出库完成" : "入库完成",
                part: { ...parts[index], status: partStockStatus(parts[index]) }
            });
        } catch (error) {
            sendJson(res, 400, { message: error.message || "库存调整失败" });
        }

        return;
    }

    if (url.pathname === "/api/parts/export" && req.method === "GET") {
        const user = requireEmployeeAccess(req, res);

        if (!user) {
            return;
        }

        const parts = filterPartsInventory(readPartsInventory(), url.searchParams);
        sendPartsCsv(res, parts);
        return;
    }

    if (url.pathname === "/api/finished-models" && req.method === "GET") {
        const user = requireEmployeeAccess(req, res);

        if (!user) {
            return;
        }

        const models = filterFinishedModels(readFinishedModels(), url.searchParams);
        sendJson(res, 200, { models });
        return;
    }

    if (url.pathname === "/api/finished-models" && req.method === "POST") {
        const user = requireEmployeeAccess(req, res);

        if (!user) {
            return;
        }

        try {
            const body = await readBody(req);
            const item = normalizeFinishedModel(body);
            const models = readFinishedModels();
            const duplicated = models.some((entry) => {
                const entryType = normalizeWheelchairType(entry.wheelchairType, entry.model);
                return entryType === item.wheelchairType && String(entry.model || "").trim() === item.model;
            });

            if (duplicated) {
                sendJson(res, 409, { message: "成品型号已存在" });
                return;
            }

            models.push(item);
            writeFinishedModels(models);
            sendJson(res, 201, { message: "成品型号已创建", item });
        } catch (error) {
            sendJson(res, 400, { message: error.message || "成品型号创建失败" });
        }

        return;
    }

    if (url.pathname === "/api/finished-models" && req.method === "DELETE") {
        const user = requireEmployeeAccess(req, res);

        if (!user) {
            return;
        }

        try {
            const body = await readBody(req);
            const ids = Array.isArray(body.ids) ? body.ids.map((id) => String(id).trim()).filter(Boolean) : [];

            if (!ids.length) {
                sendJson(res, 400, { message: "请先选择需要删除的成品型号" });
                return;
            }

            const idSet = new Set(ids);
            const models = readFinishedModels();
            const nextModels = models.filter((item) => !idSet.has(item.id));
            const deletedCount = models.length - nextModels.length;

            if (!deletedCount) {
                sendJson(res, 404, { message: "未找到需要删除的成品型号" });
                return;
            }

            writeFinishedModels(nextModels);
            sendJson(res, 200, { message: `已删除 ${deletedCount} 个成品型号`, deletedCount });
        } catch (error) {
            sendJson(res, 400, { message: error.message || "成品型号删除失败" });
        }

        return;
    }

    const finishedModelMatch = url.pathname.match(/^\/api\/finished-models\/([^/]+)$/);

    if (finishedModelMatch && req.method === "PUT") {
        const user = requireEmployeeAccess(req, res);

        if (!user) {
            return;
        }

        try {
            const itemId = decodeURIComponent(finishedModelMatch[1]);
            const body = await readBody(req);
            const models = readFinishedModels();
            const index = models.findIndex((item) => item.id === itemId);

            if (index < 0) {
                sendJson(res, 404, { message: "成品型号不存在" });
                return;
            }

            const item = normalizeFinishedModel(body, models[index]);
            const duplicated = models.some((entry) => {
                const entryType = normalizeWheelchairType(entry.wheelchairType, entry.model);
                return entry.id !== itemId && entryType === item.wheelchairType && String(entry.model || "").trim() === item.model;
            });

            if (duplicated) {
                sendJson(res, 409, { message: "成品型号已存在" });
                return;
            }

            models[index] = item;
            writeFinishedModels(models);
            sendJson(res, 200, { message: "成品型号已修改", item });
        } catch (error) {
            sendJson(res, 400, { message: error.message || "成品型号修改失败" });
        }

        return;
    }

    if (url.pathname === "/api/finished-goods" && req.method === "GET") {
        const user = requireEmployeeAccess(req, res);

        if (!user) {
            return;
        }

        const goods = filterFinishedGoods(readFinishedGoods(), url.searchParams);
        sendJson(res, 200, { goods });
        return;
    }

    if (url.pathname === "/api/finished-goods" && req.method === "POST") {
        const user = requireEmployeeAccess(req, res);

        if (!user) {
            return;
        }

        try {
            const body = await readBody(req);
            const goods = readFinishedGoods();

            const requestedSku = String(body.sku || "").trim();

            if (requestedSku && goods.some((item) => item.sku === requestedSku)) {
                sendJson(res, 409, { message: "成品编号已存在" });
                return;
            }

            const item = normalizeFinishedGood(body);
            goods.push(item);
            writeFinishedGoods(goods);
            sendJson(res, 201, { message: "成品已创建", item: { ...item, status: stockStatus(item) } });
        } catch (error) {
            sendJson(res, 400, { message: error.message || "成品创建失败" });
        }

        return;
    }

    if (url.pathname === "/api/finished-goods" && req.method === "DELETE") {
        const user = requireEmployeeAccess(req, res);

        if (!user) {
            return;
        }

        try {
            const body = await readBody(req);
            const ids = Array.isArray(body.ids) ? body.ids.map((id) => String(id).trim()).filter(Boolean) : [];

            if (!ids.length) {
                sendJson(res, 400, { message: "请先勾选需要删除的成品" });
                return;
            }

            const idSet = new Set(ids);
            const goods = readFinishedGoods();
            const nextGoods = goods.filter((item) => !idSet.has(item.id));
            const deletedCount = goods.length - nextGoods.length;

            if (!deletedCount) {
                sendJson(res, 404, { message: "未找到需要删除的成品" });
                return;
            }

            writeFinishedGoods(nextGoods);
            sendJson(res, 200, { message: `已删除 ${deletedCount} 条成品`, deletedCount });
        } catch (error) {
            sendJson(res, 400, { message: error.message || "成品删除失败" });
        }

        return;
    }

    const finishedGoodMatch = url.pathname.match(/^\/api\/finished-goods\/([^/]+)$/);

    if (finishedGoodMatch && req.method === "PUT") {
        const user = requireEmployeeAccess(req, res);

        if (!user) {
            return;
        }

        try {
            const itemId = decodeURIComponent(finishedGoodMatch[1]);
            const body = await readBody(req);
            const goods = readFinishedGoods();
            const index = goods.findIndex((item) => item.id === itemId);

            if (index < 0) {
                sendJson(res, 404, { message: "成品不存在" });
                return;
            }

            const requestedSku = String(body.sku || "").trim();

            if (requestedSku && goods.some((item) => item.id !== itemId && item.sku === requestedSku)) {
                sendJson(res, 409, { message: "成品编号已存在" });
                return;
            }

            const item = normalizeFinishedGood(body, goods[index]);
            goods[index] = item;
            writeFinishedGoods(goods);
            sendJson(res, 200, { message: "成品已修改", item: { ...item, status: stockStatus(item) } });
        } catch (error) {
            sendJson(res, 400, { message: error.message || "成品修改失败" });
        }

        return;
    }

    const finishedGoodAdjustMatch = url.pathname.match(/^\/api\/finished-goods\/([^/]+)\/adjust$/);

    if (finishedGoodAdjustMatch && req.method === "POST") {
        const user = requireEmployeeAccess(req, res);

        if (!user) {
            return;
        }

        try {
            const itemId = decodeURIComponent(finishedGoodAdjustMatch[1]);
            const body = await readBody(req);
            const quantity = Number(body.quantity || 0);
            const type = String(body.type || "").trim();
            const goods = readFinishedGoods();
            const index = goods.findIndex((item) => item.id === itemId);

            if (index < 0) {
                sendJson(res, 404, { message: "成品不存在" });
                return;
            }

            if (!Number.isFinite(quantity) || quantity <= 0) {
                sendJson(res, 400, { message: "调整数量必须大于0" });
                return;
            }

            const sign = type === "out" ? -1 : 1;
            const nextStock = goods[index].currentStock + sign * quantity;

            if (nextStock < 0) {
                sendJson(res, 400, { message: "库存不足，不能出库" });
                return;
            }

            goods[index] = {
                ...goods[index],
                currentStock: nextStock,
                updatedAt: new Date().toISOString()
            };
            writeFinishedGoods(goods);
            sendJson(res, 200, {
                message: type === "out" ? "成品出库完成" : "成品入库完成",
                item: { ...goods[index], status: stockStatus(goods[index]) }
            });
        } catch (error) {
            sendJson(res, 400, { message: error.message || "成品库存调整失败" });
        }

        return;
    }

    if (url.pathname === "/api/finished-goods/export" && req.method === "GET") {
        const user = requireEmployeeAccess(req, res);

        if (!user) {
            return;
        }

        const goods = filterFinishedGoods(readFinishedGoods(), url.searchParams);
        sendFinishedGoodsCsv(res, goods);
        return;
    }

    sendJson(res, 404, { message: "接口不存在" });
}

function serveStatic(req, res, url) {
    let requestedPath = decodeURIComponent(url.pathname);

    if (requestedPath === "/") {
        requestedPath = "/index.html";
    }

    if (requestedPath === "/staff.html") {
        const user = getSessionUser(req);

        if (!user) {
            redirect(res, "/login.html?next=staff.html");
            return;
        }

        if (!hasPermission(user, "employee")) {
            redirect(res, "/index.html?denied=1");
            return;
        }
    }

    const filePath = path.normalize(path.join(rootDir, requestedPath));

    if (!filePath.startsWith(rootDir)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
    }

    fs.readFile(filePath, (error, content) => {
        if (error) {
            res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
            res.end("文件不存在");
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { "Content-Type": contentTypes[ext] || "application/octet-stream" });
        res.end(content);
    });
}

ensureDataStore();

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    try {
        if (url.pathname.startsWith("/api/")) {
            await handleApi(req, res, url);
            return;
        }

        serveStatic(req, res, url);
    } catch (error) {
        sendJson(res, 500, { message: error.message || "服务器错误" });
    }
});

server.listen(port, "0.0.0.0", () => {
    console.log(`公司网站已启动: http://localhost:${port}/index.html`);
    console.log("局域网员工访问时，请使用这台电脑的IP地址加端口号，例如 http://你的IP:3000/index.html");
});
