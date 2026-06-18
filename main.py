import hashlib
import hmac
import json
import os
import re
import secrets
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.exception_handlers import http_exception_handler
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from product_search import build_recommendation_answer, search_products
from requirement_parser import get_last_parse_source, parse_user_requirement

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - production requirements include python-dotenv
    load_dotenv = None


ROOT_DIR = Path(__file__).resolve().parent
if load_dotenv:
    load_dotenv(ROOT_DIR / ".env")

DATA_DIR = Path(os.getenv("DATA_DIR") or ROOT_DIR / "data")
EMPLOYEES_FILE = DATA_DIR / "employees.json"
SALES_ORDERS_FILE = DATA_DIR / "sales-orders.json"
PARTS_INVENTORY_FILE = DATA_DIR / "parts-inventory.json"
FINISHED_GOODS_FILE = DATA_DIR / "finished-goods.json"
FINISHED_MODELS_FILE = DATA_DIR / "finished-models.json"
CUSTOMER_DIRECTORY_FILE = DATA_DIR / "customer-directory.json"

SESSION_COOKIE = "session"
SESSION_MAX_AGE_SECONDS = int(os.getenv("SESSION_MAX_AGE_SECONDS") or 60 * 60 * 8)
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "").lower() in {"1", "true", "yes"}
SALES_STATUS_FLOW = ["待打印", "待发货", "已发货（待确认）", "已完成"]

sessions: dict[str, dict[str, Any]] = {}
app = FastAPI(title="Wheelchair Website Backend", docs_url=None, redoc_url=None)


class ChatRequest(BaseModel):
    message: str


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"请在 .env 或系统环境变量中配置 {name}。")
    return value


def read_json_file(file_path: Path) -> list[dict[str, Any]]:
    if not file_path.exists():
        return []
    with file_path.open("r", encoding="utf-8-sig") as file:
        data = json.load(file)
    return data if isinstance(data, list) else []


def write_json_file(file_path: Path, items: list[dict[str, Any]]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp_path = file_path.with_suffix(file_path.suffix + ".tmp")
    with tmp_path.open("w", encoding="utf-8") as file:
        json.dump(items, file, ensure_ascii=False, indent=2)
        file.write("\n")
    tmp_path.replace(file_path)


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt.encode("utf-8"), n=16384, r=8, p=1, dklen=64)
    return f"scrypt${salt}${digest.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    parts = str(stored_hash or "").split("$")
    if len(parts) != 3 or parts[0] != "scrypt":
        return False
    _, salt, digest_hex = parts
    try:
        expected = bytes.fromhex(digest_hex)
        actual = hashlib.scrypt(password.encode("utf-8"), salt=salt.encode("utf-8"), n=16384, r=8, p=1, dklen=64)
    except (TypeError, ValueError):
        return False
    return hmac.compare_digest(actual, expected)


def seed_customer_directory() -> list[dict[str, Any]]:
    now = now_iso()
    return [
        {"id": str(uuid.uuid4()), "kind": "customer", "name": "上海长海医院", "contact": "采购科", "phone": "021-55556666", "label": "医院客户", "address": "上海市杨浦区长海路", "status": "启用", "remark": "优先安排发票和批量配送", "createdAt": now, "updatedAt": now},
        {"id": str(uuid.uuid4()), "kind": "customer", "name": "王女士", "contact": "王女士", "phone": "13800008888", "label": "个人客户", "address": "北京市朝阳区", "status": "待跟进", "remark": "关注电动轮椅续航", "createdAt": now, "updatedAt": now},
        {"id": str(uuid.uuid4()), "kind": "dealer", "name": "北京瑞康医疗器械店", "contact": "刘经理", "phone": "010-88886666", "label": "华北区域", "address": "月结30天", "status": "启用", "remark": "重点经销商", "createdAt": now, "updatedAt": now},
        {"id": str(uuid.uuid4()), "kind": "dealer", "name": "宁波康复用品中心", "contact": "陈经理", "phone": "0574-66228888", "label": "浙江区域", "address": "现结", "status": "启用", "remark": "常订手动折叠款", "createdAt": now, "updatedAt": now},
        {"id": str(uuid.uuid4()), "kind": "sender", "name": "常州电池供应商", "contact": "周经理", "phone": "0519-66228888", "label": "电池配件", "address": "月结30天", "status": "启用", "remark": "常供24V锂电池", "createdAt": now, "updatedAt": now},
        {"id": str(uuid.uuid4()), "kind": "sender", "name": "宁波五金配件供应商", "contact": "张经理", "phone": "0574-88996666", "label": "五金件", "address": "现结", "status": "启用", "remark": "常供轮组和车架配件", "createdAt": now, "updatedAt": now},
    ]


def seed_sales_orders() -> list[dict[str, Any]]:
    now = now_iso()
    return [
        {"id": str(uuid.uuid4()), "orderNo": "SO-20260529-001", "orderDate": "2026-05-29", "orderTime": "09:30", "customerName": "北京瑞康医疗器械店", "customerPhone": "010-88886666", "customerType": "经销商", "wheelchairType": "electric", "productModel": "JL-E100 电动折叠", "quantity": 5, "unitPrice": 6800, "amount": 34000, "status": "待发货", "remark": "优先安排物流", "createdBy": "admin", "createdByName": "管理员", "createdAt": now, "updatedAt": now},
        {"id": str(uuid.uuid4()), "orderNo": "SO-20260528-004", "orderDate": "2026-05-28", "orderTime": "14:10", "customerName": "上海长海医院", "customerPhone": "021-55556666", "customerType": "客户", "wheelchairType": "manual", "productModel": "JL-M300 全躺护理", "quantity": 20, "unitPrice": 3200, "amount": 64000, "status": "已发货（待确认）", "remark": "", "createdBy": "admin", "createdByName": "管理员", "createdAt": now, "updatedAt": now},
    ]


