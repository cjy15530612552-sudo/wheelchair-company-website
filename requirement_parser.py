import json
import os
import re
from pathlib import Path
from typing import Any


Requirement = dict[str, Any]
USE_LLM_PARSER = True
DOTENV_PATH = Path(__file__).with_name(".env")
ALLOWED_SUITABLE_FOR = {"elderly", "disabled", "general", None}
LAST_PARSE_SOURCE = "rules"


def empty_requirement() -> Requirement:
    return {
        "max_price": None,
        "min_price": None,
        "foldable": None,
        "electric": None,
        "lightweight": None,
        "suitable_for": None,
    }


def set_last_parse_source(source: str) -> None:
    global LAST_PARSE_SOURCE
    LAST_PARSE_SOURCE = source


def get_last_parse_source() -> str:
    return LAST_PARSE_SOURCE


def normalize_requirement(raw_requirement: dict[str, Any] | None) -> Requirement:
    normalized = empty_requirement()
    if not isinstance(raw_requirement, dict):
        return normalized

    for price_field in ("max_price", "min_price"):
        value = raw_requirement.get(price_field)
        if isinstance(value, (int, float)):
            normalized[price_field] = int(value)
        elif isinstance(value, str):
            match = re.search(r"\d+", value)
            normalized[price_field] = int(match.group(0)) if match else None

    for boolean_field in ("foldable", "electric", "lightweight"):
        value = raw_requirement.get(boolean_field)
        normalized[boolean_field] = value if isinstance(value, bool) else None

    suitable_for = raw_requirement.get("suitable_for")
    normalized["suitable_for"] = suitable_for if suitable_for in ALLOWED_SUITABLE_FOR else None

    return normalized


def parse_price_requirement(message: str) -> dict[str, int | None]:
    text = re.sub(r"\s+", "", message or "")
    price_requirement: dict[str, int | None] = {"max_price": None, "min_price": None}

    if any(keyword in text for keyword in ("价格高一点也可以", "高端", "预算充足")):
        return price_requirement

    max_price_patterns = (
        r"(\d+)(?:元)?以内",
        r"不超过(\d+)",
        r"低于(\d+)",
        r"预算(\d+)",
        r"(\d+)(?:元)?左右",
    )

    for pattern in max_price_patterns:
        match = re.search(pattern, text)
        if match:
            price_requirement["max_price"] = int(match.group(1))
            break

    return price_requirement


def contains_any(text: str, keywords: tuple[str, ...]) -> bool:
    return any(keyword in text for keyword in keywords)


def parse_user_requirement_by_rules(message: str) -> Requirement:
    text = message or ""
    requirement = empty_requirement()
    requirement.update(parse_price_requirement(text))

    if contains_any(text, ("折叠", "可折叠", "方便收起来", "收纳方便", "放进车里", "后备箱", "搬上车")):
        requirement["foldable"] = True

    if contains_any(text, ("电动", "不用自己推", "自动走", "省力", "遥控")):
        requirement["electric"] = True

    if contains_any(text, ("轻便", "轻量", "轻一点", "轻一些", "轻点", "不要太重", "方便搬", "搬上车")):
        requirement["lightweight"] = True

    if contains_any(text, ("老人", "老年人", "长辈", "我爸", "我妈", "父亲", "母亲", "爷爷", "奶奶")):
        requirement["suitable_for"] = "elderly"
    elif contains_any(text, ("行动不便", "残障", "残疾", "康复", "术后")):
        requirement["suitable_for"] = "disabled"

    return normalize_requirement(requirement)


def extract_json_object(text: str) -> dict[str, Any]:
    content = (text or "").strip()
    if content.startswith("```"):
        content = re.sub(r"^```(?:json)?\s*", "", content)
        content = re.sub(r"\s*```$", "", content)

    try:
        parsed = json.loads(content)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{.*\}", content, flags=re.S)
    if not match:
        raise ValueError("LLM response does not contain a JSON object.")

    parsed = json.loads(match.group(0))
    if not isinstance(parsed, dict):
        raise ValueError("LLM response JSON is not an object.")

    return parsed


def parse_user_requirement_with_llm(message: str) -> Requirement | None:
    try:
        from dotenv import load_dotenv
        from openai import OpenAI
    except ImportError as error:
        raise RuntimeError("openai or python-dotenv is not installed.") from error

    load_dotenv(DOTENV_PATH)

    api_key = os.getenv("DASHSCOPE_API_KEY")
    if not api_key:
        raise RuntimeError("DASHSCOPE_API_KEY is missing in project .env or environment.")

    base_url = os.getenv("QWEN_BASE_URL") or "https://dashscope.aliyuncs.com/compatible-mode/v1"
    model = os.getenv("QWEN_MODEL") or "qwen-plus"

    client = OpenAI(
        api_key=api_key,
        base_url=base_url,
    )

    system_prompt = """
你是轮椅产品顾问系统里的“用户需求解析器”。
你只负责把用户自然语言解析成严格 JSON，不要推荐产品，不要编造产品，不要输出解释文字，不要使用 Markdown。

必须只输出以下 JSON 结构：
{
  "max_price": number 或 null,
  "min_price": number 或 null,
  "foldable": true/false/null,
  "electric": true/false/null,
  "lightweight": true/false/null,
  "suitable_for": "elderly" / "disabled" / "general" / null
}

解析规则：
- “我爸 / 我妈 / 老人 / 老年人 / 长辈 / 父亲 / 母亲 / 爷爷 / 奶奶” → suitable_for = "elderly"
- “行动不便 / 残障 / 残疾 / 康复 / 术后” → suitable_for = "disabled"
- “方便收起来 / 放进车里 / 后备箱 / 收纳方便 / 折叠 / 可折叠” → foldable = true
- “不用自己推 / 自动走 / 省力 / 遥控 / 电动” → electric = true
- “轻便 / 轻量 / 不要太重 / 方便搬上车 / 方便搬 / 轻一点” → lightweight = true
- “3000以内 / 不超过3000 / 预算3000左右 / 3000元以内 / 低于3000” → max_price = 3000
- 如果价格表达为其他数字，例如“5000元以内”，则 max_price = 5000
- 如果用户说“价格高一点也可以 / 高端 / 预算充足”，不要设置 max_price
- 没有明确提到的字段必须为 null
""".strip()

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": message},
        ],
        temperature=0,
        response_format={"type": "json_object"},
    )

    content = response.choices[0].message.content
    return normalize_requirement(extract_json_object(content or ""))


def parse_user_requirement(message: str) -> Requirement:
    if USE_LLM_PARSER:
        try:
            llm_requirement = parse_user_requirement_with_llm(message)
            if llm_requirement:
                set_last_parse_source("llm")
                return llm_requirement
        except Exception as error:
            print(f"LLM requirement parsing failed, fallback to rules: {error}")

    set_last_parse_source("rules")
    return parse_user_requirement_by_rules(message)
