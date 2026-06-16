import json

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from product_search import build_recommendation_answer, search_products
from requirement_parser import get_last_parse_source, parse_user_requirement


app = FastAPI(title="Junlong Website Chat API")

PRODUCT_KEYWORDS = (
    "推荐",
    "价格",
    "多少钱",
    "预算",
    "轮椅",
    "折叠",
    "方便收起来",
    "收纳",
    "放进车里",
    "后备箱",
    "电动",
    "不用自己推",
    "自动走",
    "省力",
    "遥控",
    "老人",
    "老年人",
    "长辈",
    "我爸",
    "我妈",
    "父亲",
    "母亲",
    "爷爷",
    "奶奶",
    "行动不便",
    "残障",
    "残疾",
    "康复",
    "术后",
    "轻便",
    "轻量",
    "轻一点",
    "不要太重",
    "方便搬",
    "搬上车",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    answer: str


def is_product_related(message: str) -> bool:
    return any(keyword in message for keyword in PRODUCT_KEYWORDS)


@app.post("/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest) -> ChatResponse:
    if is_product_related(payload.message):
        requirements = parse_user_requirement(payload.message)
        parse_source = get_last_parse_source()
        print(f"Parsed user requirement (source={parse_source}): {json.dumps(requirements, ensure_ascii=False)}")
        products = search_products(requirements)
        return ChatResponse(answer=build_recommendation_answer(products))

    return ChatResponse(answer=f"后端已经收到你的问题：{payload.message}")