def seed_parts_inventory() -> list[dict[str, Any]]:
    now = now_iso()
    return [
        {"id": str(uuid.uuid4()), "partNo": "P-BAT-24V20AH", "name": "24V 20AH 锂电池", "category": "电池电控", "wheelchairType": "electric", "currentStock": 8, "safetyStock": 20, "unit": "块", "location": "A区-01", "supplier": "宁波动力电池", "remark": "电动轮椅通用", "updatedAt": now},
        {"id": str(uuid.uuid4()), "partNo": "P-JOY-360", "name": "360度智能摇杆", "category": "电池电控", "wheelchairType": "electric", "currentStock": 15, "safetyStock": 30, "unit": "个", "location": "A区-02", "supplier": "杭州智控", "remark": "", "updatedAt": now},
        {"id": str(uuid.uuid4()), "partNo": "P-WHL-F8", "name": "8寸前置万向轮", "category": "轮组", "wheelchairType": "manual", "currentStock": 24, "safetyStock": 40, "unit": "个", "location": "B区-03", "supplier": "霸州轮业", "remark": "手动/电动通用", "updatedAt": now},
        {"id": str(uuid.uuid4()), "partNo": "P-BRK-EM", "name": "电磁刹车组件", "category": "制动安全", "wheelchairType": "electric", "currentStock": 18, "safetyStock": 25, "unit": "套", "location": "C区-01", "supplier": "苏州制动", "remark": "电动系列", "updatedAt": now},
        {"id": str(uuid.uuid4()), "partNo": "P-CUS-HONEY", "name": "蜂窝透气坐垫", "category": "坐垫靠背", "wheelchairType": "manual", "currentStock": 150, "safetyStock": 50, "unit": "套", "location": "D区-02", "supplier": "广州康垫", "remark": "", "updatedAt": now},
    ]


def seed_finished_goods() -> list[dict[str, Any]]:
    now = now_iso()
    return [
        {"id": str(uuid.uuid4()), "sku": "FG-E100", "model": "JL-E100 电动折叠", "wheelchairType": "electric", "category": "电动折叠", "currentStock": 12, "safetyStock": 8, "unit": "台", "location": "成品A区-01", "batchNo": "B202605-E100", "remark": "城市轻便款", "updatedAt": now},
        {"id": str(uuid.uuid4()), "sku": "FG-E200", "model": "JL-E200 全地形越野", "wheelchairType": "electric", "category": "全地形", "currentStock": 6, "safetyStock": 6, "unit": "台", "location": "成品A区-02", "batchNo": "B202605-E200", "remark": "", "updatedAt": now},
        {"id": str(uuid.uuid4()), "sku": "FG-M100", "model": "JL-M100 超轻折叠", "wheelchairType": "manual", "category": "手动折叠", "currentStock": 28, "safetyStock": 15, "unit": "台", "location": "成品B区-01", "batchNo": "B202605-M100", "remark": "轻量便携", "updatedAt": now},
        {"id": str(uuid.uuid4()), "sku": "FG-M300", "model": "JL-M300 全躺护理", "wheelchairType": "manual", "category": "护理型", "currentStock": 9, "safetyStock": 12, "unit": "台", "location": "成品B区-02", "batchNo": "B202605-M300", "remark": "医院常用", "updatedAt": now},
    ]


def seed_finished_models() -> list[dict[str, Any]]:
    now = now_iso()
    return [
        {"id": str(uuid.uuid4()), "model": "JL-E100 电动折叠", "wheelchairType": "electric", "createdAt": now, "updatedAt": now},
        {"id": str(uuid.uuid4()), "model": "JL-E200 全地形越野", "wheelchairType": "electric", "createdAt": now, "updatedAt": now},
        {"id": str(uuid.uuid4()), "model": "JL-M100 超轻折叠", "wheelchairType": "manual", "createdAt": now, "updatedAt": now},
        {"id": str(uuid.uuid4()), "model": "JL-M300 全躺护理", "wheelchairType": "manual", "createdAt": now, "updatedAt": now},
    ]


def ensure_data_store() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not EMPLOYEES_FILE.exists():
        employees = [
            {"id": str(uuid.uuid4()), "username": "admin", "name": "管理员", "department": "管理部", "role": "系统管理员", "permissions": ["employee"], "active": True, "passwordHash": hash_password(required_env("ADMIN_INITIAL_PASSWORD")), "createdAt": now_iso()},
            {"id": str(uuid.uuid4()), "username": "customer", "name": "客户", "department": "客户", "role": "客户", "permissions": [], "active": True, "passwordHash": hash_password(required_env("CUSTOMER_INITIAL_PASSWORD")), "createdAt": now_iso()},
            {"id": str(uuid.uuid4()), "username": "staff", "name": "普通员工", "department": "销售部", "role": "普通员工", "permissions": [], "active": True, "passwordHash": hash_password(required_env("STAFF_INITIAL_PASSWORD")), "createdAt": now_iso()},
        ]
        write_json_file(EMPLOYEES_FILE, employees)
    defaults = {
        SALES_ORDERS_FILE: seed_sales_orders,
        PARTS_INVENTORY_FILE: seed_parts_inventory,
        FINISHED_GOODS_FILE: seed_finished_goods,
        FINISHED_MODELS_FILE: seed_finished_models,
        CUSTOMER_DIRECTORY_FILE: seed_customer_directory,
    }
    for file_path, seed_func in defaults.items():
        if not file_path.exists():
            write_json_file(file_path, seed_func())


def read_employees() -> list[dict[str, Any]]:
    ensure_data_store()
    return read_json_file(EMPLOYEES_FILE)


def write_employees(items: list[dict[str, Any]]) -> None:
    write_json_file(EMPLOYEES_FILE, items)


def read_sales_orders() -> list[dict[str, Any]]:
    ensure_data_store()
    return read_json_file(SALES_ORDERS_FILE)


