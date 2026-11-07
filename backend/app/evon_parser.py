import logging
import os
import re
from decimal import Decimal
from typing import Any
from dotenv import load_dotenv

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Customer, Product

logger = logging.getLogger("teammate.evon")

load_dotenv()
EVON_MODEL_PATH = os.getenv("EVON_MODEL_PATH", "").strip()

# Multilingual quantity word dictionary (Tamil, Tanglish, Hindi, English, Digits)
QUANTITY_WORDS: dict[str, int] = {
    # Digits
    "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10,
    # Tamil numerals
    "௧": 1, "௨": 2, "௩": 3, "௪": 4, "௫": 5, "௬": 6, "௭": 7, "௮": 8, "௯": 9, "௰": 10,
    # English
    "a": 1, "an": 1, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    # Tamil script (Formal and Colloquial Spoken Tamil)
    "ஒரு": 1, "ஒன்று": 1, "ஒண்ணு": 1, "ஒன்னு": 1,
    "இரண்டு": 2, "ரெண்டு": 2, "ரெண்டோ": 2,
    "மூன்று": 3, "மூணு": 3, "மூனே": 3,
    "நான்கு": 4, "நாங்கு": 4, "நாலு": 4,
    "ஐந்து": 5, "அஞ்சு": 5,
    "ஆறு": 6,
    "ஏழு": 7,
    "எட்டு": 8,
    "ஒன்பது": 9, "ஒம்போது": 9,
    "பத்து": 10,
    # Tanglish (Tamil written in Latin script)
    "oru": 1, "onnu": 1, "onru": 1,
    "rendu": 2, "rendo": 2, "irandu": 2,
    "moonu": 3, "moone": 3, "moondru": 3,
    "naalu": 4, "nalu": 4, "naangu": 4,
    "anju": 5, "ainthu": 5, "aindhu": 5,
    "aaru": 6,
    "yezhu": 7, "elu": 7,
    "ettu": 8,
    "onbadhu": 9, "onpathu": 9, "ombodhu": 9,
    "pathu": 10,
    # Hindi script
    "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पांच": 5, "पाँच": 5, "छह": 6, "सात": 7, "ஆठ": 8, "नौ": 9, "दस": 10,
    # Hinglish
    "ek": 1, "do": 2, "dho": 2, "teen": 3, "tin": 3, "chaar": 4, "char": 4,
    "paanch": 5, "panch": 5, "che": 6, "chhah": 6, "saat": 7, "aath": 8, "nau": 9, "das": 10,
}

# Product name synonyms mapping to common menu items
PRODUCT_SYNONYMS: dict[str, list[str]] = {
    "Tea": ["tea", "teas", "chai", "chaaya", "டீ", "டி", "தேநீர்", "chaya", "chaye"],
    "Masala Tea": ["masala tea", "masala chai", "மசாலா டீ", "மசாலா tea", "மசாலா டி", "masala chaya"],
    "Ginger Tea": ["ginger tea", "inji tea", "adrak chai", "இஞ்சி டீ", "இஞ்சி tea", "இஞ்சி டி", "adrak tea", "inji chai"],
    "Coffee": ["coffee", "kaapi", "kapi", "காபி", "காபீ", "கோல்ட் காபி", "coffees"],
    "Filter Coffee": ["filter coffee", "filter kaapi", "பில்டர் காபி", "ஃபில்டர் காபி", "பில்டர் coffee"],
    "Vada": ["vada", "vadai", "vadas", "medu vada", "மெது வடை", "வடை", "வட", "vadaye"],
    "Samosa": ["samosa", "samosas", "சமோசா", "समोसा", "somosa"],
    "Fresh Lime Juice": ["lime juice", "fresh lime", "lemon juice", "elamichai juice", "எலுமிச்சை ஜூஸ்"],
    "Juice": ["juice", "juices", "ஜூஸ்", "சாறு"],
}

# Tamil transliterations of common customer and shop names
TAMIL_CUSTOMER_TRANSLIT: dict[str, str] = {
    "பர்னிச்சர்": "furniture",
    "பர்னிச்சரு": "furniture",
    "ஃபர்னிச்சர்": "furniture",
    "ரவி": "ravi",
    "கவிதா": "kavitha",
    "கடைக்கு": "shop",
    "கடை": "shop",
    "ஆட்டோ": "auto",
}

