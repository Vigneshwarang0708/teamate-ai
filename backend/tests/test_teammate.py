from decimal import Decimal
import uuid
import pytest
from fastapi.testclient import TestClient

from app.database import Base, SessionLocal, engine
from app.main import app
from app.models import Customer, Order, OrderItem, Payment, Product

client = TestClient(app)


def test_health_check():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "TeaMate AI"


def test_products_crud():
    # 1. List products
    resp = client.get("/api/products")
    assert resp.status_code == 200
    initial_count = len(resp.json())
    assert initial_count >= 5  # seeded products exist

    # 2. Create product
    new_prod_name = f"Special Bun Butter Jam {uuid.uuid4().hex[:6]}"
    create_resp = client.post(
        "/api/products",
        json={"name": new_prod_name, "price": 35.0, "category": "Snacks", "available": True},
    )
    assert create_resp.status_code == 201
    prod_id = create_resp.json()["id"]
    assert Decimal(str(create_resp.json()["price"])) == Decimal("35.00")

    # 3. Duplicate name prevention
    dup_resp = client.post(
        "/api/products",
        json={"name": new_prod_name, "price": 40.0, "category": "Snacks", "available": True},
    )
    assert dup_resp.status_code == 409

    # 4. Update product
    update_resp = client.put(
        f"/api/products/{prod_id}",
        json={"name": new_prod_name, "price": 38.5, "category": "Bakery", "available": True},
    )
    assert update_resp.status_code == 200
    assert Decimal(str(update_resp.json()["price"])) == Decimal("38.50")

    # 5. Delete product
    del_resp = client.delete(f"/api/products/{prod_id}")
    assert del_resp.status_code == 204


def test_customers_crud():
    # 1. Create customer
    cust_name = f"Test Bakery {uuid.uuid4().hex[:6]}"
    create_resp = client.post(
        "/api/customers",
        json={"name": cust_name, "phone": "9998887776", "business_name": "Test Bakery Works"},
    )
    assert create_resp.status_code == 201
    cust_id = create_resp.json()["id"]

    # 2. Get customer ledger (initially 0)
    ledger_resp = client.get(f"/api/customers/{cust_id}/ledger")
    assert ledger_resp.status_code == 200
    assert Decimal(str(ledger_resp.json()["outstanding"])) == Decimal("0")


def test_billing_and_idempotency():
    # Get available products
    prods = [p for p in client.get("/api/products").json() if p["available"]]
    p1 = prods[0]
    p2 = prods[1]

    idem_key = str(uuid.uuid4())
    total_val = Decimal(str(p1["price"])) * 2 + Decimal(str(p2["price"]))
    bill_payload = {
        "items": [
            {"product_id": p1["id"], "quantity": 2},
            {"product_id": p2["id"], "quantity": 1},
        ],
        "payment_type": "cash",
        "cash_amount": float(total_val),
        "credit_amount": 0.0,
        "idempotency_key": idem_key,
        "note": "Table 1 test order",
    }

    # 1. Confirm billing
    resp1 = client.post("/api/billing/confirm", json=bill_payload)
    assert resp1.status_code == 201
    order1 = resp1.json()["order"]
    assert len(order1["items"]) == 2
    assert Decimal(str(order1["total"])) == Decimal(str(bill_payload["cash_amount"]))

    # 2. Idempotency test: submit same key
    resp2 = client.post("/api/billing/confirm", json=bill_payload)
    assert resp2.status_code == 201
    assert "already been recorded" in resp2.json()["message"]
    assert resp2.json()["order"]["id"] == order1["id"]


def test_split_payment_validation():
    prods = client.get("/api/products").json()
    p1 = prods[0]
    total_expected = Decimal(str(p1["price"])) * 2

    # Split amounts do not sum to total
    bad_payload = {
        "items": [{"product_id": p1["id"], "quantity": 2}],
        "payment_type": "split",
        "cash_amount": float(total_expected - 5),
        "credit_amount": 0.0,  # missing 5
        "idempotency_key": str(uuid.uuid4()),
        "customer_id": 1,
    }
    resp = client.post("/api/billing/confirm", json=bad_payload)
    assert resp.status_code == 400
    assert "must equal total bill amount" in resp.json()["detail"]


def test_credit_ledger_and_repayments():
    # 1. Create a customer for credit testing
    c_name = f"Credit Customer {uuid.uuid4().hex[:6]}"
    cust = client.post("/api/customers", json={"name": c_name, "phone": "9123456789"}).json()
    c_id = cust["id"]

    # 2. Bill credit purchase
    prods = client.get("/api/products").json()
    p = prods[0]
    unit_price = Decimal(str(p["price"]))
    qty = 3
    expected_total = unit_price * qty

    bill_resp = client.post(
        "/api/billing/confirm",
        json={
            "items": [{"product_id": p["id"], "quantity": qty}],
            "payment_type": "credit",
            "customer_id": c_id,
            "idempotency_key": str(uuid.uuid4()),
        },
    )
    assert bill_resp.status_code == 201

    # 3. Check ledger balance
    ledger = client.get(f"/api/customers/{c_id}/ledger").json()
    assert Decimal(str(ledger["outstanding"])) == expected_total

    # 4. Partial repayment
    partial_amt = float(unit_price)  # repay 1 unit
    repay_resp = client.post("/api/payments", json={"customer_id": c_id, "amount": partial_amt})
    assert repay_resp.status_code == 201

    ledger_after = client.get(f"/api/customers/{c_id}/ledger").json()
    assert Decimal(str(ledger_after["outstanding"])) == expected_total - Decimal(str(partial_amt))

    # 5. Overpayment prevention
    excess_amt = float(expected_total * 2)
    bad_repay = client.post("/api/payments", json={"customer_id": c_id, "amount": excess_amt})
    assert bad_repay.status_code == 400
    assert "cannot exceed" in bad_repay.json()["detail"]