def write_sales_orders(items: list[dict[str, Any]]) -> None:
    write_json_file(SALES_ORDERS_FILE, items)


def read_parts_inventory() -> list[dict[str, Any]]:
    ensure_data_store()
    return read_json_file(PARTS_INVENTORY_FILE)


def write_parts_inventory(items: list[dict[str, Any]]) -> None:
    write_json_file(PARTS_INVENTORY_FILE, items)


def read_finished_goods() -> list[dict[str, Any]]:
    ensure_data_store()
    return read_json_file(FINISHED_GOODS_FILE)


def write_finished_goods(items: list[dict[str, Any]]) -> None:
    write_json_file(FINISHED_GOODS_FILE, items)


def read_finished_models() -> list[dict[str, Any]]:
    ensure_data_store()
    return read_json_file(FINISHED_MODELS_FILE)


def write_finished_models(items: list[dict[str, Any]]) -> None:
    write_json_file(FINISHED_MODELS_FILE, items)


def read_customer_directory() -> list[dict[str, Any]]:
    ensure_data_store()
    return read_json_file(CUSTOMER_DIRECTORY_FILE)


def write_customer_directory(items: list[dict[str, Any]]) -> None:
    write_json_file(CUSTOMER_DIRECTORY_FILE, items)


def public_employee(employee: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": employee.get("id", ""),
        "username": employee.get("username", ""),
        "name": employee.get("name", ""),
        "department": employee.get("department", ""),
        "role": employee.get("role", ""),
        "permissions": employee.get("permissions") if isinstance(employee.get("permissions"), list) else [],
        "active": employee.get("active") is not False,
        "createdAt": employee.get("createdAt", ""),
    }


def create_session(employee: dict[str, Any]) -> str:
    token = secrets.token_hex(32)
    sessions[token] = {"employeeId": employee.get("id"), "expiresAt": datetime.now(timezone.utc).timestamp() + SESSION_MAX_AGE_SECONDS}
    return token


def get_session_user(request: Request) -> dict[str, Any] | None:
    token = request.cookies.get(SESSION_COOKIE)
    if not token or token not in sessions:
        return None
    session = sessions[token]
    if session["expiresAt"] < datetime.now(timezone.utc).timestamp():
        sessions.pop(token, None)
        return None
    return next((item for item in read_employees() if item.get("id") == session["employeeId"] and item.get("active") is not False), None)


def has_permission(employee: dict[str, Any] | None, permission: str) -> bool:
    return bool(employee and isinstance(employee.get("permissions"), list) and permission in employee["permissions"])


def require_employee_access(request: Request) -> dict[str, Any]:
    user = get_session_user(request)
    if not has_permission(user, "employee"):
        raise HTTPException(status_code=403, detail="您无权访问")
    return user


async def read_body(request: Request) -> dict[str, Any]:
    try:
        body = await request.json()
    except Exception as error:
        raise HTTPException(status_code=400, detail="JSON格式错误") from error
    return body if isinstance(body, dict) else {}


def normalize_sales_status(status: Any) -> str:
    value = str(status or "").strip()
    mapping = {"待确认": "待打印", "pending": "待打印", "已发货": "已发货（待确认）", "shipped": "已发货（待确认）", "已取消": "已完成"}
    normalized = mapping.get(value, value or "待打印")
    return normalized if normalized in SALES_STATUS_FLOW else "待打印"


def normalize_wheelchair_type(value: Any, product_model: Any = "") -> str:
    wheelchair_type = str(value or "").strip()
    if wheelchair_type in {"manual", "electric"}:
        return wheelchair_type
    model = str(product_model or "").lower()
    if any(keyword in model for keyword in ("jl-e", "电动", "电池", "电控", "摇杆", "电磁")):
        return "electric"
    return "manual"


def generate_order_no(order_date: str) -> str:
    prefix = f"SO-{re.sub(r'\\D', '', order_date)}-"
    today_count = sum(1 for order in read_sales_orders() if str(order.get("orderNo", "")).startswith(prefix)) + 1
    return f"{prefix}{today_count:03d}"


def normalize_sales_order(body: dict[str, Any], user: dict[str, Any], existing: dict[str, Any] | None = None) -> dict[str, Any]:
    order_date = str(body.get("orderDate") or "").strip()
    order_time = str(body.get("orderTime") or "").strip()
    customer_name = str(body.get("customerName") or "").strip()
    customer_phone = str(body.get("customerPhone") or "").strip()
    raw_customer_type = str(body.get("customerType") or "客户").strip()
    customer_type = raw_customer_type if raw_customer_type in {"客户", "网站客户", "经销商"} else "客户"
    product_model = str(body.get("productModel") or "").strip()
    quantity = float(body.get("quantity") or 0)
    unit_price = float(body.get("unitPrice") or 0)
    if not order_date or not order_time or not customer_name or not product_model:
        raise HTTPException(status_code=400, detail="请填写日期、时间、客户名称和产品型号")
    if quantity <= 0:
        raise HTTPException(status_code=400, detail="数量必须大于0")
    if unit_price < 0:
        raise HTTPException(status_code=400, detail="单价不能小于0")
    now = now_iso()
    return {
        "id": existing.get("id") if existing else str(uuid.uuid4()),
        "orderNo": existing.get("orderNo") if existing else generate_order_no(order_date),
        "orderDate": order_date,
        "orderTime": order_time,
        "customerName": customer_name,
        "customerPhone": customer_phone,
        "customerType": customer_type,
        "wheelchairType": normalize_wheelchair_type(body.get("wheelchairType"), product_model),
        "productModel": product_model,
        "quantity": quantity,
        "unitPrice": unit_price,
        "amount": round(quantity * unit_price, 2),
        "status": normalize_sales_status(body.get("status") or "待打印"),
        "remark": str(body.get("remark") or "").strip(),
        "createdBy": existing.get("createdBy") if existing else user.get("username", ""),
        "createdByName": existing.get("createdByName") if existing else user.get("name", ""),
        "createdAt": existing.get("createdAt") if existing else now,
        "updatedAt": now,
    }