CREDIT_TRIGGERS = [
    "account", "account-la", "accountla", "acc-la", "ac-la", "ac",
    "kadan", "kanakku", "kanakkula", "kanakula",
    "கடன்", "கடனாக", "கடனாகப்", "கடனா", "கடனில்", "கடன்ல", "கடன",
    "கணக்கு", "கணக்கில்", "கணக்குல", "கணக்கா",
    "khata", "khate", "khate me", "khate mein", "udhaar", "udhar", "उधार", "खाता",
    "credit", "credit-la", "khatabook", "pay later", "book-la", "tab",
]

CASH_TRIGGERS = [
    "cash", "kaasu", "panam", "rooba", "roopai", "rokad", "paid", "பணம்", "காசு", "நொடி", "நேரடி", "नकद"
]


def detect_language(text: str) -> str:
    """Identifies the dominant script / style of the speech text."""
    # Check for Tamil unicode block \u0B80 - \u0BFF
    if re.search(r"[\u0B80-\u0BFF]", text):
        return "Tamil"
    # Check for Devanagari (Hindi) unicode block \u0900 - \u097F
    if re.search(r"[\u0900-\u097F]", text):
        return "Hindi"

    text_lower = text.lower()
    tanglish_words = {
        "anna", "podunga", "rendu", "moonu", "naalu", "anju", "kadan",
        "kanakula", "account-la", "accountla", "kodu", "kodunga", "thanga", "inji", "kaapi"
    }
    hinglish_words = {"bhaiya", "bhai", "teen", "chaar", "paanch", "khate", "daal", "do", "dijiye", "rokad", "udhaar"}

    words = set(re.findall(r"\w+", text_lower))
    if words.intersection(tanglish_words):
        return "Tanglish"
    if words.intersection(hinglish_words):
        return "Hindi"
    return "English"


