from datetime import datetime, timedelta
from decimal import Decimal
import logging
import re
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from .gnani_timbre import build_confirmation_phrase, synthesize_speech
from .models import Customer, Order, OrderItem, Payment, Product

logger = logging.getLogger("teammate.assistant")


def get_customer_balance(db: Session, customer_id: int) -> Decimal:
    credit_sales = db.scalar(
        select(func.coalesce(func.sum(Order.credit_amount), 0)).where(Order.customer_id == customer_id)
    ) or Decimal("0")
    repayments = db.scalar(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(Payment.customer_id == customer_id)
    ) or Decimal("0")
    return max(Decimal("0"), credit_sales - repayments)


async def handle_assistant_query(query: str, db: Session, language: str = "auto") -> dict[str, Any]:
    """Processes conversational business questions by querying SQLite in real time."""
    q = query.strip()
    q_lower = q.lower()
    now = datetime.utcnow()
    start_of_today = datetime(now.year, now.month, now.day)
    start_of_yesterday = start_of_today - timedelta(days=1)

    intent = "unknown"
    response_text = ""
    data: dict[str, Any] = {}
    action_performed = False

    # 1. Check for Repayment recording: "record 100 rupees repayment from Furniture Shop"
    repayment_match = re.search(
        r"(?:record|add|received?|collected?|got)\s+(?:rupees?|rs\.?|₹)?\s*(\d+(?:\.\d+)?)\s*(?:rupees?|rs\.?)?\s*(?:repayment|payment|credit payment)?\s*(?:from|for|by)?\s*(.+)",
        q_lower,
    )
    if ("repay" in q_lower or "repayment" in q_lower or "paid" in q_lower or "received" in q_lower) and repayment_match:
        amount_val = Decimal(repayment_match.group(1))
        target_name = repayment_match.group(2).replace("repayment", "").replace("from", "").strip()

        # Find customer
        customers = list(db.scalars(select(Customer)))
        matched_cust = None
        for c in customers:
            if c.name.lower() in target_name or target_name in c.name.lower() or (c.business_name and c.business_name.lower() in target_name):
                matched_cust = c
                break

        if matched_cust:
            current_balance = get_customer_balance(db, matched_cust.id)
            if amount_val > current_balance:
                response_text = f"Cannot record repayment of ₹{amount_val}. {matched_cust.name}'s outstanding balance is only ₹{current_balance}."
            else:
                payment = Payment(
                    customer_id=matched_cust.id,
                    amount=amount_val,
                    payment_type="repayment",
                    note=f"Voice Assistant logged repayment: {q}",
                )
                db.add(payment)
                db.commit()
                db.refresh(payment)
                new_balance = get_customer_balance(db, matched_cust.id)
                response_text = f"Successfully recorded ₹{amount_val} repayment from {matched_cust.name}. Remaining balance is ₹{new_balance}."
                action_performed = True
                intent = "record_repayment"
                data = {"customer_id": matched_cust.id, "amount": float(amount_val), "new_balance": float(new_balance)}
        else:
            response_text = f"Recognized repayment amount ₹{amount_val}, but could not identify the customer '{target_name}'. Please verify the customer name."
            intent = "repayment_customer_not_found"

    # 2. Check for Today's Earnings / Sales:
    elif any(k in q_lower for k in ["earn today", "today's sale", "today sales", "sales today", "total today", "revenue today", "innaiku sales"]):
        today_orders = list(db.scalars(select(Order).where(Order.created_at >= start_of_today)))
        total_sales = sum((o.total for o in today_orders), Decimal("0"))
        order_count = len(today_orders)
        response_text = f"Today's total sales are ₹{total_sales:,.0f} across {order_count} orders."
        intent = "today_sales"
        data = {"total_sales": float(total_sales), "total_orders": order_count}

    # 3. Check for Cash collected today:
    elif any(k in q_lower for k in ["cash did i collect", "cash collect", "cash sales", "cash today"]):
        today_orders = list(db.scalars(select(Order).where(Order.created_at >= start_of_today)))
        cash_collected = sum((o.cash_amount for o in today_orders), Decimal("0"))
        # Add any cash repayments today
        today_repayments = db.scalar(
            select(func.coalesce(func.sum(Payment.amount), 0)).where(Payment.created_at >= start_of_today)
        ) or Decimal("0")
        total_cash_in_hand = cash_collected + today_repayments
        response_text = f"You collected ₹{cash_collected:,.0f} from cash sales today (plus ₹{today_repayments:,.0f} in repayments, total cash in hand: ₹{total_cash_in_hand:,.0f})."
        intent = "cash_collected"
        data = {"cash_sales": float(cash_collected), "repayments": float(today_repayments), "total_cash": float(total_cash_in_hand)}

    # 4. Check for Total Outstanding Credit:
    elif any(k in q_lower for k in ["credit is pending", "pending credit", "total credit", "outstanding credit", "kadan evlo", "udhaar"]):
        all_credit = db.scalar(select(func.coalesce(func.sum(Order.credit_amount), 0))) or Decimal("0")
        all_repaid = db.scalar(select(func.coalesce(func.sum(Payment.amount), 0))) or Decimal("0")
        total_outstanding = max(Decimal("0"), all_credit - all_repaid)
        response_text = f"Total outstanding credit across all customers is ₹{total_outstanding:,.0f}."
        intent = "credit_pending"
        data = {"outstanding_credit": float(total_outstanding)}

    # 5. Check for Specific Customer balance / debt: e.g. "How much does Furniture Shop owe?"
    elif any(k in q_lower for k in ["owe", "owes", "due", "balance", "account balance"]):
        customers = list(db.scalars(select(Customer)))
        matched_cust = None
        for c in customers:
            if c.name.lower() in q_lower or (c.business_name and c.business_name.lower() in q_lower):
                matched_cust = c
                break
            # Also check partial match for multi-word shop names
            first_word = c.name.lower().split()[0]
            if len(first_word) >= 4 and first_word in q_lower:
                matched_cust = c
                break

        if matched_cust:
            bal = get_customer_balance(db, matched_cust.id)
            response_text = f"{matched_cust.name} currently owes ₹{bal:,.0f}."
            intent = "customer_balance"
            data = {"customer_name": matched_cust.name, "customer_id": matched_cust.id, "balance": float(bal)}
        else:
            response_text = "I couldn't identify the customer name in your question. Please specify the registered customer name."
            intent = "customer_not_found"

    # 6. Check for Best-selling product:
    elif any(k in q_lower for k in ["sold the most", "best selling", "top sell", "top product", "most popular", "highest sale"]):
        today_orders = list(
            db.scalars(
                select(Order)
                .options(joinedload(Order.items).joinedload(OrderItem.product))
                .where(Order.created_at >= start_of_today)
            ).unique().all()
        )
        counts: dict[str, int] = {}
        for o in today_orders:
            for itm in o.items:
                counts[itm.product.name] = counts.get(itm.product.name, 0) + itm.quantity

        if counts:
            best_product, qty = max(counts.items(), key=lambda p: p[1])
            response_text = f"The best-selling product today is {best_product} with {qty} orders sold."
            intent = "top_product"
            data = {"best_product": best_product, "quantity_sold": qty}
        else:
            response_text = "No products have been sold yet today."
            intent = "top_product_none"

    # 7. Check for Yesterday's sales:
    elif "yesterday" in q_lower:
        yesterday_orders = list(
            db.scalars(
                select(Order).where(Order.created_at >= start_of_yesterday, Order.created_at < start_of_today)
            )
        )
        yesterday_sales = sum((o.total for o in yesterday_orders), Decimal("0"))
        response_text = f"Yesterday's total sales were ₹{yesterday_sales:,.0f} across {len(yesterday_orders)} orders."
        intent = "yesterday_sales"
        data = {"yesterday_sales": float(yesterday_sales), "orders_count": len(yesterday_orders)}

    # Fallback response
    else:
        response_text = (
            "I can answer questions about today's sales, cash collected, outstanding credit, "
            "customer balances (e.g. 'How much does Furniture Shop owe?'), best sellers, or record repayments."
        )
        intent = "help"

    # Build a language-matched spoken response text if Tamil/Tanglish was used
    spoken_text = _build_spoken_response(response_text, intent, data, language)

    # Generate synthesized speech using the matched language
    tts_result = await synthesize_speech(spoken_text, language=language)

    return {
        "query": query,
        "response_text": response_text,
        "intent": intent,
        "language": language,
        "data": data,
        "action_performed": action_performed,
        "audio_base64": tts_result.get("audio_base64"),
    }