def filter_sales_orders(orders: list[dict[str, Any]], query: Any) -> list[dict[str, Any]]:
    start_date = query.get("startDate")
    end_date = query.get("endDate")
    customer = str(query.get("customer") or "").strip().lower()
    customer_type = str(query.get("customerType") or "").strip()
    product = str(query.get("product") or "").strip().lower()
    remark = str(query.get("remark") or "").strip().lower()
    wheelchair_type = str(query.get("wheelchairType") or "").strip()
    status = normalize_sales_status(query.get("status") or "")
    ids = [item.strip() for item in str(query.get("ids") or "").split(",") if item.strip()]
    has_query = any(key not in {"ids", "wheelchairType"} for key in query.keys())

    def match(order: dict[str, Any]) -> bool:
        order_status = normalize_sales_status(order.get("status"))
        order_type = normalize_wheelchair_type(order.get("wheelchairType"), order.get("productModel"))
        haystack = f"{order.get('customerName', '')} {order.get('customerPhone', '')} {order.get('customerType', '')}".lower()
        return not (
            (ids and order.get("id") not in ids)
            or (not ids and not has_query and order_status == "已完成")
            or (start_date and str(order.get("orderDate", "")) < start_date)
            or (end_date and str(order.get("orderDate", "")) > end_date)
            or (customer and customer not in haystack)
            or (customer_type and order.get("customerType") != customer_type)
            or (product and product not in str(order.get("productModel", "")).lower())
            or (remark and remark not in str(order.get("remark", "")).lower())
            or (wheelchair_type and order_type != wheelchair_type)
            or (query.get("status") and order_status != status)
        )

    rows = [{**order, "status": normalize_sales_status(order.get("status")), "wheelchairType": normalize_wheelchair_type(order.get("wheelchairType"), order.get("productModel"))} for order in orders if match(order)]
    return sorted(rows, key=lambda order: f"{order.get('orderDate', '')} {order.get('orderTime', '')}", reverse=True)


def normalize_customer_directory_item(body: dict[str, Any], existing: dict[str, Any] | None = None) -> dict[str, Any]:
    kind = str(body.get("kind") or (existing or {}).get("kind") or "customer").strip()
    if kind not in {"customer", "dealer", "sender"}:
        raise HTTPException(status_code=400, detail="资料类型不正确")
    name = str(body.get("name") or "").strip()
    contact = str(body.get("contact") or "").strip()
    phone = str(body.get("phone") or "").strip()
    if not name or not contact or not phone:
        raise HTTPException(status_code=400, detail="请填写名称、联系人和联系电话")
    raw_status = str(body.get("status") or "启用").strip()
    now = now_iso()
    return {
        "id": existing.get("id") if existing else str(uuid.uuid4()),
        "kind": kind,
        "name": name,
        "contact": contact,
        "phone": phone,
        "label": str(body.get("label") or "").strip(),
        "address": str(body.get("address") or "").strip(),
        "status": raw_status if raw_status in {"启用", "停用", "待跟进"} else "启用",
        "remark": str(body.get("remark") or "").strip(),
        "createdAt": existing.get("createdAt") if existing else now,
        "updatedAt": now,
    }


def filter_customer_directory(items: list[dict[str, Any]], query: Any) -> list[dict[str, Any]]:
    kind = str(query.get("kind") or "").strip()
    keyword = str(query.get("keyword") or "").strip().lower()
    status = str(query.get("status") or "").strip()

    def match(item: dict[str, Any]) -> bool:
        haystack = " ".join(str(item.get(field, "")) for field in ("name", "contact", "phone", "label", "address", "status", "remark")).lower()
        return not ((kind and item.get("kind") != kind) or (status and item.get("status") != status) or (keyword and keyword not in haystack))

    return sorted([item for item in items if match(item)], key=lambda item: str(item.get("updatedAt", "")), reverse=True)


def normalize_part(body: dict[str, Any], existing: dict[str, Any] | None = None) -> dict[str, Any]:
    part_no = str(body.get("partNo") or "").strip()
    name = str(body.get("name") or "").strip()
    if not part_no or not name:
        raise HTTPException(status_code=400, detail="请填写配件编号和配件名称")
    current_stock = float(body.get("currentStock") or 0)
    safety_stock = float(body.get("safetyStock") or 0)
    if current_stock < 0 or safety_stock < 0:
        raise HTTPException(status_code=400, detail="库存不能小于0")
    return {
        "id": existing.get("id") if existing else str(uuid.uuid4()),
        "partNo": part_no,
        "name": name,
        "category": str(body.get("category") or "其他").strip(),
        "wheelchairType": normalize_wheelchair_type(body.get("wheelchairType"), f"{name} {body.get('remark', '')} {body.get('category', '')}"),
        "currentStock": current_stock,
        "safetyStock": safety_stock,
        "unit": str(body.get("unit") or "个").strip(),
        "location": str(body.get("location") or "").strip(),
        "supplier": str(body.get("supplier") or "").strip(),
        "remark": str(body.get("remark") or "").strip(),
        "updatedAt": now_iso(),
    }


def part_stock_status(part: dict[str, Any]) -> str:
    if float(part.get("currentStock") or 0) <= 0:
        return "缺货"
    if float(part.get("currentStock") or 0) < float(part.get("safetyStock") or 0):
        return "低库存"
    return "充足"