def test_voice_parsing_multilingual():
    # 1. Tanglish credit order: "Anna moonu tea, rendu vadai, Furniture shop account-la podunga"
    resp = client.post(
        "/api/billing/voice",
        data={
            "transcript": "Anna moonu tea, rendu vadai, Furniture shop account-la podunga",
            "language": "auto",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["detected_language"] in ["Tanglish", "Tamil", "English"]
    assert data["customer_name"] == "Furniture Shop"
    assert data["payment_type"] == "credit"
    assert len(data["items"]) >= 2
    # Verify quantities extracted
    tea_item = next((it for it in data["items"] if "tea" in it["product_name"].lower()), None)
    vada_item = next((it for it in data["items"] if "vada" in it["product_name"].lower()), None)
    assert tea_item is not None and tea_item["quantity"] == 3
    assert vada_item is not None and vada_item["quantity"] == 2
    assert not data["ambiguous"]

    # 2. English credit order: "Add three teas and two vadas to Furniture Shop credit account"
    resp_en = client.post(
        "/api/billing/voice",
        data={
            "transcript": "Add three teas and two vadas to Furniture Shop credit account",
            "language": "English",
        },
    )
    assert resp_en.status_code == 200
    data_en = resp_en.json()
    assert data_en["payment_type"] == "credit"
    assert data_en["customer_name"] == "Furniture Shop"
    assert len(data_en["items"]) >= 2

    # 3. Hindi order: "teen chai, do samosa, Furniture Shop ke khate me"
    resp_hi = client.post(
        "/api/billing/voice",
        data={
            "transcript": "Bhaiya teen chai, do samosa, Furniture Shop ke khate me daal do",
            "language": "Hindi",
        },
    )
    assert resp_hi.status_code == 200
    data_hi = resp_hi.json()
    assert data_hi["payment_type"] == "credit"
    assert len(data_hi["items"]) >= 2

    # 4. Pure Tamil cash order: "அண்ணா, மூணு டீ கொடுங்க."
    resp_ta_1 = client.post(
        "/api/billing/voice",
        data={"transcript": "அண்ணா, மூணு டீ கொடுங்க.", "language": "ta"},
    )
    assert resp_ta_1.status_code == 200
    data_ta_1 = resp_ta_1.json()
    assert len(data_ta_1["items"]) == 1
    assert "tea" in data_ta_1["items"][0]["product_name"].lower() or "டீ" in data_ta_1["items"][0]["product_name"].lower()
    assert data_ta_1["items"][0]["quantity"] == 3
    assert data_ta_1["payment_type"] == "cash"
    assert not data_ta_1["ambiguous"]

    # 5. Tamil colloquial multi-item order: "ரெண்டு வடை, ஒரு காபி."
    resp_ta_2 = client.post(
        "/api/billing/voice",
        data={"transcript": "ரெண்டு வடை, ஒரு காபி.", "language": "ta"},
    )
    assert resp_ta_2.status_code == 200
    data_ta_2 = resp_ta_2.json()
    assert len(data_ta_2["items"]) == 2
    vada_it = next((it for it in data_ta_2["items"] if "vada" in it["product_name"].lower()), None)
    coffee_it = next((it for it in data_ta_2["items"] if "coffee" in it["product_name"].lower()), None)
    assert vada_it is not None and vada_it["quantity"] == 2
    assert coffee_it is not None and coffee_it["quantity"] == 1

    # 6. Tamil credit order with customer: "ரவி கடைக்கு ஐந்து டீ கடனாக போடுங்க."
    resp_ta_3 = client.post(
        "/api/billing/voice",
        data={"transcript": "ரவி கடைக்கு ஐந்து டீ கடனாக போடுங்க.", "language": "ta"},
    )
    assert resp_ta_3.status_code == 200
    data_ta_3 = resp_ta_3.json()
    assert data_ta_3["payment_type"] == "credit"
    assert "ravi" in (data_ta_3["customer_name"] or "").lower()
    tea_it_3 = next((it for it in data_ta_3["items"] if "tea" in it["product_name"].lower()), None)
    assert tea_it_3 is not None and tea_it_3["quantity"] == 5

    # 7. Ambiguous command detection
    resp_amb = client.post(
        "/api/billing/voice",
        data={"transcript": "hello give me some items", "language": "auto"},
    )
    assert resp_amb.status_code == 200
    assert resp_amb.json()["ambiguous"] is True
    assert resp_amb.json()["clarification_needed"] is not None


def test_conversational_business_assistant():
    # 1. Ask today's earnings
    q1 = client.post("/api/assistant/query", json={"query": "How much did I earn today?"})
    assert q1.status_code == 200
    assert "today" in q1.json()["response_text"].lower()

    # 2. Ask credit pending
    q2 = client.post("/api/assistant/query", json={"query": "How much credit is pending?"})
    assert q2.status_code == 200
    assert "credit" in q2.json()["response_text"].lower()

    # 3. Ask customer debt
    q3 = client.post("/api/assistant/query", json={"query": "How much does Furniture Shop owe?"})
    assert q3.status_code == 200
    assert "furniture shop" in q3.json()["response_text"].lower()


def test_analytics_endpoints():
    today_res = client.get("/api/analytics/today")
    assert today_res.status_code == 200
    assert "total_sales" in today_res.json()
    assert "sales_trend" in today_res.json()

    weekly_res = client.get("/api/analytics/weekly")
    assert weekly_res.status_code == 200
    assert len(weekly_res.json()["sales_trend"]) == 7

    monthly_res = client.get("/api/analytics/monthly")
    assert monthly_res.status_code == 200
    assert len(monthly_res.json()["sales_trend"]) == 30
