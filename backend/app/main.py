from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import logging
import os
import uuid
from typing import Any

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from sqlalchemy import func, inspect, select, text
from sqlalchemy.orm import Session, joinedload

from .assistant import handle_assistant_query
from .database import Base, SessionLocal, engine, get_db
from .evon_parser import detect_language, parse_order_command
from .gnani_prisma import transcribe_audio
from .gnani_timbre import build_confirmation_phrase, synthesize_speech
from .models import Customer, Order, OrderItem, Payment, Product
from .schemas import (
    AnalyticsRead,
    AssistantQueryRequest,
    AssistantQueryResponse,
    BillCreate,
    BillCreated,
    CustomerCreate,
    CustomerCreditSummary,
    CustomerLedgerRead,
    CustomerRead,
    CustomerUpdate,
    DailySalesPoint,
    LedgerEntryRead,
    OrderItemRead,
    OrderRead,
    PaymentCreate,
    ProductCreate,
    ProductRead,
    ProductUpdate,
    VoiceParseItem,
    VoiceParseRequest,
    VoiceParseResponse,
)

logger = logging.getLogger("teammate.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    seed_database()
    yield


app = FastAPI(
    title="TeaMate AI API",
    version="2.0.0",
    description="Multilingual AI-Powered Voice Billing and Credit Ledger System for Food Stalls and Tea Shops",
    lifespan=lifespan,
)

app.add_middleware(GZipMiddleware, minimum_size=500)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def seed_database() -> None:
    """Safely upgrades database schema with any missing columns and seeds default demonstration records."""
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        insp = inspect(engine)
        
        # 1. Orders table migrations
        order_cols = {c["name"] for c in insp.get_columns("orders")}
        if "cash_amount" not in order_cols:
            conn.execute(text("ALTER TABLE orders ADD COLUMN cash_amount NUMERIC(10, 2) NOT NULL DEFAULT 0"))
        if "credit_amount" not in order_cols:
            conn.execute(text("ALTER TABLE orders ADD COLUMN credit_amount NUMERIC(10, 2) NOT NULL DEFAULT 0"))
        if "order_number" not in order_cols:
            conn.execute(text("ALTER TABLE orders ADD COLUMN order_number VARCHAR(50)"))
        if "payment_status" not in order_cols:
            conn.execute(text("ALTER TABLE orders ADD COLUMN payment_status VARCHAR(30) NOT NULL DEFAULT 'completed'"))

        # Backfill existing orders
        conn.execute(text("UPDATE orders SET cash_amount = total WHERE payment_type = 'cash' AND (cash_amount IS NULL OR cash_amount = 0)"))
        conn.execute(text("UPDATE orders SET credit_amount = total WHERE payment_type = 'credit' AND (credit_amount IS NULL OR credit_amount = 0)"))
        conn.execute(text("UPDATE orders SET order_number = 'TM-' || (1000 + id) WHERE order_number IS NULL"))

        # 2. Customers table migrations
        customer_cols = {c["name"] for c in insp.get_columns("customers")}
        if "business_name" not in customer_cols:
            conn.execute(text("ALTER TABLE customers ADD COLUMN business_name VARCHAR(160)"))

        # 3. Order Items table migrations
        item_cols = {c["name"] for c in insp.get_columns("order_items")}
        if "product_name_snapshot" not in item_cols:
            conn.execute(text("ALTER TABLE order_items ADD COLUMN product_name_snapshot VARCHAR(120)"))
        if "subtotal" not in item_cols:
            conn.execute(text("ALTER TABLE order_items ADD COLUMN subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0"))

        conn.execute(text("""
            UPDATE order_items 
            SET subtotal = quantity * unit_price 
            WHERE subtotal IS NULL OR subtotal = 0
        """))

        # 4. Payments table migrations
        payment_cols = {c["name"] for c in insp.get_columns("payments")}
        if "order_id" not in payment_cols:
            conn.execute(text("ALTER TABLE payments ADD COLUMN order_id INTEGER REFERENCES orders(id)"))

    with SessionLocal() as db:
        # Check and add demonstration products as requested
        demo_products = [
            ("Tea", Decimal("12.00"), "Tea"),
            ("Coffee", Decimal("15.00"), "Beverage"),
            ("Vada", Decimal("10.00"), "Snacks"),
            ("Samosa", Decimal("15.00"), "Snacks"),
            ("Juice", Decimal("30.00"), "Juice"),
            ("Masala Tea", Decimal("15.00"), "Tea"),
            ("Ginger Tea", Decimal("20.00"), "Tea"),
            ("Filter Coffee", Decimal("20.00"), "Beverage"),
            ("Fresh Lime Juice", Decimal("40.00"), "Juice"),
        ]

        for name, price, category in demo_products:
            existing = db.scalar(select(Product).where(func.lower(Product.name) == name.lower()))
            if not existing:
                db.add(Product(name=name, price=price, category=category, available=True))
        db.commit()

        # Seed initial demonstration customers if empty
        if not db.scalar(select(Customer.id).limit(1)):
            c1 = Customer(name="Furniture Shop", business_name="Vasantham Wood Works", phone="9876543210")
            c2 = Customer(name="Ravi Auto Stand", business_name="Ravi Auto Service", phone="9876543211")
            c3 = Customer(name="Kavitha Tailors", business_name="Kavitha Ladies Tailor", phone="9876543212")
            db.add_all([c1, c2, c3])
            db.commit()


@app.get("/api/health")
def health() -> dict[str, Any]:
    from dotenv import load_dotenv
    load_dotenv()
    api_key_set = bool(os.getenv("GNANI_API_KEY", "").strip())
    evon_path = os.getenv("EVON_MODEL_PATH", "").strip()
    evon_set = bool(evon_path and os.path.exists(evon_path))
    current_voice = os.getenv("GNANI_TIMBRE_TAMIL_VOICE", "Brinda").strip()
    return {
        "status": "ok",
        "service": "TeaMate AI",
        "version": "2.0.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "services": {
            "gnani_prisma_stt": "connected" if api_key_set else "unconfigured (using browser fallback)",
            "gnani_timbre_tts": f"connected (timbre-v2.5, voice: {current_voice})" if api_key_set else "unconfigured (using browser voice fallback)",
            "evon_nlu": "connected" if evon_set else "unconfigured (using multilingual fallback parser)",
            "fallback_nlu_parser": "active",
        },
        "gnani_configured": api_key_set,
        "evon_configured": evon_set,
        "tts_tamil_voice": current_voice,
        "tts_available_tamil_voices": ["Brinda", "Asmita", "Trisha", "Vedika"],
    }