def filter_parts(parts: list[dict[str, Any]], query: Any) -> list[dict[str, Any]]:
    keyword = str(query.get("keyword") or "").strip().lower()
    category = str(query.get("category") or "").strip()
    wheelchair_type = str(query.get("wheelchairType") or "").strip()
    status = str(query.get("status") or "").strip()

    def match(part: dict[str, Any]) -> bool:
        part_type = normalize_wheelchair_type(part.get("wheelchairType"), f"{part.get('name', '')} {part.get('remark', '')} {part.get('category', '')}")
        haystack = f"{part.get('partNo', '')} {part.get('name', '')} {part.get('location', '')} {part.get('supplier', '')}".lower()
        return not ((keyword and keyword not in haystack) or (category and part.get("category") != category) or (wheelchair_type and part_type != wheelchair_type) or (status and part_stock_status(part) != status))

    rows = [{**part, "wheelchairType": normalize_wheelchair_type(part.get("wheelchairType"), f"{part.get('name', '')} {part.get('remark', '')} {part.get('category', '')}"), "status": part_stock_status(part)} for part in parts if match(part)]
    return sorted(rows, key=lambda part: str(part.get("name", "")))


def generate_finished_sku(wheelchair_type: str) -> str:
    prefix = "FG-E" if wheelchair_type == "electric" else "FG-M"
    return f"{prefix}-{int(datetime.now(timezone.utc).timestamp() * 1000):X}-{str(uuid.uuid4())[:4].upper()}"


def normalize_finished_good(body: dict[str, Any], existing: dict[str, Any] | None = None) -> dict[str, Any]:
    model = str(body.get("model") or "").strip()
    if not model:
        raise HTTPException(status_code=400, detail="请填写成品型号")
    current_stock = float(body.get("currentStock") or 0)
    safety_stock = float(body.get("safetyStock") or 0)
    if current_stock < 0 or safety_stock < 0:
        raise HTTPException(status_code=400, detail="库存不能小于0")
    wheelchair_type = normalize_wheelchair_type(body.get("wheelchairType"), model)
    return {
        "id": existing.get("id") if existing else str(uuid.uuid4()),
        "sku": str(body.get("sku") or "").strip() or (existing or {}).get("sku") or generate_finished_sku(wheelchair_type),
        "model": model,
        "wheelchairType": wheelchair_type,
        "category": str(body.get("category") or "其他").strip(),
        "currentStock": current_stock,
        "safetyStock": safety_stock,
        "unit": str(body.get("unit") or "台").strip(),
        "location": str(body.get("location") or "").strip(),
        "batchNo": str(body.get("batchNo") or "").strip(),
        "remark": str(body.get("remark") or "").strip(),
        "updatedAt": now_iso(),
    }


def normalize_finished_model(body: dict[str, Any], existing: dict[str, Any] | None = None) -> dict[str, Any]:
    model = str(body.get("model") or "").strip()
    if not model:
        raise HTTPException(status_code=400, detail="请填写成品型号")
    now = now_iso()
    return {
        "id": existing.get("id") if existing else str(uuid.uuid4()),
        "model": model,
        "wheelchairType": normalize_wheelchair_type(body.get("wheelchairType"), model),
        "createdAt": existing.get("createdAt") if existing else now,
        "updatedAt": now,
    }


def stock_status(item: dict[str, Any]) -> str:
    if float(item.get("currentStock") or 0) <= 0:
        return "缺货"
    if float(item.get("currentStock") or 0) < float(item.get("safetyStock") or 0):
        return "低库存"
    return "充足"


def filter_finished_models(models: list[dict[str, Any]], query: Any) -> list[dict[str, Any]]:
    wheelchair_type = str(query.get("wheelchairType") or "").strip()
    keyword = str(query.get("keyword") or "").strip().lower()
    rows = [
        {**item, "wheelchairType": normalize_wheelchair_type(item.get("wheelchairType"), item.get("model"))}
        for item in models
        if not ((wheelchair_type and normalize_wheelchair_type(item.get("wheelchairType"), item.get("model")) != wheelchair_type) or (keyword and keyword not in str(item.get("model", "")).lower()))
    ]
    return sorted(rows, key=lambda item: str(item.get("model", "")))


def filter_finished_goods(goods: list[dict[str, Any]], query: Any) -> list[dict[str, Any]]:
    keyword = str(query.get("keyword") or "").strip().lower()
    category = str(query.get("category") or "").strip()
    wheelchair_type = str(query.get("wheelchairType") or "").strip()
    status = str(query.get("status") or "").strip()

    def match(item: dict[str, Any]) -> bool:
        item_type = normalize_wheelchair_type(item.get("wheelchairType"), item.get("model"))
        haystack = f"{item.get('sku', '')} {item.get('model', '')} {item.get('location', '')} {item.get('batchNo', '')}".lower()
        return not ((keyword and keyword not in haystack) or (category and item.get("category") != category) or (wheelchair_type and item_type != wheelchair_type) or (status and stock_status(item) != status))

    rows = [{**item, "wheelchairType": normalize_wheelchair_type(item.get("wheelchairType"), item.get("model")), "status": stock_status(item)} for item in goods if match(item)]
    return sorted(rows, key=lambda item: str(item.get("model", "")))


def csv_cell(value: Any) -> str:
    text = str("" if value is None else value)
    if text.startswith(("=", "+", "-", "@")):
        text = "'" + text
    return '"' + text.replace('"', '""') + '"'


def csv_response(filename: str, headers: list[str], rows: list[list[Any]]) -> Response:
    csv_text = "\ufeff" + "\r\n".join(",".join(csv_cell(cell) for cell in row) for row in [headers, *rows])
    return Response(
        content=csv_text,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )


@app.exception_handler(HTTPException)
async def message_http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    if isinstance(exc.detail, str):
        return JSONResponse({"message": exc.detail}, status_code=exc.status_code, headers=exc.headers)
    return await http_exception_handler(request, exc)


@app.on_event("startup")
def startup() -> None:
    ensure_data_store()


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/me")
def me(request: Request) -> dict[str, Any]:
    employee = get_session_user(request)
    return {"loggedIn": bool(employee), "user": public_employee(employee) if employee else None}


