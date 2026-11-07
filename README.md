# TeaMate AI ☕🤖

> **Your voice. Your shop. Your accounts. Automatically.**

TeaMate AI is a complete, production-grade multilingual AI voice billing and credit ledger system designed specifically for solo tea stall owners, juice shop operators, and small food businesses across India.

During rush hours, tea stall owners struggle with mental arithmetic, forgotten customer debts, slow queue turnaround, and lack of daily financial insights. TeaMate AI eliminates billing friction by understanding natural spoken commands in **Tamil, Tanglish, Hindi, and English**, snapshotting actual database prices, updating customer Khatabook ledgers, and speaking verbal confirmations in the owner's language.

---

## 🌟 Key Features

1. **Multilingual Voice Billing Engine**
   - Speak commands naturally:
     - **Tamil**: `"மூன்று டீ, இரண்டு வடை கொடுங்க"`
     - **Tanglish**: `"Anna moonu tea, rendu vadai, Furniture shop account-la podunga"`
     - **English**: `"Add three teas and two vadas to Furniture Shop credit account"`
     - **Hindi**: `"Bhaiya teen chai, do samosa, Furniture Shop ke khate me daal do"`
   - Uses **Gnani Prisma** for speech-to-text with browser Web Speech audio fallback.
   - Intelligent NLU entity extraction (identifies items, quantities, registered customers, payment intent).
   - Ambiguity protection: Asks for clarification if items or credit accounts are unclear.

2. **Database-Driven Dashboard**
   - Real-time financial figures calculated directly from SQLite queries:
     - Today's Total Sales
     - Cash Collected
     - Credit Sales
     - Total Outstanding Customer Debts
     - Total Orders & Average Order Value
   - Recent Transactions feed with instant 1-click digital receipt viewer.
   - Best-selling products ranked by sales volume.

3. **New Billing with Thermal Digital Receipts**
   - Category filter pills (Tea, Beverages, Snacks, Juice).
   - Real-time catalog search and fast quantity adjustments.
   - Payment modes: **Cash**, **Credit**, and **Split Payment** (validates cash + credit = bill total).
   - Generates digital thermal receipts with Print, Download (.txt), and Copy actions.
   - Spoken verbal confirmations using **Gnani Timbre** / browser speech synthesis.
   - Strict idempotency key protection preventing duplicate submissions.

4. **Digital Credit Ledger (Khatabook)**
   - Complete audit trail of credit sales and cash repayments.
   - Customer-wise outstanding balances calculated dynamically (Credit Sales − Repayments).
   - Supports partial repayments and 1-click **Full Repayment** balance settlement.
   - Never overwrites or deletes historical financial records.

5. **Products Management**
   - Add, edit, and archive menu items and categories.
   - Live SQLite price retrieval ensures historical order snapshots remain intact.
   - Demonstration menu seeded: Tea (₹12), Coffee (₹15), Vada (₹10), Samosa (₹15), Juice (₹30), etc.

6. **Daily, Weekly, and Monthly Analytics**
   - Tabbed timeframes: **Today**, **Last 7 Days**, **Last 30 Days**.
   - Interactive SVG/CSS daily sales trend chart with volume counts.
   - Cash vs. Credit visual distribution breakdown.
   - Customer Credit Risk ranking table.

7. **Conversational Voice Business Assistant**
   - Ask real-time questions about your shop's performance:
     - *"How much did I earn today?"*
     - *"How much cash did I collect?"*
     - *"How much credit is pending?"*
     - *"How much does Furniture Shop owe?"*
     - *"Which product sold the most today?"*
     - *"Show yesterday's sales."*
     - *"Record 50 rupees repayment from Furniture Shop"*

---

## 🛠️ Technology Stack

- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, Lucide React, Axios, Web Speech API & MediaRecorder.
- **Backend**: Python 3.13, FastAPI, SQLAlchemy 2.0, SQLite, Pydantic v2.
- **AI Services**: Gnani Prisma (Speech-to-Text), Gnani Timbre (Text-to-Speech), Evon v3.3 & Multilingual NLU Fallback Parser.
- **Design System**: Warm Cream (`#f7f2e9`), Deep Coffee Brown (`#633d2c`), Orange Accent (`#ed7d3a`), Emerald Green (`#39734d`), and thermal receipt styling.