@app.post("/api/settings/voice")
async def update_voice_setting(payload: dict[str, str]) -> dict[str, Any]:
    """Updates the Tamil TTS voice preference in the backend .env at runtime."""
    from .gnani_timbre import TAMIL_VOICES
    voice = payload.get("tamil_voice", "Brinda").strip()
    if voice not in TAMIL_VOICES:
        raise HTTPException(
            status_code=400,
            detail=f"Voice '{voice}' is not supported. Supported Tamil voices: {TAMIL_VOICES}",
        )
    # Update the environment variable for the current process
    os.environ["GNANI_TIMBRE_TAMIL_VOICE"] = voice

    # Persist to .env file for restarts
    env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
    env_path = os.path.normpath(env_path)
    try:
        lines = []
        found = False
        if os.path.exists(env_path):
            with open(env_path, "r", encoding="utf-8") as f:
                lines = f.readlines()
        new_lines = []
        for line in lines:
            if line.startswith("GNANI_TIMBRE_TAMIL_VOICE="):
                new_lines.append(f"GNANI_TIMBRE_TAMIL_VOICE={voice}\n")
                found = True
            else:
                new_lines.append(line)
        if not found:
            new_lines.append(f"\nGNANI_TIMBRE_TAMIL_VOICE={voice}\n")
        with open(env_path, "w", encoding="utf-8") as f:
            f.writelines(new_lines)
    except Exception as exc:
        logger.warning("Could not persist GNANI_TIMBRE_TAMIL_VOICE to .env: %s", exc)

    logger.info("Tamil TTS voice updated to: %s", voice)
    return {"success": True, "tamil_voice": voice, "message": f"Tamil voice set to {voice}."}


