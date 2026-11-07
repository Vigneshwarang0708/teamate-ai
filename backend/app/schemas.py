from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ProductRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    price: Decimal
    category: str
    available: bool
    created_at: datetime | None = None


class ProductCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    price: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
    category: str = Field(default="General", max_length=80)
    available: bool = True


class ProductUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    price: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
    category: str = Field(default="General", max_length=80)
    available: bool = True


class CustomerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    phone: str | None = None
    business_name: str | None = None
    created_at: datetime | None = None
    outstanding: Decimal | None = None


class CustomerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    phone: str | None = Field(default=None, max_length=30)
    business_name: str | None = Field(default=None, max_length=160)


class CustomerUpdate(CustomerCreate):
    pass


class OrderItemRead(BaseModel):
    product_id: int | None = None
    product_name: str
    quantity: int
    unit_price: Decimal
    subtotal: Decimal = Decimal("0")


class OrderRead(BaseModel):
    id: int
    order_number: str | None = None
    total: Decimal
    payment_type: str
    payment_status: str = "completed"
    cash_amount: Decimal = Decimal("0")
    credit_amount: Decimal = Decimal("0")
    customer_id: int | None = None
    customer_name: str | None = None
    created_at: datetime
    note: str | None = None
    items: list[OrderItemRead]


class BillItemCreate(BaseModel):
    product_id: int = Field(gt=0)
    quantity: int = Field(gt=0, le=999)


class BillCreate(BaseModel):
    items: list[BillItemCreate] = Field(min_length=1)
    customer_id: int | None = Field(default=None, gt=0)
    payment_type: str = Field(pattern="^(cash|credit|split)$")
    cash_amount: Decimal = Field(default=Decimal("0"), ge=0, max_digits=10, decimal_places=2)
    credit_amount: Decimal = Field(default=Decimal("0"), ge=0, max_digits=10, decimal_places=2)
    idempotency_key: str = Field(min_length=8, max_length=120)
    note: str | None = Field(default=None, max_length=500)
    spoken_language: str = Field(default="en", max_length=10)


class BillCreated(BaseModel):
    order: OrderRead
    message: str
    speech_text: str | None = None
    speech_audio_base64: str | None = None


class PaymentCreate(BaseModel):
    customer_id: int = Field(gt=0)
    amount: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
    payment_type: str = Field(default="repayment", max_length=20)
    note: str | None = Field(default=None, max_length=500)


class LedgerEntryRead(BaseModel):
    id: int
    kind: str
    amount: Decimal
    payment_type: str
    note: str | None = None
    reference_id: str | None = None
    created_at: datetime


class CustomerLedgerRead(CustomerRead):
    outstanding: Decimal
    total_credit: Decimal = Decimal("0")
    total_repaid: Decimal = Decimal("0")
    entries: list[LedgerEntryRead]


class DailySalesPoint(BaseModel):
    date: str
    sales: Decimal
    orders_count: int


class CustomerCreditSummary(BaseModel):
    customer_id: int
    customer_name: str
    business_name: str | None = None
    outstanding: Decimal


class AnalyticsRead(BaseModel):
    total_sales: Decimal
    cash_collected: Decimal
    credit_sales: Decimal
    outstanding_credit: Decimal
    total_orders: int
    average_order_value: Decimal = Decimal("0")
    top_products: list[dict[str, Any]]
    sales_trend: list[DailySalesPoint] = []
    customer_credit_breakdown: list[CustomerCreditSummary] = []


class VoiceParseItem(BaseModel):
    product_id: int
    product_name: str
    quantity: int
    unit_price: Decimal
    subtotal: Decimal


class VoiceParseRequest(BaseModel):
    transcript: str = Field(min_length=1)
    language: str = Field(default="auto")


class VoiceParseResponse(BaseModel):
    transcript: str
    detected_language: str
    items: list[VoiceParseItem]
    customer_id: int | None = None
    customer_name: str | None = None
    payment_type: str = "cash"
    total_amount: Decimal = Decimal("0")
    ambiguous: bool = False
    clarification_needed: str | None = None
    parser_mode: str = "fallback_nlu"  # "gnani_evon" or "fallback_nlu"
    explanation: str = ""


class AssistantQueryRequest(BaseModel):
    query: str = Field(min_length=1)
    language: str = Field(default="auto")


class AssistantQueryResponse(BaseModel):
    query: str
    response_text: str
    intent: str
    language: str
    audio_base64: str | None = None
    data: dict[str, Any] | None = None
    action_performed: bool = False