def parse_order_command(transcript: str, db: Session, target_language: str = "auto") -> dict[str, Any]:
    """Interprets multilingual voice billing commands.
    
    Extracts:
    - Products and quantities (validating against real DB inventory and current prices)
    - Customer identification (matching registered customers in SQLite with Tamil transliteration support)
    - Payment method (credit vs cash)
    - Ambiguity indicators for interactive confirmation
    """
    detected_lang = detect_language(transcript) if target_language == "auto" else target_language
    text_clean = transcript.strip()
    text_lower = text_clean.lower()

    # Determine parser engine: Evon model is optional, fallback NLU is the default
    is_evon_configured = bool(EVON_MODEL_PATH and os.path.exists(EVON_MODEL_PATH))
    parser_mode = "gnani_evon" if is_evon_configured else "fallback_nlu"

    # Fetch available products and registered customers from database
    db_products = list(db.scalars(select(Product).where(Product.available == True)))
    db_customers = list(db.scalars(select(Customer)))

    detected_items: list[dict[str, Any]] = []
    matched_product_ids = set()

    # Sort quantity words by length descending so multi-char words match before single digits
    qty_keys_sorted = sorted(QUANTITY_WORDS.keys(), key=lambda k: len(k), reverse=True)
    qty_pattern_group = "|".join((re.escape(k) for k in qty_keys_sorted))

    # 1. Product & Quantity matching
    for prod in db_products:
        prod_name_lower = prod.name.lower()
        search_terms = PRODUCT_SYNONYMS.get(prod.name, [prod_name_lower])
        if prod_name_lower not in search_terms:
            search_terms.append(prod_name_lower)

        # Sort terms by length descending (e.g. "masala tea" before "tea")
        search_terms = sorted(search_terms, key=lambda s: len(s), reverse=True)

        for term in search_terms:
            # Pattern A: <quantity> <product> (with optional punctuation like comma or colon)
            pattern_before = rf"(?:({qty_pattern_group})[\s,:]+(?:of\s+)?{re.escape(term)})(?:[\s,.]|$)"
            # Pattern B: <product> <quantity>
            pattern_after = rf"(?:{re.escape(term)}[\s,:]+({qty_pattern_group}))(?:[\s,.]|$)"
            # Pattern C: standalone product mention
            pattern_standalone = rf"(?:\b|[\s,]|^){re.escape(term)}(?:\b|[\s,.]|$)"

            match_a = re.search(pattern_before, text_lower)
            match_b = re.search(pattern_after, text_lower)
            match_c = re.search(pattern_standalone, text_lower)

            quantity = 0
            if match_a:
                qty_raw = match_a.group(1).lower()
                quantity = QUANTITY_WORDS.get(qty_raw, 1)
            elif match_b:
                qty_raw = match_b.group(1).lower()
                quantity = QUANTITY_WORDS.get(qty_raw, 1)
            elif match_c:
                quantity = 1  # Default to 1 if product is clearly mentioned without quantity

            if quantity > 0 and prod.id not in matched_product_ids:
                subtotal = prod.price * Decimal(quantity)
                detected_items.append({
                    "product_id": prod.id,
                    "product_name": prod.name,
                    "quantity": quantity,
                    "unit_price": prod.price,
                    "subtotal": subtotal,
                })
                matched_product_ids.add(prod.id)
                break

    # 2. Customer Identification (with Tamil transliteration support)
    # Create normalized string mapping Tamil transliterations
    normalized_for_customer = text_lower
    for ta_token, en_token in TAMIL_CUSTOMER_TRANSLIT.items():
        normalized_for_customer = normalized_for_customer.replace(ta_token, en_token)

    matched_customer: Customer | None = None
    for cust in db_customers:
        cust_name_lower = cust.name.lower()
        # Direct check in text or transliterated text
        if cust_name_lower in text_lower or cust_name_lower in normalized_for_customer:
            matched_customer = cust
            break
        # Business name check
        if cust.business_name:
            b_lower = cust.business_name.lower()
            if b_lower in text_lower or b_lower in normalized_for_customer:
                matched_customer = cust
                break
        # First word / shop name check (e.g. "Furniture", "Ravi")
        first_token = cust_name_lower.split()[0]
        if len(first_token) >= 4 and (first_token in text_lower or first_token in normalized_for_customer):
            matched_customer = cust
            break

    # 3. Payment Method Identification
    is_credit = False
    is_cash = False

    for trigger in CREDIT_TRIGGERS:
        if trigger in text_lower or trigger in normalized_for_customer:
            is_credit = True
            break

    for trigger in CASH_TRIGGERS:
        if trigger in text_lower:
            is_cash = True
            break

    # If customer is explicitly mentioned with an account/credit cue, select credit
    if is_credit or (matched_customer is not None and any(word in text_lower for word in ["account", "account-la", "khate", "kadan", "கடன்", "கணக்கு"])):
        payment_type = "credit"
    elif is_cash:
        payment_type = "cash"
    else:
        # Default payment type is cash unless credit is specified
        payment_type = "cash"

    # 4. Total calculation
    total_amount = sum((item["subtotal"] for item in detected_items), Decimal("0"))

    # 5. Ambiguity & Clarification checks
    ambiguous = False
    clarification_needed: str | None = None

    if not detected_items:
        ambiguous = True
        clarification_needed = "No matching menu items recognized. Please state the products and quantities, like '3 tea, 2 vada'."
    elif payment_type == "credit" and not matched_customer:
        ambiguous = True
        clarification_needed = "Credit payment requested, but the customer account was not recognized. Please specify the customer."

    explanation = f"Recognized {len(detected_items)} item(s) via {parser_mode} ({detected_lang})."
    if matched_customer:
        explanation += f" Linked to customer '{matched_customer.name}'."

    return {
        "transcript": transcript,
        "detected_language": detected_lang,
        "items": detected_items,
        "customer_id": matched_customer.id if matched_customer else None,
        "customer_name": matched_customer.name if matched_customer else None,
        "payment_type": payment_type,
        "total_amount": total_amount,
        "ambiguous": ambiguous,
        "clarification_needed": clarification_needed,
        "parser_mode": parser_mode,
        "explanation": explanation,
    }