# ==========================================
# PRODUCT MANAGEMENT
# ==========================================

@app.get("/api/products", response_model=list[ProductRead])
def list_products(db: Session = Depends(get_db)) -> list[Product]:
    return list(db.scalars(select(Product).order_by(Product.category, Product.name)))


@app.post("/api/products", response_model=ProductRead, status_code=status.HTTP_201_CREATED)
def create_product(payload: ProductCreate, db: Session = Depends(get_db)) -> Product:
    clean_name = payload.name.strip()
    if db.scalar(select(Product).where(func.lower(Product.name) == clean_name.lower())):
        raise HTTPException(status_code=409, detail="A product with this name already exists.")
    product = Product(
        name=clean_name,
        price=payload.price,
        category=payload.category.strip(),
        available=payload.available,
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


@app.put("/api/products/{product_id}", response_model=ProductRead)
def update_product(product_id: int, payload: ProductUpdate, db: Session = Depends(get_db)) -> Product:
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")
    clean_name = payload.name.strip()
    duplicate = db.scalar(
        select(Product).where(func.lower(Product.name) == clean_name.lower(), Product.id != product_id)
    )
    if duplicate:
        raise HTTPException(status_code=409, detail="A product with this name already exists.")
    product.name = clean_name
    product.price = payload.price
    product.category = payload.category.strip()
    product.available = payload.available
    db.commit()
    db.refresh(product)
    return product


@app.delete("/api/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(product_id: int, db: Session = Depends(get_db)) -> None:
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")
    # If the product was used in historical orders, mark it unavailable to preserve price integrity
    if db.scalar(select(OrderItem.id).where(OrderItem.product_id == product_id)):
        product.available = False
        db.commit()
        return
    db.delete(product)
    db.commit()


# ==========================================
# CUSTOMER & CREDIT LEDGER (KHATABOOK)
# ==========================================

def customer_balance(db: Session, customer_id: int) -> Decimal:
    credit_sales = db.scalar(
        select(func.coalesce(func.sum(Order.credit_amount), 0)).where(Order.customer_id == customer_id)
    ) or Decimal("0")
    repayments = db.scalar(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(Payment.customer_id == customer_id)
    ) or Decimal("0")
    return max(Decimal("0"), credit_sales - repayments)


@app.get("/api/customers", response_model=list[CustomerRead])
def list_customers(db: Session = Depends(get_db)) -> list[CustomerRead]:
    customers = list(db.scalars(select(Customer).order_by(Customer.name)))
    results: list[CustomerRead] = []
    for c in customers:
        outstanding = customer_balance(db, c.id)
        results.append(
            CustomerRead(
                id=c.id,
                name=c.name,
                phone=c.phone,
                business_name=c.business_name,
                created_at=c.created_at,
                outstanding=outstanding,
            )
        )
    return results


@app.post("/api/customers", response_model=CustomerRead, status_code=status.HTTP_201_CREATED)
def create_customer(payload: CustomerCreate, db: Session = Depends(get_db)) -> CustomerRead:
    clean_name = payload.name.strip()
    if db.scalar(select(Customer).where(func.lower(Customer.name) == clean_name.lower())):
        raise HTTPException(status_code=409, detail="A customer with this name already exists.")
    customer = Customer(
        name=clean_name,
        phone=payload.phone.strip() if payload.phone else None,
        business_name=payload.business_name.strip() if payload.business_name else None,
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return CustomerRead(
        id=customer.id,
        name=customer.name,
        phone=customer.phone,
        business_name=customer.business_name,
        created_at=customer.created_at,
        outstanding=Decimal("0"),
    )


@app.put("/api/customers/{customer_id}", response_model=CustomerRead)
def update_customer(customer_id: int, payload: CustomerUpdate, db: Session = Depends(get_db)) -> CustomerRead:
    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found.")
    clean_name = payload.name.strip()
    duplicate = db.scalar(
        select(Customer).where(func.lower(Customer.name) == clean_name.lower(), Customer.id != customer_id)
    )
    if duplicate:
        raise HTTPException(status_code=409, detail="A customer with this name already exists.")
    customer.name = clean_name
    customer.phone = payload.phone.strip() if payload.phone else None
    customer.business_name = payload.business_name.strip() if payload.business_name else None
    db.commit()
    db.refresh(customer)
    return CustomerRead(
        id=customer.id,
        name=customer.name,
        phone=customer.phone,
        business_name=customer.business_name,
        created_at=customer.created_at,
        outstanding=customer_balance(db, customer.id),
    )


@app.get("/api/customers/{customer_id}/ledger", response_model=CustomerLedgerRead)
def get_customer_ledger(customer_id: int, db: Session = Depends(get_db)) -> CustomerLedgerRead:
    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found.")

    orders = list(
        db.scalars(
            select(Order)
            .where(Order.customer_id == customer_id)
            .order_by(Order.created_at.desc())
        )
    )
    repayments = list(
        db.scalars(
            select(Payment)
            .where(Payment.customer_id == customer_id)
            .order_by(Payment.created_at.desc())
        )
    )

    total_credit = sum((o.credit_amount for o in orders), Decimal("0"))
    total_repaid = sum((p.amount for p in repayments), Decimal("0"))
    outstanding = max(Decimal("0"), total_credit - total_repaid)

    entries = [
        LedgerEntryRead(
            id=order.id,
            kind="credit_sale",
            amount=order.credit_amount,
            payment_type=order.payment_type,
            note=order.note,
            reference_id=order.order_number,
            created_at=order.created_at,
        )
        for order in orders
        if order.credit_amount > 0
    ] + [
        LedgerEntryRead(
            id=payment.id,
            kind="repayment",
            amount=payment.amount,
            payment_type=payment.payment_type,
            note=payment.note,
            reference_id=f"PAY-{payment.id}",
            created_at=payment.created_at,
        )
        for payment in repayments
    ]

    return CustomerLedgerRead(
        id=customer.id,
        name=customer.name,
        phone=customer.phone,
        business_name=customer.business_name,
        created_at=customer.created_at,
        outstanding=outstanding,
        total_credit=total_credit,
        total_repaid=total_repaid,
        entries=sorted(entries, key=lambda e: e.created_at, reverse=True),
    )


@app.post("/api/payments", response_model=LedgerEntryRead, status_code=status.HTTP_201_CREATED)
def create_payment(payload: PaymentCreate, db: Session = Depends(get_db)) -> LedgerEntryRead:
    customer = db.get(Customer, payload.customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found.")

    outstanding = customer_balance(db, customer.id)
    if payload.amount > outstanding:
        raise HTTPException(
            status_code=400,
            detail=f"Repayment (₹{payload.amount}) cannot exceed the current outstanding balance of ₹{outstanding}.",
        )

    payment = Payment(
        customer_id=customer.id,
        amount=payload.amount,
        payment_type=payload.payment_type,
        note=payload.note,
    )
    try:
        db.add(payment)
        db.commit()
        db.refresh(payment)
    except Exception as exc:
        db.rollback()
        logger.error("Failed to commit payment: %s", exc)
        raise HTTPException(status_code=409, detail="Payment transaction could not be recorded.")

    return LedgerEntryRead(
        id=payment.id,
        kind="repayment",
        amount=payment.amount,
        payment_type=payment.payment_type,
        note=payment.note,
        reference_id=f"PAY-{payment.id}",
        created_at=payment.created_at,
    )


# ==========================================
# BILLING & TRANSACTIONS
# ==========================================

def order_to_schema(order: Order) -> OrderRead:
    return OrderRead(
        id=order.id,
        order_number=order.order_number,
        total=order.total,
        payment_type=order.payment_type,
        payment_status=order.payment_status,
        cash_amount=order.cash_amount,
        credit_amount=order.credit_amount,
        customer_id=order.customer_id,
        customer_name=order.customer.name if order.customer else None,
        created_at=order.created_at,
        note=order.note,
        items=[
            OrderItemRead(
                product_id=item.product_id,
                product_name=item.product_name_snapshot or (item.product.name if item.product else "Item"),
                quantity=item.quantity,
                unit_price=item.unit_price,
                subtotal=item.subtotal,
            )
            for item in order.items
        ],
    )


@app.get("/api/billing/history", response_model=list[OrderRead])
def billing_history(db: Session = Depends(get_db)) -> list[OrderRead]:
    orders = list(
        db.scalars(
            select(Order)
            .options(joinedload(Order.customer), joinedload(Order.items).joinedload(OrderItem.product))
            .order_by(Order.created_at.desc())
            .limit(20)
        ).unique().all()
    )
    return [order_to_schema(order) for order in orders]


@app.post("/api/billing/confirm", response_model=BillCreated, status_code=status.HTTP_201_CREATED)
async def confirm_billing(payload: BillCreate, db: Session = Depends(get_db)) -> BillCreated:
    # 1. Check idempotency key to prevent accidental duplicate submission
    existing = db.scalar(
        select(Order)
        .options(joinedload(Order.customer), joinedload(Order.items).joinedload(OrderItem.product))
        .where(Order.idempotency_key == payload.idempotency_key)
    )
    if existing:
        return BillCreated(
            order=order_to_schema(existing),
            message="This bill has already been recorded (idempotency key matched).",
            speech_text=f"Bill already saved. Total is {existing.total} rupees.",
        )

    # 2. Group quantities and fetch products
    quantities: dict[int, int] = {}
    for item in payload.items:
        quantities[item.product_id] = quantities.get(item.product_id, 0) + item.quantity

    products = {p.id: p for p in db.scalars(select(Product).where(Product.id.in_(quantities)))}
    if len(products) != len(quantities) or any(not p.available for p in products.values()):
        raise HTTPException(status_code=400, detail="One or more selected products are unavailable.")

    # 3. Customer validation
    customer = db.get(Customer, payload.customer_id) if payload.customer_id else None
    if payload.customer_id and not customer:
        raise HTTPException(status_code=404, detail="Customer not found.")

    # 4. Total calculation using current SQLite product prices
    total = sum((products[pid].price * Decimal(qty) for pid, qty in quantities.items()), Decimal("0"))

    # 5. Payment calculations and validations
    if payload.payment_type == "cash":
        cash_amount = total
        credit_amount = Decimal("0")
    elif payload.payment_type == "credit":
        cash_amount = Decimal("0")
        credit_amount = total
    else:  # split
        cash_amount = payload.cash_amount
        credit_amount = payload.credit_amount
        if cash_amount + credit_amount != total:
            raise HTTPException(
                status_code=400,
                detail=f"Split payment total (Cash: ₹{cash_amount} + Credit: ₹{credit_amount}) must equal total bill amount ₹{total}.",
            )

    if credit_amount > 0 and not customer:
        raise HTTPException(status_code=400, detail="Customer selection is required for credit transactions.")

    # 6. Generate sequential order number
    max_id = db.scalar(select(func.coalesce(func.max(Order.id), 0))) or 0
    order_number = f"TM-{1001 + max_id}"

    order = Order(
        order_number=order_number,
        customer=customer,
        total=total,
        payment_type=payload.payment_type,
        payment_status="completed",
        cash_amount=cash_amount,
        credit_amount=credit_amount,
        idempotency_key=payload.idempotency_key,
        note=payload.note,
        created_at=datetime.utcnow(),
    )

    # Historical price snapshots preserved in OrderItems
    order.items = [
        OrderItem(
            product=products[pid],
            product_id=pid,
            quantity=qty,
            unit_price=products[pid].price,
            product_name_snapshot=products[pid].name,
            subtotal=products[pid].price * Decimal(qty),
        )
        for pid, qty in quantities.items()
    ]

    try:
        db.add(order)
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("Failed to commit order: %s", exc)
        raise HTTPException(status_code=409, detail="Failed to save bill. Please retry.")

    db.refresh(order)

    # 7. Generate multilingual confirmation speech AFTER successful commit
    customer_name = customer.name if customer else None
    speech_phrase = build_confirmation_phrase(
        total=total,
        payment_type=payload.payment_type,
        customer_name=customer_name,
        language=payload.spoken_language,
    )
    tts_result = await synthesize_speech(speech_phrase, language=payload.spoken_language)

    return BillCreated(
        order=order_to_schema(order),
        message=f"Bill #{order_number} confirmed successfully.",
        speech_text=speech_phrase,
        speech_audio_base64=tts_result.get("audio_base64"),
    )


# ==========================================
# MULTILINGUAL VOICE PARSING
# ==========================================

@app.post("/api/billing/voice", response_model=VoiceParseResponse)
async def voice_parse_command(
    transcript: str | None = Form(default=None),
    language: str = Form(default="ta"),
    audio: UploadFile | None = File(default=None),
    db: Session = Depends(get_db),
) -> VoiceParseResponse:
    """Accepts spoken audio (via Gnani Prisma STT) or speech transcript text,
    and converts it into structured order items, customer, and payment method."""
    final_transcript = ""
    target_language = language or "ta"

    # 1. If audio file is provided, call Gnani Prisma Speech-to-Text
    if audio and audio.filename:
        audio_bytes = await audio.read()
        if len(audio_bytes) > 0:
            stt_result = await transcribe_audio(
                audio_bytes=audio_bytes,
                filename=audio.filename,
                content_type=audio.content_type or "audio/wav",
                language=target_language,
            )
            if stt_result.get("success") and stt_result.get("transcript"):
                final_transcript = stt_result["transcript"]
            else:
                # Do not silently replace failed Tamil transcription with fake or guessed text
                err_msg = stt_result.get("message") or "Prisma STT produced no transcript from the audio."
                logger.warning("Voice transcription failed: %s", err_msg)
                return VoiceParseResponse(
                    transcript="",
                    detected_language=target_language,
                    items=[],
                    ambiguous=True,
                    clarification_needed=f"Audio transcription failed: {err_msg}. Please speak clearly and retry.",
                    parser_mode="gnani_prisma",
                    explanation=f"STT Error: {err_msg}",
                )

    # 2. If text transcript is provided directly (e.g. text box or demo command chips)
    if not final_transcript and transcript:
        final_transcript = transcript.strip()

    if not final_transcript:
        raise HTTPException(status_code=400, detail="Either audio file or speech transcript must be provided.")

    # 3. Use AI Parser (Evon v3.3 if weights accessible, otherwise robust modular multilingual NLU fallback)
    parsed = parse_order_command(final_transcript, db, target_language=target_language)

    items = [
        VoiceParseItem(
            product_id=it["product_id"],
            product_name=it["product_name"],
            quantity=it["quantity"],
            unit_price=it["unit_price"],
            subtotal=it["subtotal"],
        )
        for it in parsed["items"]
    ]

    return VoiceParseResponse(
        transcript=parsed["transcript"],
        detected_language=parsed["detected_language"],
        items=items,
        customer_id=parsed["customer_id"],
        customer_name=parsed["customer_name"],
        payment_type=parsed["payment_type"],
        total_amount=parsed["total_amount"],
        ambiguous=parsed["ambiguous"],
        clarification_needed=parsed["clarification_needed"],
        parser_mode=parsed["parser_mode"],
        explanation=parsed["explanation"],
    )


# ==========================================
# CONVERSATIONAL VOICE BUSINESS ASSISTANT
# ==========================================

@app.post("/api/assistant/query", response_model=AssistantQueryResponse)
async def query_business_assistant(
    payload: AssistantQueryRequest,
    db: Session = Depends(get_db),
) -> AssistantQueryResponse:
    """Answers conversational business intelligence questions using real database figures."""
    result = await handle_assistant_query(payload.query, db, language=payload.language)
    return AssistantQueryResponse(**result)


# ==========================================
# DAILY, WEEKLY, & MONTHLY ANALYTICS
# ==========================================

def calculate_analytics(db: Session, start_time: datetime, days_history: int = 7) -> AnalyticsRead:
    orders = list(
        db.scalars(
            select(Order)
            .options(joinedload(Order.items).joinedload(OrderItem.product))
            .where(Order.created_at >= start_time)
        ).unique().all()
    )

    total_sales = sum((o.total for o in orders), Decimal("0"))
    cash = sum((o.cash_amount for o in orders), Decimal("0"))
    credit = sum((o.credit_amount for o in orders), Decimal("0"))
    total_orders = len(orders)
    avg_order_value = (total_sales / Decimal(total_orders)) if total_orders > 0 else Decimal("0")

    # Cumulative credit calculation
    all_credit = db.scalar(select(func.coalesce(func.sum(Order.credit_amount), 0))) or Decimal("0")
    all_repaid = db.scalar(select(func.coalesce(func.sum(Payment.amount), 0))) or Decimal("0")
    outstanding_credit = max(Decimal("0"), all_credit - all_repaid)

    # Top selling products
    counts: dict[str, int] = {}
    for o in orders:
        for itm in o.items:
            name = itm.product_name_snapshot or (itm.product.name if itm.product else "Item")
            counts[name] = counts.get(name, 0) + itm.quantity

    top_products = [
        {"name": name, "quantity": qty}
        for name, qty in sorted(counts.items(), key=lambda p: p[1], reverse=True)[:5]
    ]

    # Daily sales trend points
    now = datetime.utcnow()
    sales_trend: list[DailySalesPoint] = []
    for day_offset in range(days_history - 1, -1, -1):
        d_start = datetime(now.year, now.month, now.day) - timedelta(days=day_offset)
        d_end = d_start + timedelta(days=1)
        day_orders = list(
            db.scalars(select(Order).where(Order.created_at >= d_start, Order.created_at < d_end))
        )
        day_total = sum((o.total for o in day_orders), Decimal("0"))
        sales_trend.append(
            DailySalesPoint(
                date=d_start.strftime("%b %d"),
                sales=day_total,
                orders_count=len(day_orders),
            )
        )

    # Customer credit breakdown
    customers = list(db.scalars(select(Customer)))
    credit_breakdown: list[CustomerCreditSummary] = []
    for c in customers:
        bal = customer_balance(db, c.id)
        if bal > 0:
            credit_breakdown.append(
                CustomerCreditSummary(
                    customer_id=c.id,
                    customer_name=c.name,
                    business_name=c.business_name,
                    outstanding=bal,
                )
            )
    credit_breakdown.sort(key=lambda x: x.outstanding, reverse=True)

    return AnalyticsRead(
        total_sales=total_sales,
        cash_collected=cash,
        credit_sales=credit,
        outstanding_credit=outstanding_credit,
        total_orders=total_orders,
        average_order_value=avg_order_value,
        top_products=top_products,
        sales_trend=sales_trend,
        customer_credit_breakdown=credit_breakdown,
    )


@app.get("/api/analytics/today", response_model=AnalyticsRead)
def analytics_today(db: Session = Depends(get_db)) -> AnalyticsRead:
    now = datetime.utcnow()
    return calculate_analytics(db, datetime(now.year, now.month, now.day), days_history=1)


@app.get("/api/analytics/weekly", response_model=AnalyticsRead)
def analytics_weekly(db: Session = Depends(get_db)) -> AnalyticsRead:
    return calculate_analytics(db, datetime.utcnow() - timedelta(days=7), days_history=7)


@app.get("/api/analytics/monthly", response_model=AnalyticsRead)
def analytics_monthly(db: Session = Depends(get_db)) -> AnalyticsRead:
    return calculate_analytics(db, datetime.utcnow() - timedelta(days=30), days_history=30)