---

## 🚀 Running on Windows PowerShell

Open **two separate Windows PowerShell terminal windows**.

### Terminal 1: Backend (FastAPI)

```powershell
# Navigate to the backend directory
cd C:\Users\vigne\OneDrive\Desktop\teammate-ai\backend

# Activate the existing virtual environment
.\.venv\Scripts\Activate.ps1

# (Optional: install/verify dependencies if needed)
pip install -r requirements.txt

# Start the FastAPI backend server on port 8000
uvicorn app.main:app --reload --port 8000
```

- API Base URL: `http://localhost:8000`
- Interactive Swagger UI: `http://localhost:8000/docs`
- Health check: `http://localhost:8000/api/health`

### Terminal 2: Frontend (React + Vite)

```powershell
# Navigate to the frontend directory
cd C:\Users\vigne\OneDrive\Desktop\teammate-ai\frontend

# Start the Vite development server
npm run dev
```

- Open your browser at: `http://localhost:5173`

---

## 🧪 Automated Testing

A comprehensive automated test suite covers all financial operations, split payments, credit balance calculations, multilingual voice parsing, and business queries.

Run tests in the backend terminal:

```powershell
cd C:\Users\vigne\OneDrive\Desktop\teammate-ai\backend
.\.venv\Scripts\python.exe -m pytest tests\test_teammate.py -v
```

All 9 test suites pass:
- `test_health_check`
- `test_products_crud`
- `test_customers_crud`
- `test_billing_and_idempotency`
- `test_split_payment_validation`
- `test_credit_ledger_and_repayments`
- `test_voice_parsing_multilingual`
- `test_conversational_business_assistant`
- `test_analytics_endpoints`

---

## 🔑 AI Services & Gnani Configuration

Environment variables are located in `backend/.env`:

```env
DATABASE_URL=sqlite:///./teammate.db

# Optional: Gnani Cloud Platform Credentials
GNANI_API_KEY=
GNANI_PRISMA_URL=https://api.gnani.ai/v1/prisma
GNANI_TIMBRE_URL=https://api.gnani.ai/v1/timbre
EVON_MODEL_PATH=
```

- **Prisma & Timbre**: When `GNANI_API_KEY` is provided, live audio files are transcribed and synthesized via Gnani APIs.
- **Graceful Fallback Mode**: If credentials are not configured, TeaMate AI automatically switches to its **Modular Multilingual NLU Fallback Parser** and browser Web Speech synthesis. Hackathon judges can record voice, click demo audio samples, and hear spoken confirmation with zero cloud setup required!

---

## 📋 API Endpoints Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check & Gnani readiness status |
| `GET` | `/api/products` | Retrieve all menu products |
| `POST` | `/api/products` | Create a new product |
| `PUT` | `/api/products/{id}` | Update product details or price |
| `DELETE`| `/api/products/{id}` | Delete or archive menu item |
| `GET` | `/api/customers` | List registered Khatabook customers |
| `POST` | `/api/customers` | Register a new customer |
| `PUT` | `/api/customers/{id}` | Update customer information |
| `GET` | `/api/customers/{id}/ledger` | Complete transaction history & debt calculation |
| `POST` | `/api/payments` | Record customer debt repayment |
| `POST` | `/api/billing/confirm` | Finalize bill, commit items, and trigger audio confirmation |
| `POST` | `/api/billing/voice` | Multilingual STT & NLU order parsing |
| `GET` | `/api/billing/history` | Last 20 recorded transactions |
| `GET` | `/api/analytics/today` | Today's sales, cash, credit, and best sellers |
| `GET` | `/api/analytics/weekly` | 7-day volume trends and customer debt breakdown |
| `GET` | `/api/analytics/monthly`| 30-day volume trends and debtor analysis |
| `POST` | `/api/assistant/query` | Conversational business assistant real-time Q&A |

---
mation audio -> Displays thermal receipt!
6. **Conversational Assistant**:
   - Ask: *"How much did I earn today?"* or *"How much does Furniture Shop owe?"*
   - Real-time answers are spoken back with exact SQLite numbers.