def _build_spoken_response(response_text: str, intent: str, data: dict, language: str) -> str:
    """Returns a naturally-spoken version of the assistant response in the target language.

    For Tamil and Tanglish queries, amounts are converted to Tamil words for clear TTS output.
    English responses are returned as-is (numbers are spoken naturally by English TTS).
    """
    from .gnani_timbre import amount_to_tamil_words
    lang = language.lower().strip()

    if lang not in ("ta", "tamil", "tanglish"):
        # English and Hindi: return plain text — TTS handles numbers fine
        return response_text

    # Build natural Tamil spoken responses for each intent
    if intent == "today_sales":
        total = data.get("total_sales", 0)
        orders = data.get("total_orders", 0)
        words = amount_to_tamil_words(total)
        return f"இன்று {orders} ஆர்டர்களில் மொத்தம் {words} ரூபாய் விற்பனை ஆனது."

    elif intent == "cash_collected":
        cash = data.get("cash_sales", 0)
        words = amount_to_tamil_words(cash)
        return f"இன்று கைமாற்றாக {words} ரூபாய் வசூல் ஆனது."

    elif intent == "credit_pending":
        outstanding = data.get("outstanding_credit", 0)
        words = amount_to_tamil_words(outstanding)
        return f"மொத்த கடன் நிலுவை {words} ரூபாய் உள்ளது."

    elif intent == "customer_balance":
        name = data.get("customer_name", "")
        balance = data.get("balance", 0)
        words = amount_to_tamil_words(balance)
        return f"{name} கடை {words} ரூபாய் கடனில் உள்ளது."

    elif intent == "record_repayment":
        amount = data.get("amount", 0)
        new_bal = data.get("new_balance", 0)
        amt_words = amount_to_tamil_words(amount)
        bal_words = amount_to_tamil_words(new_bal)
        return f"{amt_words} ரூபாய் திரும்ப செலுத்தல் பதிவு செய்யப்பட்டது. மீதம் {bal_words} ரூபாய் கடன் உள்ளது."

    elif intent == "top_product":
        product = data.get("best_product", "")
        qty = data.get("quantity_sold", 0)
        return f"இன்று மிகவும் அதிகமாக விற்ற பொருள் {product}, மொத்தம் {qty} தடவை விற்கப்பட்டது."

    elif intent == "yesterday_sales":
        total = data.get("yesterday_sales", 0)
        orders = data.get("orders_count", 0)
        words = amount_to_tamil_words(total)
        return f"நேற்று {orders} ஆர்டர்களில் மொத்தம் {words} ரூபாய் விற்பனை ஆனது."

    # For other intents or if we cannot map, fall back to English text
    return response_text