@app.post("/api/login")
async def login(request: Request) -> Response:
    body = await read_body(request)
    username = str(body.get("username") or "").strip()
    password = str(body.get("password") or "")
    employee = next((item for item in read_employees() if item.get("username") == username and item.get("active") is not False), None)
    if not employee or not verify_password(password, str(employee.get("passwordHash") or "")):
        raise HTTPException(status_code=401, detail="账号或密码错误")
    token = create_session(employee)
    response = JSONResponse({"message": "登录成功", "user": public_employee(employee)})
    response.set_cookie(SESSION_COOKIE, token, max_age=SESSION_MAX_AGE_SECONDS, httponly=True, samesite="lax", secure=COOKIE_SECURE, path="/")
    return response


@app.post("/api/logout")
def logout(request: Request) -> Response:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        sessions.pop(token, None)
    response = JSONResponse({"message": "已退出登录"})
    response.delete_cookie(SESSION_COOKIE, path="/", samesite="lax", secure=COOKIE_SECURE, httponly=True)
    return response


@app.get("/api/employees")
def employees(request: Request) -> dict[str, Any]:
    require_employee_access(request)
    return {"employees": [public_employee(item) for item in read_employees()]}


@app.post("/api/employees")
async def create_employee(request: Request) -> dict[str, Any]:
    require_employee_access(request)
    body = await read_body(request)
    username = str(body.get("username") or "").strip()
    password = str(body.get("password") or "")
    name = str(body.get("name") or "").strip()
    department = str(body.get("department") or "").strip()
    if not username or not password or not name or not department:
        raise HTTPException(status_code=400, detail="请填写账号、密码、姓名和部门")
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="密码至少需要8位")
    items = read_employees()
    if any(item.get("username") == username for item in items):
        raise HTTPException(status_code=409, detail="账号已存在")
    employee = {
        "id": str(uuid.uuid4()),
        "username": username,
        "name": name,
        "department": department,
        "role": str(body.get("role") or "普通员工").strip(),
        "permissions": body.get("permissions") if isinstance(body.get("permissions"), list) else [],
        "active": True,
        "passwordHash": hash_password(password),
        "createdAt": now_iso(),
    }
    items.append(employee)
    write_employees(items)
    return {"message": "员工已创建", "employee": public_employee(employee)}


@app.get("/api/customer-directory")
def customer_directory(request: Request) -> dict[str, Any]:
    require_employee_access(request)
    return {"items": filter_customer_directory(read_customer_directory(), request.query_params)}


@app.post("/api/customer-directory")
async def create_customer_directory(request: Request) -> dict[str, Any]:
    require_employee_access(request)
    items = read_customer_directory()
    item = normalize_customer_directory_item(await read_body(request))
    items.append(item)
    write_customer_directory(items)
    return {"message": "资料已创建", "item": item}


@app.put("/api/customer-directory/{item_id}")
async def update_customer_directory(item_id: str, request: Request) -> dict[str, Any]:
    require_employee_access(request)
    items = read_customer_directory()
    index = next((i for i, item in enumerate(items) if item.get("id") == item_id), -1)
    if index < 0:
        raise HTTPException(status_code=404, detail="资料不存在")
    item = normalize_customer_directory_item(await read_body(request), items[index])
    items[index] = item
    write_customer_directory(items)
    return {"message": "资料已修改", "item": item}


@app.delete("/api/customer-directory/{item_id}")
def delete_customer_directory(item_id: str, request: Request) -> dict[str, Any]:
    require_employee_access(request)
    items = read_customer_directory()
    next_items = [item for item in items if item.get("id") != item_id]
    if len(next_items) == len(items):
        raise HTTPException(status_code=404, detail="资料不存在")
    write_customer_directory(next_items)
    return {"message": "资料已删除"}


@app.get("/api/sales-orders")
def sales_orders(request: Request) -> dict[str, Any]:
    require_employee_access(request)
    return {"orders": filter_sales_orders(read_sales_orders(), request.query_params)}


@app.post("/api/sales-orders")
async def create_sales_order(request: Request) -> dict[str, Any]:
    user = require_employee_access(request)
    items = read_sales_orders()
    order = normalize_sales_order(await read_body(request), user)
    items.append(order)
    write_sales_orders(items)
    return {"message": "销售单已创建", "order": order}


@app.delete("/api/sales-orders")
async def delete_sales_orders(request: Request) -> dict[str, Any]:
    require_employee_access(request)
    body = await read_body(request)
    ids = [str(item).strip() for item in body.get("ids", []) if str(item).strip()] if isinstance(body.get("ids"), list) else []
    if not ids:
        raise HTTPException(status_code=400, detail="请先勾选需要删除的销售单")
    items = read_sales_orders()
    next_items = [item for item in items if item.get("id") not in set(ids)]
    deleted_count = len(items) - len(next_items)
    if not deleted_count:
        raise HTTPException(status_code=404, detail="未找到需要删除的销售单")
    write_sales_orders(next_items)
    return {"message": f"已删除 {deleted_count} 条销售单", "deletedCount": deleted_count}


@app.get("/api/sales-orders/export")
def export_sales_orders(request: Request) -> Response:
    require_employee_access(request)
    orders = filter_sales_orders(read_sales_orders(), request.query_params)
    headers = ["单号", "日期", "时间", "客户", "电话", "客户类型", "轮椅类型", "产品型号", "数量", "单价", "金额", "状态", "备注", "创建人", "创建时间"]
    rows = [[order.get("orderNo"), order.get("orderDate"), order.get("orderTime"), order.get("customerName"), order.get("customerPhone"), order.get("customerType"), "电动轮椅" if normalize_wheelchair_type(order.get("wheelchairType"), order.get("productModel")) == "electric" else "手动轮椅", order.get("productModel"), order.get("quantity"), order.get("unitPrice"), order.get("amount"), order.get("status"), order.get("remark"), order.get("createdByName"), order.get("createdAt")] for order in orders]
    return csv_response(f"销售单导出-{datetime.now().date()}.csv", headers, rows)


