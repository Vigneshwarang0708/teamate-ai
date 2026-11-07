import axios from "axios";

export const api = axios.create({
  baseURL: "http://localhost:8000/api",
  timeout: 15000,
});

export type Product = {
  id: number;
  name: string;
  price: string | number;
  category: string;
  available: boolean;
  created_at?: string;
};

export type Customer = {
  id: number;
  name: string;
  phone: string | null;
  business_name?: string | null;
  created_at?: string;
  outstanding?: string | number;
};

export type OrderItem = {
  product_id?: number;
  product_name: string;
  quantity: number;
  unit_price: string | number;
  subtotal: string | number;
};

export type Order = {
  id: number;
  order_number?: string;
  total: string | number;
  payment_type: "cash" | "credit" | "split" | string;
  payment_status: string;
  cash_amount: string | number;
  credit_amount: string | number;
  customer_id?: number | null;
  customer_name?: string | null;
  created_at: string;
  note?: string | null;
  items: OrderItem[];
};

export type DailySalesPoint = {
  date: string;
  sales: string | number;
  orders_count: number;
};

export type CustomerCreditSummary = {
  customer_id: number;
  customer_name: string;
  business_name?: string | null;
  outstanding: string | number;
};

export type Analytics = {
  total_sales: string | number;
  cash_collected: string | number;
  credit_sales: string | number;
  outstanding_credit: string | number;
  total_orders: number;
  average_order_value: string | number;
  top_products: { name: string; quantity: number }[];
  sales_trend: DailySalesPoint[];
  customer_credit_breakdown: CustomerCreditSummary[];
};

export type LedgerEntry = {
  id: number;
  kind: "credit_sale" | "repayment" | string;
  amount: string | number;
  payment_type: string;
  note: string | null;
  reference_id: string | null;
  created_at: string;
};

export type Ledger = Customer & {
  outstanding: string | number;
  total_credit: string | number;
  total_repaid: string | number;
  entries: LedgerEntry[];
};

export type VoiceParseItem = {
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: string | number;
  subtotal: string | number;
};

export type VoiceParseResult = {
  transcript: string;
  detected_language: string;
  items: VoiceParseItem[];
  customer_id: number | null;
  customer_name: string | null;
  payment_type: "cash" | "credit" | "split";
  total_amount: string | number;
  ambiguous: boolean;
  clarification_needed: string | null;
  parser_mode: string;
  explanation: string;
};

export type AssistantQueryResult = {
  query: string;
  response_text: string;
  intent: string;
  language: string;
  audio_base64: string | null;
  data: Record<string, any> | null;
  action_performed: boolean;
};

export type HealthResponse = {
  status: string;
  gnani_configured: boolean;
  evon_configured: boolean;
  tts_tamil_voice?: string;
  tts_available_tamil_voices?: string[];
  services?: {
    gnani_prisma_stt: string;
    gnani_timbre_tts: string;
    evon_nlu: string;
    fallback_nlu_parser: string;
  };
};

export const fetchHealth = () => api.get<HealthResponse>("/health");
export const updateVoiceSetting = (tamilVoice: string) =>
  api.post<{ success: boolean; tamil_voice: string; message: string }>("/settings/voice", { tamil_voice: tamilVoice });
export const fetchProducts = () => api.get<Product[]>("/products");
export const createProduct = (payload: Omit<Product, "id">) => api.post<Product>("/products", payload);
export const updateProduct = (id: number, payload: Partial<Product>) => api.put<Product>(`/products/${id}`, payload);
export const deleteProduct = (id: number) => api.delete(`/products/${id}`);

export const fetchCustomers = () => api.get<Customer[]>("/customers");
export const createCustomer = (payload: { name: string; phone?: string | null; business_name?: string | null }) =>
  api.post<Customer>("/customers", payload);
export const updateCustomer = (id: number, payload: { name: string; phone?: string | null; business_name?: string | null }) =>
  api.put<Customer>(`/customers/${id}`, payload);
export const fetchCustomerLedger = (customerId: number) => api.get<Ledger>(`/customers/${customerId}/ledger`);

export const fetchBillingHistory = () => api.get<Order[]>("/billing/history");
export const confirmBilling = (payload: {
  items: { product_id: number; quantity: number }[];
  customer_id?: number | null;
  payment_type: string;
  cash_amount?: number;
  credit_amount?: number;
  idempotency_key: string;
  note?: string;
  spoken_language?: string;
}) => api.post<{ order: Order; message: string; speech_text?: string; speech_audio_base64?: string }>("/billing/confirm", payload);

export const recordPayment = (payload: { customer_id: number; amount: number; payment_type?: string; note?: string }) =>
  api.post<LedgerEntry>("/payments", payload);

export const fetchAnalytics = (period: "today" | "weekly" | "monthly" = "today") =>
  api.get<Analytics>(`/analytics/${period}`);

export const parseVoiceCommand = async (transcript?: string, language: string = "auto", audioBlob?: Blob) => {
  const formData = new FormData();
  if (transcript) formData.append("transcript", transcript);
  formData.append("language", language);
  if (audioBlob) {
    formData.append("audio", audioBlob, "recording.wav");
  }
  return api.post<VoiceParseResult>("/billing/voice", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

export const queryAssistant = (query: string, language: string = "auto") =>
  api.post<AssistantQueryResult>("/assistant/query", { query, language });
