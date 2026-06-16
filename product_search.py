import json
from pathlib import Path
from typing import Any


PRODUCTS_PATH = Path(__file__).with_name("products.json")


def load_products() -> list[dict[str, Any]]:
    with PRODUCTS_PATH.open("r", encoding="utf-8") as file:
        products = json.load(file)

    if not isinstance(products, list):
        return []

    return [product for product in products if isinstance(product, dict)]


def normalize_requirements(requirements: dict[str, Any] | None) -> dict[str, Any]:
    normalized = {
        "max_price": None,
        "min_price": None,
        "foldable": None,
        "electric": None,
        "lightweight": None,
        "suitable_for": None,
    }
    if requirements:
        normalized.update(requirements)

    return normalized


def has_active_filters(requirements: dict[str, Any]) -> bool:
    return any(value is not None for value in requirements.values())


def product_matches(product: dict[str, Any], requirements: dict[str, Any]) -> bool:
    price = float(product.get("price", 0))

    max_price = requirements.get("max_price")
    if max_price is not None and float(product.get("price", 0)) > max_price:
        return False

    min_price = requirements.get("min_price")
    if min_price is not None and price < min_price:
        return False

    for boolean_field in ("foldable", "electric", "lightweight"):
        expected_value = requirements.get(boolean_field)
        if expected_value is not None and bool(product.get(boolean_field)) != expected_value:
            return False

    suitable_for = requirements.get("suitable_for")
    if suitable_for and suitable_for != "general":
        product_suitable_for = product.get("suitable_for", [])
        if not isinstance(product_suitable_for, list) or suitable_for not in product_suitable_for:
            return False

    return True


def search_products(requirements: dict[str, Any] | None, limit: int = 3) -> list[dict[str, Any]]:
    products = load_products()
    normalized_requirements = normalize_requirements(requirements)

    if has_active_filters(normalized_requirements):
        products = [product for product in products if product_matches(product, normalized_requirements)]

    return sorted(products, key=lambda product: float(product.get("price", 0)))[:limit]


def build_recommendation_answer(products: list[dict[str, Any]]) -> str:
    if not products:
        return "暂时没有找到完全符合条件的产品，你可以放宽价格或功能要求。"

    lines = ["根据你的需求，我推荐以下产品："]
    for index, product in enumerate(products, start=1):
        name = product.get("name", "未命名产品")
        price = product.get("price", "价格待定")
        category = product.get("category", "轮椅")
        description = product.get("description", "")
        lines.append(f"{index}. {name}（{category}，参考价￥{price}）：{description}")

    return "\n".join(lines)