@app.put("/api/sales-orders/{order_id}")
async def update_sales_order(order_id: str, request: Request) -> dict[str, Any]:
    user = require_employee_access(request)
    items = read_sales_orders()
    index = next((i for i, item in enumerate(items) if item.get("id") == order_id), -1)
    if index < 0:
        raise HTTPException(status_code=404, detail="销售单不存在")
    order = normalize_sales_order(await read_body(request), user, items[index])
    items[index] = order
    write_sales_orders(items)
    return {"message": "销售单已修改", "order": order}


@app.get("/api/parts")
def parts(request: Request) -> dict[str, Any]:
    require_employee_access(request)
    return {"parts": filter_parts(read_parts_inventory(), request.query_params)}


@app.post("/api/parts")
async def create_part(request: Request) -> dict[str, Any]:
    require_employee_access(request)
    body = await read_body(request)
    items = read_parts_inventory()
    if any(item.get("partNo") == str(body.get("partNo") or "").strip() for item in items):
        raise HTTPException(status_code=409, detail="配件编号已存在")
    part = normalize_part(body)
    items.append(part)
    write_parts_inventory(items)
    return {"message": "配件已创建", "part": {**part, "status": part_stock_status(part)}}


@app.delete("/api/parts")
async def delete_parts(request: Request) -> dict[str, Any]:
    require_employee_access(request)
    body = await read_body(request)
    ids = [str(item).strip() for item in body.get("ids", []) if str(item).strip()] if isinstance(body.get("ids"), list) else []
    if not ids:
        raise HTTPException(status_code=400, detail="请先勾选需要删除的配件")
    items = read_parts_inventory()
    next_items = [item for item in items if item.get("id") not in set(ids)]
    deleted_count = len(items) - len(next_items)
    if not deleted_count:
        raise HTTPException(status_code=404, detail="未找到需要删除的配件")
    write_parts_inventory(next_items)
    return {"message": f"已删除 {deleted_count} 条配件", "deletedCount": deleted_count}


@app.get("/api/parts/export")
def export_parts(request: Request) -> Response:
    require_employee_access(request)
    parts = filter_parts(read_parts_inventory(), request.query_params)
    headers = ["配件编号", "配件名称", "适用类型", "分类", "当前库存", "安全库存", "单位", "状态", "库位", "供应商", "备注", "更新时间"]
    rows = [[part.get("partNo"), part.get("name"), "电动轮椅" if normalize_wheelchair_type(part.get("wheelchairType"), part.get("name")) == "electric" else "手动轮椅", part.get("category"), part.get("currentStock"), part.get("safetyStock"), part.get("unit"), part_stock_status(part), part.get("location"), part.get("supplier"), part.get("remark"), part.get("updatedAt")] for part in parts]
    return csv_response(f"配件库存导出-{datetime.now().date()}.csv", headers, rows)


@app.put("/api/parts/{part_id}")
async def update_part(part_id: str, request: Request) -> dict[str, Any]:
    require_employee_access(request)
    body = await read_body(request)
    items = read_parts_inventory()
    index = next((i for i, item in enumerate(items) if item.get("id") == part_id), -1)
    if index < 0:
        raise HTTPException(status_code=404, detail="配件不存在")
    if any(item.get("id") != part_id and item.get("partNo") == str(body.get("partNo") or "").strip() for item in items):
        raise HTTPException(status_code=409, detail="配件编号已存在")
    part = normalize_part(body, items[index])
    items[index] = part
    write_parts_inventory(items)
    return {"message": "配件已修改", "part": {**part, "status": part_stock_status(part)}}


@app.post("/api/parts/{part_id}/adjust")
async def adjust_part(part_id: str, request: Request) -> dict[str, Any]:
    require_employee_access(request)
    body = await read_body(request)
    quantity = float(body.get("quantity") or 0)
    if quantity <= 0:
        raise HTTPException(status_code=400, detail="调整数量必须大于0")
    items = read_parts_inventory()
    index = next((i for i, item in enumerate(items) if item.get("id") == part_id), -1)
    if index < 0:
        raise HTTPException(status_code=404, detail="配件不存在")
    sign = -1 if str(body.get("type") or "").strip() == "out" else 1
    next_stock = float(items[index].get("currentStock") or 0) + sign * quantity
    if next_stock < 0:
        raise HTTPException(status_code=400, detail="库存不足，不能出库")
    items[index] = {**items[index], "currentStock": next_stock, "updatedAt": now_iso()}
    write_parts_inventory(items)
    return {"message": "出库完成" if sign < 0 else "入库完成", "part": {**items[index], "status": part_stock_status(items[index])}}


@app.get("/api/finished-models")
def finished_models(request: Request) -> dict[str, Any]:
    require_employee_access(request)
    return {"models": filter_finished_models(read_finished_models(), request.query_params)}


@app.post("/api/finished-models")
async def create_finished_model(request: Request) -> dict[str, Any]:
    require_employee_access(request)
    body = await read_body(request)
    item = normalize_finished_model(body)
    items = read_finished_models()
    if any(normalize_wheelchair_type(entry.get("wheelchairType"), entry.get("model")) == item["wheelchairType"] and str(entry.get("model") or "").strip() == item["model"] for entry in items):
        raise HTTPException(status_code=409, detail="成品型号已存在")
    items.append(item)
    write_finished_models(items)
    return {"message": "成品型号已创建", "item": item}


@app.delete("/api/finished-models")
async def delete_finished_models(request: Request) -> dict[str, Any]:
    require_employee_access(request)
    body = await read_body(request)
    ids = [str(item).strip() for item in body.get("ids", []) if str(item).strip()] if isinstance(body.get("ids"), list) else []
    if not ids:
        raise HTTPException(status_code=400, detail="请先选择需要删除的成品型号")
    items = read_finished_models()
    next_items = [item for item in items if item.get("id") not in set(ids)]
    deleted_count = len(items) - len(next_items)
    if not deleted_count:
        raise HTTPException(status_code=404, detail="未找到需要删除的成品型号")
    write_finished_models(next_items)
    return {"message": f"已删除 {deleted_count} 个成品型号", "deletedCount": deleted_count}


