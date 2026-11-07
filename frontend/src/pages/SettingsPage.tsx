import { FormEvent, useEffect, useState } from "react";
import {
  Check,
  CheckCircle2,
  Coffee,
  Radio,
  Save,
  Server,
  Volume2,
  Cpu,
} from "lucide-react";
import { fetchHealth, HealthResponse, updateVoiceSetting } from "../services/api";
import { playAudio } from "../services/speech";

type Props = {
  shopName: string;
  onUpdateShopName: (name: string) => void;
};

export function SettingsPage({ shopName, onUpdateShopName }: Props) {
  const [nameInput, setNameInput] = useState(shopName);
  const [ownerInput, setOwnerInput] = useState(() => localStorage.getItem("teammate_owner") || "Arun Kumar");
  const [taglineInput, setTaglineInput] = useState(
    () => localStorage.getItem("teammate_tagline") || "Your voice. Your shop. Your accounts. Automatically."
  );
  const [defaultLang, setDefaultLang] = useState(() => localStorage.getItem("teammate_lang") || "tanglish");
  const [autoSpeak, setAutoSpeak] = useState(() => localStorage.getItem("teammate_autospeak") !== "false");

  // Tamil voice selection
  const [tamilVoice, setTamilVoice] = useState(() => localStorage.getItem("teammate_tamil_voice") || "Brinda");
  const [savingVoice, setSavingVoice] = useState(false);
  const [voiceSaveMsg, setVoiceSaveMsg] = useState("");
  const [testingVoice, setTestingVoice] = useState(false);

  const [healthInfo, setHealthInfo] = useState<HealthResponse | null>(null);
  const [testingHealth, setTestingHealth] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const checkBackend = () => {
    setTestingHealth(true);
    fetchHealth()
      .then((res) => {
        setHealthInfo(res.data);
        // Sync voice from backend if available
        if (res.data.tts_tamil_voice) {
          setTamilVoice(res.data.tts_tamil_voice);
          localStorage.setItem("teammate_tamil_voice", res.data.tts_tamil_voice);
        }
      })
      .catch(() => setHealthInfo(null))
      .finally(() => setTestingHealth(false));
  };

  useEffect(() => {
    checkBackend();
  }, []);

  const handleSaveVoice = async () => {
    setSavingVoice(true);
    setVoiceSaveMsg("");
    try {
      const res = await updateVoiceSetting(tamilVoice);
      localStorage.setItem("teammate_tamil_voice", tamilVoice);
      setVoiceSaveMsg(`✓ ${res.data.message}`);
      checkBackend();
    } catch (err: any) {
      setVoiceSaveMsg(`✗ ${err.response?.data?.detail || "Could not update voice setting."}`);
    } finally {
      setSavingVoice(false);
      setTimeout(() => setVoiceSaveMsg(""), 4000);
    }
  };

  const handleTestVoice = async () => {
    setTestingVoice(true);
    const testText = "வணக்கம்! இது TeaMate AI வாய்ஸ் டெஸ்ட்.";
    try {
      const { api } = await import("../services/api");
      const res = await api.post<{ audio_base64?: string }>(
        "/assistant/query",
        { query: "How much did I earn today?", language: "ta" }
      );
      playAudio(res.data.audio_base64, testText, "ta");
    } catch {
      const { speakWithBrowser } = await import("../services/speech");
      speakWithBrowser(testText, "ta");
    } finally {
      setTestingVoice(false);
    }
  };

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    if (nameInput.trim()) {
      onUpdateShopName(nameInput.trim());
      localStorage.setItem("teammate_shop", nameInput.trim());
    }
    localStorage.setItem("teammate_owner", ownerInput.trim());
    localStorage.setItem("teammate_tagline", taglineInput.trim());
    localStorage.setItem("teammate_lang", defaultLang);
    localStorage.setItem("teammate_autospeak", String(autoSpeak));

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 md:px-10">
      <div className="mb-6">
        <h1 className="font-serif text-3xl font-bold tracking-tight text-[#3d2a22]">Settings & Configuration</h1>
        <p className="mt-1 text-sm text-[#927d70]">
          Manage shop identity, AI voice parameters, and verify backend services.
        </p>
      </div>

      {saveSuccess && (
        <div className="mb-6 flex items-center gap-2 rounded-2xl bg-[#e7f2e9] p-4 text-xs font-semibold text-[#39734d]">
          <Check size={16} /> Preferences updated successfully!
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Section 1: Shop Identity */}
        <section className="rounded-3xl border border-[#eadfd2] bg-[#fffdf9] p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fff0e5] text-[#ed7d3a]">
              <Coffee size={20} />
            </div>
            <div>
              <h2 className="font-serif text-lg font-bold text-[#3d2a22]">Shop Identity & Branding</h2>
              <p className="text-xs text-[#927d70]">Displayed on receipts, headers, and audio speech</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-[#927d70]">Shop Name</label>
              <input
                type="text"
                required
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="e.g. Chai Corner or Annapoorna Tea Stall"
                className="mt-1 w-full rounded-xl border border-[#eadfd2] bg-[#fffdf9] p-2.5 text-xs outline-none focus:border-[#ed7d3a]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#927d70]">Shop Owner / Cashier</label>
              <input
                type="text"
                value={ownerInput}
                onChange={(e) => setOwnerInput(e.target.value)}
                placeholder="e.g. Arun Kumar"
                className="mt-1 w-full rounded-xl border border-[#eadfd2] bg-[#fffdf9] p-2.5 text-xs outline-none focus:border-[#ed7d3a]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#927d70]">Tagline / Slogan</label>
              <input
                type="text"
                value={taglineInput}
                onChange={(e) => setTaglineInput(e.target.value)}
                placeholder="Your voice. Your shop. Your accounts. Automatically."
                className="mt-1 w-full rounded-xl border border-[#eadfd2] bg-[#fffdf9] p-2.5 text-xs outline-none focus:border-[#ed7d3a]"
              />
            </div>
          </div>
        </section>

        {/* Section 2: AI Voice & Audio Preferences */}
        <section className="rounded-3xl border border-[#eadfd2] bg-[#fffdf9] p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f4e8d8] text-[#633d2c]">
              <Volume2 size={20} />
            </div>
            <div>
              <h2 className="font-serif text-lg font-bold text-[#3d2a22]">AI Voice Confirmation</h2>
              <p className="text-xs text-[#927d70]">Preferences for Gnani Timbre & Web Speech output</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-[#927d70]">Default Confirmation Language</label>
              <select
                value={defaultLang}
                onChange={(e) => setDefaultLang(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#eadfd2] bg-[#fffdf9] p-2.5 text-xs outline-none focus:border-[#ed7d3a]"
              >
                <option value="tanglish">Tanglish (Tamil in English)</option>
                <option value="ta">Tamil (தமிழ்)</option>
                <option value="en">English</option>
                <option value="hi">Hindi (हिंदी)</option>
              </select>
            </div>

            <div className="flex items-center gap-2 pt-5">
              <input
                id="autospeak_toggle"
                type="checkbox"
                checked={autoSpeak}
                onChange={(e) => setAutoSpeak(e.target.checked)}
                className="h-4 w-4 rounded accent-[#ed7d3a]"
              />
              <label htmlFor="autospeak_toggle" className="text-xs font-semibold text-[#3d2a22]">
                Auto-speak verbal confirmation after bill commit
              </label>
            </div>
          </div>

          {/* Tamil Voice Selector */}
          <div className="mt-5 border-t border-[#eadfd2] pt-5">
            <div className="mb-3">
              <div className="text-xs font-bold text-[#3d2a22] uppercase tracking-wider">Tamil Voice Selection</div>
              <p className="mt-0.5 text-[11px] text-[#927d70]">
                All voices use Gnani Timbre v2.5 at 48,000 Hz. Brinda and Trisha tested clearest.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 items-end">
              {["Brinda", "Asmita", "Trisha", "Vedika"].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setTamilVoice(v)}
                  className={`rounded-xl border px-4 py-2 text-xs font-bold transition ${
                    tamilVoice === v
                      ? "border-[#ed7d3a] bg-[#fff0e5] text-[#ed7d3a]"
                      : "border-[#eadfd2] bg-[#fffdf9] text-[#927d70] hover:border-[#ed7d3a] hover:text-[#3d2a22]"
                  }`}
                >
                  {v}
                  {tamilVoice === v && " ✓"}
                </button>
              ))}
              <button
                type="button"
                onClick={handleTestVoice}
                disabled={testingVoice}
                className="rounded-xl border border-[#eadfd2] bg-[#fffdf9] px-4 py-2 text-xs font-bold text-[#633d2c] hover:bg-[#fbf4eb] disabled:opacity-40 flex items-center gap-1.5"
              >
                <Volume2 size={13} />
                {testingVoice ? "Testing..." : "Test Voice"}
              </button>
              <button
                type="button"
                onClick={handleSaveVoice}
                disabled={savingVoice}
                className="rounded-xl bg-[#633d2c] px-4 py-2 text-xs font-bold text-white hover:bg-[#4d2f22] disabled:opacity-40"
              >
                {savingVoice ? "Saving..." : "Apply Voice"}
              </button>
            </div>
            {voiceSaveMsg && (
              <div className={`mt-2 rounded-xl p-2.5 text-xs font-semibold ${voiceSaveMsg.startsWith("✓") ? "bg-[#e7f2e9] text-[#39734d]" : "bg-red-50 text-red-700"}`}>
                {voiceSaveMsg}
              </div>
            )}
          </div>
        </section>

        {/* Section 3: Gnani AI & System Status */}
        <section className="rounded-3xl border border-[#eadfd2] bg-[#fffdf9] p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e7f2e9] text-[#39734d]">
                <Server size={20} />
              </div>
              <div>
                <h2 className="font-serif text-lg font-bold text-[#3d2a22]">Backend & AI Engine Status</h2>
                <p className="text-xs text-[#927d70]">FastAPI 2.0 & Gnani Prisma/Timbre Service Health</p>
              </div>
            </div>

            <button
              type="button"
              onClick={checkBackend}
              className="rounded-xl border border-[#eadfd2] bg-[#fffdf9] px-3 py-1.5 text-xs font-semibold text-[#633d2c] hover:bg-[#fbf4eb]"
            >
              {testingHealth ? "Checking..." : "Re-check Health"}
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-[#eadfd2] bg-[#fbf8f3] p-3 text-xs">
              <div className="text-[10px] uppercase font-bold text-[#927d70]">Backend API</div>
              <div className="mt-1 flex items-center gap-1.5 font-bold text-[#39734d]">
                <CheckCircle2 size={14} />
                {healthInfo?.status === "ok" ? "Operational (HTTP 200)" : "Connecting..."}
              </div>
              <div className="mt-0.5 text-[10px] text-[#927d70]">FastAPI 2.0 / SQLite</div>
            </div>

            <div className="rounded-2xl border border-[#eadfd2] bg-[#fbf8f3] p-3 text-xs">
              <div className="text-[10px] uppercase font-bold text-[#927d70]">Gnani Prisma STT</div>
              <div className="mt-1 flex items-center gap-1.5 font-bold text-[#39734d]">
                <Radio size={14} className={healthInfo?.gnani_configured ? "text-[#39734d]" : "text-[#ed7d3a]"} />
                {healthInfo?.gnani_configured ? "Connected (api.vachana.ai)" : "Browser Fallback"}
              </div>
              <div className="mt-0.5 text-[10px] text-[#927d70]">model: prisma-v3.0</div>
            </div>

            <div className="rounded-2xl border border-[#eadfd2] bg-[#fbf8f3] p-3 text-xs">
              <div className="text-[10px] uppercase font-bold text-[#927d70]">Gnani Timbre TTS</div>
              <div className="mt-1 flex items-center gap-1.5 font-bold text-[#39734d]">
                <Radio size={14} className={healthInfo?.gnani_configured ? "text-[#39734d]" : "text-[#ed7d3a]"} />
                {healthInfo?.gnani_configured ? "Connected (api.vachana.ai)" : "Browser Fallback"}
              </div>
              <div className="mt-0.5 text-[10px] text-[#927d70]">
                model: timbre-v2.5 · voice: {healthInfo?.tts_tamil_voice || tamilVoice} · 48kHz
              </div>
            </div>

            <div className="rounded-2xl border border-[#eadfd2] bg-[#fbf8f3] p-3 text-xs">
              <div className="text-[10px] uppercase font-bold text-[#927d70]">Multilingual NLU</div>
              <div className="mt-1 flex items-center gap-1.5 font-bold text-[#633d2c]">
                <Cpu size={14} className="text-[#ed7d3a]" />
                Fallback NLU Parser
              </div>
              <div className="mt-0.5 text-[10px] text-[#927d70]">Evon: Optional / Local Only</div>
            </div>
          </div>
        </section>

        {/* Save Changes Button */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            className="flex items-center gap-2 rounded-2xl bg-[#ed7d3a] px-6 py-3 text-sm font-bold text-white shadow-md shadow-[#ed7d3a]/25 hover:bg-[#d9692b]"
          >
            <Save size={16} /> Save Settings
          </button>
        </div>
      </form>
    </div>
  );
}

