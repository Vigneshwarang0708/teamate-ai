import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  Coffee,
  CreditCard,
  Mic,
  MicOff,
  Receipt,
  RotateCcw,
  Send,
  Sparkles,
  Volume2,
} from "lucide-react";
import { ReceiptModal } from "../components/ReceiptModal";
import {
  confirmBilling,
  Order,
  parseVoiceCommand,
  queryAssistant,
  VoiceParseResult,
} from "../services/api";
import { createAudioRecorder, playAudio } from "../services/speech";

type Props = {
  shopName: string;
  onSaved: () => void;
};

const formatMoney = (val: string | number) =>
  `₹${Number(val || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const DEMO_COMMANDS = [
  {
    title: "Tanglish Credit",
    badge: "Tanglish",
    text: "Anna moonu tea, rendu vadai, Furniture shop account-la podunga",
    lang: "tanglish",
  },
  {
    title: "Tamil Cash",
    badge: "தமிழ்",
    text: "மூன்று டீ, இரண்டு வடை கொடுங்க",
    lang: "ta",
  },
  {
    title: "English Credit",
    badge: "English",
    text: "Add three teas and two vadas to Furniture Shop credit account",
    lang: "en",
  },
  {
    title: "Hindi Credit",
    badge: "हिंदी",
    text: "Bhaiya teen chai, do samosa, Furniture Shop ke khate me daal do",
    lang: "hi",
  },
  {
    title: "Quick Coffee & Samosa",
    badge: "Cash",
    text: "2 Filter Coffee, 1 Samosa",
    lang: "en",
  },
];

const ASSISTANT_SUGGESTIONS = [
  "How much did I earn today?",
  "How much cash did I collect?",
  "How much credit is pending?",
  "How much does Furniture Shop owe?",
  "Which product sold the most today?",
  "Show yesterday's sales.",
  "Record 50 rupees repayment from Furniture Shop",
];

export function VoiceAssistantPage({ shopName, onSaved }: Props) {
  const [activeTab, setActiveTab] = useState<"billing" | "business">("billing");

  // Tab 1: Voice Billing States
  const [targetLang, setTargetLang] = useState("ta");
  const [transcript, setTranscript] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [parsing, setParsing] = useState(false);
  const [parseResult, setParseResult] = useState<VoiceParseResult | null>(null);
  const [parseError, setParseError] = useState("");
  const [savingOrder, setSavingOrder] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);
  const [statusMessage, setStatusMessage] = useState("");

  const recorderRef = useRef<ReturnType<typeof createAudioRecorder> | null>(null);
  const timerRef = useRef<any>(null);

  // Tab 2: Business Intelligence Chat States
  const [chatMessages, setChatMessages] = useState<
    { role: "user" | "assistant"; text: string; time: string; intent?: string }[]
  >([
    {
      role: "assistant",
      text: `Vanakkam! I am your TeaMate business assistant. Ask me questions about today's sales, cash collections, customer debts, or tell me to record repayments.`,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [queryInput, setQueryInput] = useState("");
  const [askingAssistant, setAskingAssistant] = useState(false);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Handle Audio Recording Start / Stop
  const toggleRecording = async () => {
    if (isRecording) {
      // STOP recording
      if (timerRef.current) clearInterval(timerRef.current);
      setIsRecording(false);
      if (recorderRef.current) {
        const audioBlob = await recorderRef.current.stop();
        if (audioBlob && audioBlob.size > 0) {
          handleParse(undefined, audioBlob);
        }
      }
    } else {
      // START recording
      if (!recorderRef.current) {
        recorderRef.current = createAudioRecorder();
      }
      const allowed = await recorderRef.current.start();
      if (!allowed) {
        setParseError("Microphone access was denied. You can also type or use sample voice commands below.");
        return;
      }
      setIsRecording(true);
      setRecordingSeconds(0);
      setParseError("");
      setStatusMessage("Listening... Speak your order clearly.");

      // Browser Web Speech live preview if supported
      if (typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)) {
        try {
          const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
          const recognition = new SpeechRecognition();
          recognition.continuous = false;
          recognition.interimResults = true;
          recognition.lang =
            targetLang === "ta" || targetLang === "tanglish"
              ? "ta-IN"
              : targetLang === "hi"
              ? "hi-IN"
              : "en-IN";
          recognition.onresult = (evt: any) => {
            const current = Array.from(evt.results)
              .map((r: any) => r[0].transcript)
              .join("");
            setTranscript(current);
          };
          recognition.start();
        } catch (e) {
          // Fall back gracefully
        }
      }

      timerRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    }
  };

  // Run AI Parse on Transcript or Audio Blob
  const handleParse = async (overrideText?: string, audioBlob?: Blob) => {
    const textToParse = overrideText !== undefined ? overrideText : transcript;
    if (!textToParse.trim() && !audioBlob) {
      setParseError("Please speak into the microphone or enter a command.");
      return;
    }

    setParsing(true);
    setParseError("");
    setParseResult(null);
    setStatusMessage("Processing speech and interpreting products with AI engine...");

    try {
      const res = await parseVoiceCommand(textToParse.trim() || undefined, targetLang, audioBlob);
      setParseResult(res.data);
      setTranscript(res.data.transcript || textToParse);
      if (res.data.ambiguous && res.data.clarification_needed) {
        setParseError(res.data.clarification_needed);
      }
      setStatusMessage("");
    } catch (err: any) {
      console.error("Parse voice error:", err);
      setParseError(err.response?.data?.detail || "Could not interpret command. Please check transcript.");
      setStatusMessage("");
    } finally {
      setParsing(false);
    }
  };

  // Confirm extracted order and save to SQLite
  const handleConfirmExtractedBill = async () => {
    if (!parseResult || parseResult.items.length === 0) return;

    if (parseResult.payment_type === "credit" && !parseResult.customer_id) {
      setParseError("Credit transaction cannot be completed without an identified customer account.");
      return;
    }

    setSavingOrder(true);
    setParseError("");
    try {
      const idempotencyKey = crypto.randomUUID();
      const payload = {
        items: parseResult.items.map((it) => ({
          product_id: it.product_id,
          quantity: it.quantity,
        })),
        customer_id: parseResult.customer_id,
        payment_type: parseResult.payment_type,
        cash_amount: parseResult.payment_type === "cash" ? Number(parseResult.total_amount) : 0,
        credit_amount: parseResult.payment_type === "credit" ? Number(parseResult.total_amount) : 0,
        idempotency_key: idempotencyKey,
        note: `Voice Order: "${parseResult.transcript}"`,
        spoken_language: parseResult.detected_language || targetLang,
      };

      const res = await confirmBilling(payload);
      setConfirmedOrder(res.data.order);
      setStatusMessage(res.data.message);

      // Play synthesized spoken voice confirmation
      if (res.data.speech_text || res.data.speech_audio_base64) {
        playAudio(res.data.speech_audio_base64, res.data.speech_text, parseResult.detected_language);
      }

      setParseResult(null);
      setTranscript("");
      onSaved();
    } catch (err: any) {
      console.error("Save voice bill error:", err);
      setParseError(err.response?.data?.detail || "Could not save bill to database.");
    } finally {
      setSavingOrder(false);
    }
  };

  // Tab 2: Send Business Intelligence Assistant Query
  const handleSendAssistantQuery = async (queryText?: string) => {
    const q = (queryText || queryInput).trim();
    if (!q) return;

    const userMsg = {
      role: "user" as const,
      text: q,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setChatMessages((prev) => [...prev, userMsg]);
    setQueryInput("");
    setAskingAssistant(true);

    try {
      const res = await queryAssistant(q, targetLang);
      const assistantMsg = {
        role: "assistant" as const,
        text: res.data.response_text,
        intent: res.data.intent,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setChatMessages((prev) => [...prev, assistantMsg]);

      // Play audio response
      if (res.data.audio_base64 || res.data.response_text) {
        playAudio(res.data.audio_base64, res.data.response_text, res.data.language);
      }

      if (res.data.action_performed) {
        onSaved(); // reload balances
      }
    } catch (err: any) {
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "I encountered an error querying the database. Please try again.",
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setAskingAssistant(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 md:px-10">
      {/* Top Header */}
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 items-center rounded-full bg-[#fff0e5] px-2.5 text-[10px] font-bold uppercase tracking-wider text-[#ed7d3a]">
              Gnani AI & NLU Powered
            </span>
          </div>
          <h1 className="mt-1 font-serif text-3xl font-bold tracking-tight text-[#3d2a22]">
            Multilingual Voice Assistant
          </h1>
          <p className="mt-1 text-sm text-[#927d70]">
            Speak naturally in Tamil, Tanglish, Hindi, or English. Orders are verified and prices calculated from SQLite.
          </p>
        </div>

        {/* Feature Tabs */}
        <div className="flex gap-1.5 rounded-2xl border border-[#eadfd2] bg-[#fffdf9] p-1.5 shadow-sm">
          <button
            onClick={() => setActiveTab("billing")}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === "billing"
                ? "bg-[#633d2c] text-white shadow-sm"
                : "text-[#927d70] hover:bg-[#fbf4eb]"
            }`}
          >
            <Mic size={14} /> Voice Billing
          </button>
          <button
            onClick={() => setActiveTab("business")}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === "business"
                ? "bg-[#633d2c] text-white shadow-sm"
                : "text-[#927d70] hover:bg-[#fbf4eb]"
            }`}
          >
            <Bot size={14} /> Shop Intelligence Q&A
          </button>
        </div>
      </div>

      {activeTab === "billing" ? (
        /* ========================================================================= */
        /* TAB 1: VOICE BILLING INTERFACE                                            */
        /* ========================================================================= */
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          {/* Left Column: Voice Recording & Transcript */}
          <section className="rounded-3xl border border-[#eadfd2] bg-[#fffdf9] p-6 shadow-sm flex flex-col justify-between">
            <div>
              {/* Language Selector */}
              <div className="mb-6 flex items-center justify-between">
                <span className="text-xs font-bold text-[#927d70] uppercase tracking-wider">
                  Select Speech Language
                </span>
                <select
                  value={targetLang}
                  onChange={(e) => setTargetLang(e.target.value)}
                  className="rounded-xl border border-[#eadfd2] bg-[#fffdf9] px-3 py-1.5 text-xs font-bold text-[#3d2a22] outline-none"
                >
                  <option value="ta">Tamil (தமிழ்) - Primary</option>
                  <option value="tanglish">Tanglish (Tamil + English)</option>
                  <option value="en">English</option>
                  <option value="hi">Hindi (हिंदी)</option>
                  <option value="auto">Auto Detect (indic-auto)</option>
                </select>
              </div>

              {/* Giant Interactive Microphone Button */}
              <div className="my-8 flex flex-col items-center justify-center">
                <button
                  onClick={toggleRecording}
                  className={`group relative flex h-28 w-28 items-center justify-center rounded-full shadow-2xl transition-all duration-300 ${
                    isRecording
                      ? "bg-red-500 text-white animate-pulse shadow-red-500/50 scale-105"
                      : "bg-[#ed7d3a] text-white shadow-[#ed7d3a]/40 hover:scale-105 hover:bg-[#d9692b]"
                  }`}
                  title={isRecording ? "Click to Stop" : "Click to Speak"}
                >
                  {isRecording ? <MicOff size={44} /> : <Mic size={44} />}
                  {isRecording && (
                    <span className="absolute -top-1 -right-1 flex h-6 w-6">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex h-6 w-6 rounded-full bg-red-600" />
                    </span>
                  )}
                </button>

                <div className="mt-4 text-center">
                  <div className="font-serif text-lg font-bold text-[#3d2a22]">
                    {isRecording ? `Recording... (${recordingSeconds}s)` : "Tap to Speak Order"}
                  </div>
                  <p className="mt-0.5 text-xs text-[#927d70]">
                    {isRecording ? "Tap again when you finish speaking" : "Or type transcript below & click Interpret"}
                  </p>
                </div>
              </div>

              {/* Editable Transcript Textbox */}
              <div className="mt-4">
                <label className="block text-xs font-semibold text-[#927d70] mb-1.5">
                  Voice Transcript (Editable)
                </label>
                <div className="relative">
                  <textarea
                    rows={3}
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    placeholder='e.g. "Anna moonu tea, rendu vadai, Furniture shop account-la podunga"'
                    className="w-full rounded-2xl border border-[#eadfd2] bg-[#fbf8f3] p-3 text-xs text-[#3d2a22] outline-none focus:border-[#ed7d3a] resize-none"
                  />
                  {transcript && (
                    <button
                      onClick={() => setTranscript("")}
                      className="absolute right-3 top-3 text-[#927d70] hover:text-[#3d2a22]"
                      title="Clear transcript"
                    >
                      <RotateCcw size={14} />
                    </button>
                  )}
                </div>

                <div className="mt-2 flex justify-end">
                  <button
                    disabled={!transcript.trim() || parsing}
                    onClick={() => handleParse()}
                    className="flex items-center gap-1.5 rounded-xl bg-[#633d2c] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#4d2f22] disabled:opacity-40"
                  >
                    <Sparkles size={14} />
                    {parsing ? "Interpreting..." : "Interpret Speech with AI"}
                  </button>
                </div>
              </div>

              {parseError && (
                <div className="mt-4 rounded-xl bg-red-50 p-3 text-xs text-red-700">{parseError}</div>
              )}
              {statusMessage && (
                <div className="mt-4 flex items-center gap-2 rounded-xl bg-[#f4e8d8] p-3 text-xs text-[#633d2c]">
                  <Check size={14} /> {statusMessage}
                </div>
              )}
            </div>

            {/* Quick Demonstration Chips */}
            <div className="mt-8 border-t border-[#eadfd2] pt-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#927d70]">
                Quick Demo Voice Samples (Click to test):
              </span>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {DEMO_COMMANDS.map((cmd, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setTargetLang(cmd.lang);
                      setTranscript(cmd.text);
                      handleParse(cmd.text);
                    }}
                    className="group flex items-center gap-1.5 rounded-xl border border-[#eadfd2] bg-[#fffdf9] px-3 py-1.5 text-xs text-left transition hover:border-[#ed7d3a] hover:bg-[#fff7ef]"
                  >
                    <span className="rounded bg-[#f4e8d8] px-1.5 py-0.5 text-[9px] font-bold text-[#633d2c]">
                      {cmd.badge}
                    </span>
                    <span className="font-semibold text-[#3d2a22] text-[11px] line-clamp-1">{cmd.title}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Right Column: AI Extraction & Order Confirmation */}
          <section className="flex flex-col justify-between rounded-3xl border border-[#eadfd2] bg-[#fffdf9] p-6 shadow-sm">
            <div>
              <div className="flex items-center justify-between border-b border-[#eadfd2] pb-4">
                <div>
                  <h2 className="font-serif text-xl font-bold text-[#3d2a22]">Extracted Order</h2>
                  <p className="mt-0.5 text-xs text-[#927d70]">Validated against live database catalog</p>
                </div>
                {parseResult && (
                  <span className="rounded-lg bg-[#e7f2e9] px-2.5 py-1 text-[10px] font-bold uppercase text-[#39734d]">
                    {parseResult.parser_mode}
                  </span>
                )}
              </div>

              {!parseResult ? (
                <div className="py-20 text-center text-xs text-[#927d70]">
                  Speak or choose a demo command on the left. The AI will extract menu items, compute prices, and link the customer account.
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  {/* Language & NLU Engine Tags */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-lg bg-[#f4e8d8] px-2 py-0.5 text-[10px] font-bold text-[#633d2c]">
                      Lang: {parseResult.detected_language}
                    </span>
                    <span className="rounded-lg bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                      Payment: {parseResult.payment_type}
                    </span>
                    {parseResult.customer_name && (
                      <span className="rounded-lg bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                        Customer: {parseResult.customer_name}
                      </span>
                    )}
                  </div>

                  {/* Ambiguity Alert Notice if any */}
                  {parseResult.ambiguous && parseResult.clarification_needed && (
                    <div className="flex items-start gap-2 rounded-2xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
                      <AlertTriangle size={16} className="mt-0.5 text-amber-600 shrink-0" />
                      <div>
                        <b>Clarification Needed:</b> {parseResult.clarification_needed}
                      </div>
                    </div>
                  )}

                  {/* Extracted Items Table */}
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {parseResult.items.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded-xl bg-[#fbf8f3] p-3 text-xs"
                      >
                        <div>
                          <div className="font-bold text-[#3d2a22]">{item.product_name}</div>
                          <div className="text-[10px] text-[#927d70]">
                            {item.quantity} × {formatMoney(item.unit_price)}
                          </div>
                        </div>
                        <div className="font-mono text-sm font-bold text-[#3d2a22]">
                          {formatMoney(item.subtotal)}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Bill Total Breakdown */}
                  <div className="border-t border-[#eadfd2] pt-4">
                    <div className="flex justify-between text-base font-bold text-[#3d2a22]">
                      <span>Total Amount</span>
                      <span className="font-mono text-xl text-[#ed7d3a]">
                        {formatMoney(parseResult.total_amount)}
                      </span>
                    </div>

                    <p className="mt-1 text-[11px] text-[#927d70]">{parseResult.explanation}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Confirm & Save Button */}
            {parseResult && (
              <button
                disabled={parseResult.items.length === 0 || parseResult.ambiguous || savingOrder}
                onClick={handleConfirmExtractedBill}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#ed7d3a] py-3.5 text-sm font-bold text-white shadow-lg shadow-[#ed7d3a]/25 hover:bg-[#d9692b] disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <Check size={18} />
                {savingOrder ? "Saving & Speaking Confirmation..." : "Confirm & Save Order"}
              </button>
            )}
          </section>
        </div>
      ) : (
        /* ========================================================================= */
        /* TAB 2: CONVERSATIONAL SHOP INTELLIGENCE ASSISTANT                         */
        /* ========================================================================= */
        <div className="grid gap-6 lg:grid-cols-[1fr_0.5fr]">
          {/* Chat Window */}
          <section className="flex flex-col justify-between rounded-3xl border border-[#eadfd2] bg-[#fffdf9] p-6 shadow-sm min-h-[500px]">
            {/* Messages Feed */}
            <div className="space-y-4 max-h-[460px] overflow-y-auto pr-2">
              {chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl p-4 text-xs shadow-sm ${
                      msg.role === "user"
                        ? "bg-[#633d2c] text-white"
                        : "border border-[#eadfd2] bg-[#fbf8f3] text-[#3d2a22]"
                    }`}
                  >
                    <div className="leading-relaxed whitespace-pre-wrap">{msg.text}</div>
                    <div
                      className={`mt-1 text-[9px] text-right ${
                        msg.role === "user" ? "text-[#ffd18b]" : "text-[#927d70]"
                      }`}
                    >
                      {msg.time}
                    </div>
                  </div>
                </div>
              ))}
              {askingAssistant && (
                <div className="flex justify-start">
                  <div className="rounded-2xl border border-[#eadfd2] bg-[#fbf8f3] p-3 text-xs text-[#927d70]">
                    <Coffee className="inline mr-2 animate-spin text-[#ed7d3a]" size={14} />
                    Checking database numbers...
                  </div>
                </div>
              )}
            </div>

            {/* Input Bar */}
            <div className="mt-4 border-t border-[#eadfd2] pt-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendAssistantQuery();
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={queryInput}
                  onChange={(e) => setQueryInput(e.target.value)}
                  placeholder="Ask e.g. 'How much did I earn today?' or 'How much does Furniture Shop owe?'"
                  className="flex-1 rounded-2xl border border-[#eadfd2] bg-[#fffdf9] p-3 text-xs outline-none focus:border-[#ed7d3a]"
                />
                <button
                  type="submit"
                  disabled={!queryInput.trim() || askingAssistant}
                  className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#ed7d3a] text-white shadow-md hover:bg-[#d9692b] disabled:opacity-40"
                >
                  <Send size={16} />
                </button>
              </form>
            </div>
          </section>

          {/* Quick Questions Sidebar */}
          <section className="rounded-3xl border border-[#eadfd2] bg-[#fffdf9] p-6 shadow-sm">
            <h3 className="font-serif text-base font-bold text-[#3d2a22] mb-3">
              Suggested Business Queries
            </h3>
            <p className="text-xs text-[#927d70] mb-4">
              Tap any question to query the SQLite database in real time:
            </p>

            <div className="space-y-2">
              {ASSISTANT_SUGGESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleSendAssistantQuery(q)}
                  className="w-full text-left rounded-xl border border-[#eadfd2] bg-[#fbf8f3] p-2.5 text-xs text-[#3d2a22] hover:border-[#ed7d3a] hover:bg-[#fff7ef] transition flex items-center justify-between group"
                >
                  <span>{q}</span>
                  <ArrowRight size={13} className="text-[#927d70] group-hover:text-[#ed7d3a] shrink-0 ml-1" />
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* Digital Receipt Modal */}
      <ReceiptModal
        order={confirmedOrder}
        shopName={shopName}
        onClose={() => setConfirmedOrder(null)}
      />
    </div>
  );
}