@app.put("/api/finished-models/{item_id}")
async def update_finished_model(item_id: str, request: Request) -> dict[str, Any]:
    require_employee_access(request)
    items = read_finished_models()
    index = next((i for i, item in enumerate(items) if item.get("id") == item_id), -1)
    if index < 0:
        raise HTTPException(status_code=404, detail="成品型号不存在")
    item = normalize_finished_model(await read_body(request), items[index])
    if any(entry.get("id") != item_id and normalize_wheelchair_type(entry.get("wheelchairType"), entry.get("model")) == item["wheelchairType"] and str(entry.get("model") or "").strip() == item["model"] for entry in items):
        raise HTTPException(status_code=409, detail="成品型号已存在")
    items[index] = item
    write_finished_models(items)
    return {"message": "成品型号已修改", "item": item}


@app.get("/api/finished-goods")
def finished_goods(request: Request) -> dict[str, Any]:
    require_employee_access(request)
    return {"goods": filter_finished_goods(read_finished_goods(), request.query_params)}


@app.post("/api/finished-goods")
async def create_finished_good(request: Request) -> dict[str, Any]:
    require_employee_access(request)
    body = await read_body(request)
    items = read_finished_goods()
    requested_sku = str(body.get("sku") or "").strip()
    if requested_sku and any(item.get("sku") == requested_sku for item in items):
        raise HTTPException(status_code=409, detail="成品编号已存在")
    item = normalize_finished_good(body)
    items.append(item)
    write_finished_goods(items)
    return {"message": "成品已创建", "item": {**item, "status": stock_status(item)}}


@app.delete("/api/finished-goods")
async def delete_finished_goods(request: Request) -> dict[str, Any]:
    require_employee_access(request)
    body = await read_body(request)
    ids = [str(item).strip() for item in body.get("ids", []) if str(item).strip()] if isinstance(body.get("ids"), list) else []
    if not ids:
        raise HTTPException(status_code=400, detail="请先勾选需要删除的成品")
    items = read_finished_goods()
    next_items = [item for item in items if item.get("id") not in set(ids)]
    deleted_count = len(items) - len(next_items)
    if not deleted_count:
        raise HTTPException(status_code=404, detail="未找到需要删除的成品")
    write_finished_goods(next_items)
    return {"message": f"已删除 {deleted_count} 条成品", "deletedCount": deleted_count}


@app.get("/api/finished-goods/export")
def export_finished_goods(request: Request) -> Response:
    require_employee_access(request)
    goods = filter_finished_goods(read_finished_goods(), request.query_params)
    headers = ["成品编号", "产品型号", "类型", "分类", "当前库存", "安全库存", "单位", "状态", "库位", "批次", "备注", "更新时间"]
    rows = [[item.get("sku"), item.get("model"), "电动轮椅" if normalize_wheelchair_type(item.get("wheelchairType"), item.get("model")) == "electric" else "手动轮椅", item.get("category"), item.get("currentStock"), item.get("safetyStock"), item.get("unit"), stock_status(item), item.get("location"), item.get("batchNo"), item.get("remark"), item.get("updatedAt")] for item in goods]
    return csv_response(f"成品库存导出-{datetime.now().date()}.csv", headers, rows)


@app.put("/api/finished-goods/{item_id}")
async def update_finished_good(item_id: str, request: Request) -> dict[str, Any]:
    require_employee_access(request)
    body = await read_body(request)
    items = read_finished_goods()
    index = next((i for i, item in enumerate(items) if item.get("id") == item_id), -1)
    if index < 0:
        raise HTTPException(status_code=404, detail="成品不存在")
    requested_sku = str(body.get("sku") or "").strip()
    if requested_sku and any(item.get("id") != item_id and item.get("sku") == requested_sku for item in items):
        raise HTTPException(status_code=409, detail="成品编号已存在")
    item = normalize_finished_good(body, items[index])
    items[index] = item
    write_finished_goods(items)
    return {"message": "成品已修改", "item": {**item, "status": stock_status(item)}}


@app.post("/api/finished-goods/{item_id}/adjust")
async def adjust_finished_good(item_id: str, request: Request) -> dict[str, Any]:
    require_employee_access(request)
    body = await read_body(request)
    quantity = float(body.get("quantity") or 0)
    if quantity <= 0:
        raise HTTPException(status_code=400, detail="调整数量必须大于0")
    items = read_finished_goods()
    index = next((i for i, item in enumerate(items) if item.get("id") == item_id), -1)
    if index < 0:
        raise HTTPException(status_code=404, detail="成品不存在")
    sign = -1 if str(body.get("type") or "").strip() == "out" else 1
    next_stock = float(items[index].get("currentStock") or 0) + sign * quantity
    if next_stock < 0:
        raise HTTPException(status_code=400, detail="库存不足，不能出库")
    items[index] = {**items[index], "currentStock": next_stock, "updatedAt": now_iso()}
    write_finished_goods(items)
    return {"message": "成品出库完成" if sign < 0 else "成品入库完成", "item": {**items[index], "status": stock_status(items[index])}}


@app.post("/api/chat")
def chat(payload: ChatRequest) -> dict[str, str]:
    message = payload.message or ""
    requirements = parse_user_requirement(message)
    parse_source = get_last_parse_source()
    print(f"Parsed user requirement (source={parse_source}): {json.dumps(requirements, ensure_ascii=False)}")
    products = search_products(requirements)
    return {"answer": build_recommendation_answer(products)}


@app.post("/chat")
def legacy_chat(payload: ChatRequest) -> dict[str, str]:
    return chat(payload)
