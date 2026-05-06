"use client";

import React, { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "markah_silat_match_v1";

const warningPenalties = [0, 1, 2, 5, 10];

const warningIcons = {
  1: "☝🏻",
  2: "✌🏻",
  3: "🙋🏻‍♂️❗",
  4: "🙋🏻‍♂️🚫",
  5: "🙅🏻‍♂️❌",
};

const warningList = [
  { level: 1, icon: "☝🏻", penaltyText: "0" },
  { level: 2, icon: "✌🏻", penaltyText: "-1" },
  { level: 3, icon: "🙋🏻‍♂️❗", penaltyText: "-2" },
  { level: 4, icon: "🙋🏻‍♂️🚫", penaltyText: "-5" },
  { level: 5, icon: "🙅🏻‍♂️❌", penaltyText: "-10" },
];

function clampWarningLevel(level: number) {
  return Math.max(0, Math.min(5, Number(level) || 0));
}

function getWarningPenalty(warningLevel: number) {
  const safeLevel = clampWarningLevel(warningLevel);
  if (safeLevel === 0) return 0;
  return warningPenalties[safeLevel - 1];
}

function addWarningEvent(currentScore: number, warningLevel: number) {
  const safeLevel = clampWarningLevel(warningLevel);
  const penalty = getWarningPenalty(safeLevel);

  return {
    score: currentScore - penalty,
    warning: safeLevel,
    penalty,
  };
}

function undoWarningEvent(currentScore: number, warningLevel: number) {
  const safeLevel = clampWarningLevel(warningLevel);
  const restored = getWarningPenalty(safeLevel);

  return {
    score: currentScore + restored,
    warning: safeLevel,
    restored,
  };
}

function getWarningCounts(records: number[]) {
  return records.reduce<Record<number, number>>(
    (counts, level) => {
      const safeLevel = clampWarningLevel(level);
      if (safeLevel >= 1 && safeLevel <= 5) {
        counts[safeLevel] += 1;
      }
      return counts;
    },
    { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  );
}

function getTotalPenaltyFromRecords(records: number[]) {
  return records.reduce((total, level) => total + getWarningPenalty(level), 0);
}

function isLandscapeSize(width: number, height: number) {
  return width >= height;
}

function canUseFullscreen(doc: Document | null) {
  return Boolean(doc && doc.fullscreenEnabled && doc.documentElement && doc.documentElement.requestFullscreen);
}

type SavedState = {
  scores: { biru: number; merah: number };
  warningRecords: { biru: number[]; merah: number[] };
  history: string[];
};

function safeLoadState(): SavedState | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.scores || !parsed.warningRecords || !Array.isArray(parsed.history)) return null;

    return {
      scores: {
        biru: Number(parsed.scores.biru || 0),
        merah: Number(parsed.scores.merah || 0),
      },
      warningRecords: {
        biru: Array.isArray(parsed.warningRecords.biru) ? parsed.warningRecords.biru.map(clampWarningLevel) : [],
        merah: Array.isArray(parsed.warningRecords.merah) ? parsed.warningRecords.merah.map(clampWarningLevel) : [],
      },
      history: parsed.history.map(String).slice(0, 30),
    };
  } catch (error) {
    return null;
  }
}

function safeSaveState(state: SavedState) {
  if (typeof window === "undefined") return false;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    return false;
  }
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  if (text.includes('"') || text.includes(",") || text.includes("\n") || text.includes("\r")) {
    return '"' + text.replace(/"/g, '""') + '"';
  }
  return text;
}

function buildCsv(history: string[], scores: SavedState["scores"], warningRecords: SavedState["warningRecords"]) {
  const rows = [
    ["Kategori", "Masa", "Butiran", "Biru", "Merah", "Kesalahan Biru", "Kesalahan Merah"],
    ["Ringkasan", "", "Skor Semasa", scores.biru, scores.merah, warningRecords.biru.length, warningRecords.merah.length],
    ...history.map((item) => ["Log", item.split(" • ")[0] || "", item, "", "", "", ""]),
  ];

  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

function downloadCsv(history: string[], scores: SavedState["scores"], warningRecords: SavedState["warningRecords"]) {
  if (typeof document === "undefined") return;

  const csv = buildCsv(history, scores, warningRecords);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "log-markah-silat.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function safeToggleFullscreen(onError: (message: string) => void) {
  if (typeof document === "undefined") return false;

  try {
    if (!canUseFullscreen(document)) {
      if (onError) onError("Fullscreen tidak dibenarkan dalam preview/browser ini.");
      return false;
    }

    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
      if (onError) onError("");
      return true;
    }

    if (document.exitFullscreen) {
      await document.exitFullscreen();
      if (onError) onError("");
      return true;
    }

    if (onError) onError("Exit fullscreen tidak disokong oleh browser ini.");
    return false;
  } catch (error) {
    if (onError) onError("Fullscreen disekat oleh browser atau permissions policy.");
    return false;
  }
}

function runLogicTests() {
  console.assert(isLandscapeSize(900, 500) === true, "Test failed: 900x500 should be landscape");
  console.assert(isLandscapeSize(390, 844) === false, "Test failed: 390x844 should be portrait");

  console.assert(canUseFullscreen(null) === false, "Test failed: null document should not support fullscreen");
  console.assert(canUseFullscreen({ fullscreenEnabled: false, documentElement: { requestFullscreen: () => {} } } as Document) === false, "Test failed: disabled fullscreen should return false");
  console.assert(canUseFullscreen({ fullscreenEnabled: true, documentElement: { requestFullscreen: () => {} } } as Document) === true, "Test failed: enabled fullscreen with requestFullscreen should return true");

  console.assert(csvEscape('Ali,"Biru"') === '"Ali,""Biru"""', "Test failed: CSV escape should quote commas and quotes");
  console.assert(csvEscape("baris\nbaru") === '"baris\nbaru"', "Test failed: CSV escape should quote newline text");
  console.assert(buildCsv(["10:00 • BIRU +1"], { biru: 1, merah: 0 }, { biru: [], merah: [] }).includes("Skor Semasa"), "Test failed: CSV should include summary row");
  console.assert(buildCsv(["10:00 • BIRU +1"], { biru: 1, merah: 0 }, { biru: [], merah: [] }).includes("\nLog,"), "Test failed: CSV should use escaped newline separators");

  const warning1 = addWarningEvent(10, 1);
  console.assert(warning1.score === 10 && warning1.penalty === 0, "Test failed: Amaran 1 should not deduct score");

  const warning2 = addWarningEvent(10, 2);
  console.assert(warning2.score === 9 && warning2.penalty === 1, "Test failed: Amaran 2 should deduct 1 mark");

  const warning3 = addWarningEvent(10, 3);
  console.assert(warning3.score === 8 && warning3.penalty === 2, "Test failed: Amaran 3 should deduct 2 marks");

  const warning4 = addWarningEvent(10, 4);
  console.assert(warning4.score === 5 && warning4.penalty === 5, "Test failed: Amaran 4 should deduct 5 marks");

  const warning5 = addWarningEvent(10, 5);
  console.assert(warning5.score === 0 && warning5.penalty === 10, "Test failed: Amaran 5 should deduct 10 marks");

  const negativeTest = addWarningEvent(3, 5);
  console.assert(negativeTest.score === -7, "Test failed: Score should allow negative values");

  const cumulativeStep1 = addWarningEvent(10, 3);
  const cumulativeStep2 = addWarningEvent(cumulativeStep1.score, 2);
  console.assert(cumulativeStep2.score === 7, "Test failed: Amaran 3 then Amaran 2 should deduct accumulated 3 marks");

  const unorderedStep1 = addWarningEvent(20, 5);
  const unorderedStep2 = addWarningEvent(unorderedStep1.score, 4);
  const unorderedStep3 = addWarningEvent(unorderedStep2.score, 2);
  console.assert(unorderedStep3.score === 4, "Test failed: Amaran 5, 4, 2 should deduct 10 + 5 + 1 marks");

  const undoTest = undoWarningEvent(7, 2);
  console.assert(undoTest.score === 8 && undoTest.restored === 1, "Test failed: Undo Amaran 2 should restore 1 mark");

  const undoHeavyTest = undoWarningEvent(-7, 5);
  console.assert(undoHeavyTest.score === 3 && undoHeavyTest.restored === 10, "Test failed: Undo Amaran 5 should restore 10 marks even from negative score");

  const counts = getWarningCounts([3, 2, 3, 5]);
  console.assert(counts[2] === 1 && counts[3] === 2 && counts[5] === 1, "Test failed: Warning counts should record repeated and unordered warnings");

  const totalPenalty = getTotalPenaltyFromRecords([3, 2]);
  console.assert(totalPenalty === 3, "Test failed: Warning records [3, 2] should total 3 penalty marks");

  const totalPenaltyHeavy = getTotalPenaltyFromRecords([5, 4, 2]);
  console.assert(totalPenaltyHeavy === 16, "Test failed: Warning records [5, 4, 2] should total 16 penalty marks");
}

runLogicTests();

function formatTime() {
  return new Date().toLocaleTimeString("ms-MY", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

type ScoreSideProps = {
  side: "biru" | "merah";
  label: string;
  score: number;
  warningRecords: number[];
  theme: { card: string };
  onAdd: (side: "biru" | "merah", point: number) => void;
  onWarning: (side: "biru" | "merah", level: number) => void;
  onMinus: (side: "biru" | "merah") => void;
};

function ScoreSide({ side, label, score, warningRecords, theme, onAdd, onWarning, onMinus }: ScoreSideProps) {
  const warningCounts = getWarningCounts(warningRecords);
  const totalWarnings = warningRecords.length;
  const totalPenalty = getTotalPenaltyFromRecords(warningRecords);
  const lastWarning = totalWarnings > 0 ? warningRecords[totalWarnings - 1] : 0;
  const activeWarningIcon = lastWarning > 0 ? warningIcons[lastWarning as keyof typeof warningIcons] : "❌";

  return (
    <section className={`h-full rounded-[1.5rem] border shadow-2xl p-2 flex flex-col overflow-hidden ${theme.card}`}>
      <div className="grid grid-cols-5 gap-1 mb-2 shrink-0">
        {warningList.map((item) => {
          const count = warningCounts[item.level];
          const isActive = count > 0;
          const isLast = lastWarning === item.level;

          return (
            <button
              key={item.level}
              type="button"
              onClick={() => onWarning(side, item.level)}
              className={`relative rounded-xl border p-1 text-center transition-all duration-200 active:scale-95 ${
                isActive ? "bg-black text-white border-white shadow-2xl" : "bg-white/10 text-white/45 border-white/10"
              } ${isLast ? "ring-2 ring-white scale-[1.02]" : ""}`}
            >
              {count > 0 && (
                <div className="absolute -top-1 -right-1 min-w-5 h-5 rounded-full bg-white text-black text-[9px] font-black flex items-center justify-center border border-black">
                  {count}
                </div>
              )}
              <div className="text-base sm:text-xl leading-none mb-0.5">{item.icon}</div>
              <div className="text-[8px] sm:text-[9px] font-black">A{item.level}</div>
              <div className="text-[8px] sm:text-[9px] opacity-70">{item.penaltyText}</div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2 mb-2 shrink-0">
        <div>
          <p className="text-[9px] uppercase tracking-[0.2em] opacity-70">Sudut</p>
          <h2 className="text-2xl sm:text-3xl font-black leading-none">{label}</h2>
        </div>

        <div className="rounded-xl bg-white/20 border border-white/15 px-2 py-1 text-center min-w-[92px]">
          <div className="text-xl leading-none mb-0.5">{activeWarningIcon}</div>
          <div className="text-[10px] font-black">Kesalahan {totalWarnings}</div>
          <div className="text-[10px] opacity-70">Tolak {totalPenalty}</div>
        </div>
      </div>

      <div className="rounded-[1.35rem] bg-black/25 border border-white/15 p-2 text-center mb-2 shrink-0">
        <p className="text-[9px] uppercase tracking-[0.22em] opacity-65 mb-1">Markah</p>
        <div className="text-[3.8rem] sm:text-[5.2rem] leading-none font-black tabular-nums">{score}</div>
      </div>

      <div className="grid grid-cols-3 gap-0.5 mb-1 shrink-0">
        <button
          onClick={() => onAdd(side, 1)}
          title="Tumbuk +1"
          className="rounded-lg bg-white text-slate-950 p-1 shadow-lg font-black active:scale-[0.96] transition"
        >
          <div className="text-xl sm:text-2xl leading-none">👊</div>
          <div className="text-[9px] sm:text-[10px] opacity-70">+1</div>
        </button>

        <button
          onClick={() => onAdd(side, 2)}
          title="Sepak +2"
          className="rounded-lg bg-white text-slate-950 p-1 shadow-lg font-black active:scale-[0.96] transition"
        >
          <div className="text-xl sm:text-2xl leading-none">🦶</div>
          <div className="text-[9px] sm:text-[10px] opacity-70">+2</div>
        </button>

        <button
          onClick={() => onAdd(side, 3)}
          title="Special +3"
          className="rounded-lg bg-white text-slate-950 p-1 shadow-lg font-black active:scale-[0.96] transition"
        >
          <div className="text-xl sm:text-2xl leading-none">🔥</div>
          <div className="text-[9px] sm:text-[10px] opacity-70">+3</div>
        </button>
      </div>

      <div className="mt-auto grid grid-cols-2 gap-0.5 shrink-0">
        <button
          onClick={() => onAdd(side, 1)}
          className="rounded-lg bg-emerald-500 text-white border border-emerald-300/20 p-1 text-sm sm:text-base font-black shadow-lg active:scale-[0.96] transition"
          title="Manual +1"
        >
          ➕
        </button>

        <button
          onClick={() => onMinus(side)}
          className="rounded-lg bg-zinc-900 text-white border border-zinc-700 p-1 text-sm sm:text-base font-black shadow-lg active:scale-[0.96] transition"
          title="Manual -1"
        >
          ➖
        </button>
      </div>
    </section>
  );
}

export default function App() {
  const getInitialLandscape = () => {
    if (typeof window === "undefined") return true;
    return isLandscapeSize(window.innerWidth, window.innerHeight);
  };

  const [isLandscape, setIsLandscape] = useState(getInitialLandscape);
  const [scores, setScores] = useState({ biru: 0, merah: 0 });
  const [warningRecords, setWarningRecords] = useState<SavedState["warningRecords"]>({ biru: [], merah: [] });
  const [history, setHistory] = useState<string[]>([]);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenMessage, setFullscreenMessage] = useState("");

  useEffect(() => {
    const savedState = safeLoadState();

    if (savedState) {
      setScores(savedState.scores);
      setWarningRecords(savedState.warningRecords);
      setHistory(savedState.history);
    }
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;

    const fullscreenHandler = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener("fullscreenchange", fullscreenHandler);
    fullscreenHandler();

    return () => {
      document.removeEventListener("fullscreenchange", fullscreenHandler);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleResize = () => {
      setIsLandscape(isLandscapeSize(window.innerWidth, window.innerHeight));
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, []);

  useEffect(() => {
    safeSaveState({ scores, warningRecords, history });
  }, [scores, warningRecords, history]);

  useEffect(() => {
    if (!fullscreenMessage) return undefined;

    const timer = window.setTimeout(() => {
      setFullscreenMessage("");
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [fullscreenMessage]);

  const winner = useMemo(() => {
    if (scores.biru === scores.merah) return "Seri";
    return scores.biru > scores.merah ? "Biru 🔵" : "Merah 🔴";
  }, [scores]);

  const addScore = (side: "biru" | "merah", point: number) => {
    setScores((prev) => ({ ...prev, [side]: prev[side] + point }));
    setHistory((prev) => [`${formatTime()} • ${side.toUpperCase()} +${point}`, ...prev].slice(0, 30));
  };

  const addWarning = (side: "biru" | "merah", level: number) => {
    const safeLevel = clampWarningLevel(level);
    if (safeLevel === 0) return;

    setScores((prevScores) => {
      const result = addWarningEvent(prevScores[side], safeLevel);
      setHistory((oldHistory) => [
        `${formatTime()} • ${side.toUpperCase()} Amaran ${safeLevel}${result.penalty ? " (-" + result.penalty + ")" : " (0)"}`,
        ...oldHistory,
      ].slice(0, 30));
      return { ...prevScores, [side]: result.score };
    });

    setWarningRecords((prev) => ({
      ...prev,
      [side]: [...prev[side], safeLevel],
    }));
  };

  const minusManual = (side: "biru" | "merah") => {
    setScores((prev) => ({ ...prev, [side]: prev[side] - 1 }));
    setHistory((prev) => [`${formatTime()} • ${side.toUpperCase()} manual -1`, ...prev].slice(0, 30));
  };

  const resetMatch = () => {
    setScores({ biru: 0, merah: 0 });
    setWarningRecords({ biru: [], merah: [] });
    setHistory([]);
    setIsLogOpen(false);
    setFullscreenMessage("");
  };

  const handleFullscreenClick = () => {
    safeToggleFullscreen(setFullscreenMessage);
  };

  const handleCsvDownload = () => {
    downloadCsv(history, scores, warningRecords);
  };

  if (!isLandscape) {
    return (
      <div className="min-h-screen bg-slate-950 text-white p-6 flex items-center justify-center text-center">
        <div className="rounded-[2rem] bg-white/8 border border-white/10 p-6 shadow-2xl max-w-sm">
          <div className="text-6xl mb-4">📱↔️</div>
          <h1 className="text-2xl font-black mb-2">Sila Pusingkan Skrin</h1>
          <p className="text-white/65 text-sm leading-relaxed">
            Sistem markah ini diset untuk paparan horizontal sahaja supaya butang Biru dan Merah lebih besar dan mudah ditekan.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-slate-950 text-white p-1 sm:p-2 overflow-hidden">
      <div className="w-full h-full max-w-[1400px] mx-auto flex flex-col overflow-hidden">
        <header className="shrink-0 rounded-[1.2rem] bg-white/8 border border-white/10 shadow-2xl p-2 mb-1">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[9px] uppercase tracking-[0.28em] text-white/50">Sistem Markah</p>
              <h1 className="text-base sm:text-xl font-black tracking-tight truncate">🎖️🏆🎖️</h1>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleFullscreenClick}
                className="rounded-xl bg-black text-white border border-white/15 px-3 py-2 text-xs font-black shadow active:scale-95 transition"
                title="Fullscreen"
              >
                {isFullscreen ? "⤢" : "⛶"}
              </button>

              <button
                onClick={handleCsvDownload}
                className="rounded-xl bg-black text-white border border-white/15 px-3 py-2 text-xs font-black shadow active:scale-95 transition"
                title="Download CSV"
              >
                📄
              </button>

              <button
                onClick={resetMatch}
                className="rounded-xl bg-white text-slate-950 px-3 py-2 text-xs font-black shadow active:scale-95 transition"
              >
                Reset
              </button>
            </div>
          </div>

          {fullscreenMessage && (
            <div className="mt-2 rounded-2xl bg-amber-400/15 border border-amber-300/30 px-3 py-2 text-xs font-bold text-amber-100">
              {fullscreenMessage}
            </div>
          )}
        </header>

        <div className="shrink-0 rounded-[1.2rem] bg-slate-900/95 backdrop-blur border border-white/10 p-1 mb-1 shadow-xl">
          <div className="grid grid-cols-3 items-center gap-2 text-center">
            <div className="rounded-2xl bg-blue-700/35 border border-blue-300/20 px-2 py-1">
              <p className="text-[9px] uppercase tracking-[0.2em] text-white/55">Biru</p>
              <p className="text-2xl sm:text-3xl font-black tabular-nums">{scores.biru}</p>
            </div>

            <div className="rounded-2xl bg-white/8 border border-white/10 px-2 py-1">
              <p className="text-[9px] uppercase tracking-[0.2em] text-white/55">Status</p>
              <p className="text-xs sm:text-sm font-black leading-tight">{winner}</p>
            </div>

            <div className="rounded-2xl bg-red-700/35 border border-red-300/20 px-2 py-1">
              <p className="text-[9px] uppercase tracking-[0.2em] text-white/55">Merah</p>
              <p className="text-2xl sm:text-3xl font-black tabular-nums">{scores.merah}</p>
            </div>
          </div>
        </div>

        <main className="grid grid-cols-2 gap-1 sm:gap-2 flex-1 min-h-0 overflow-hidden">
          <ScoreSide
            side="biru"
            label="BIRU"
            score={scores.biru}
            warningRecords={warningRecords.biru}
            theme={{ card: "bg-blue-700/85 border-blue-200/25" }}
            onAdd={addScore}
            onWarning={addWarning}
            onMinus={minusManual}
          />

          <ScoreSide
            side="merah"
            label="MERAH"
            score={scores.merah}
            warningRecords={warningRecords.merah}
            theme={{ card: "bg-red-700/85 border-red-200/25" }}
            onAdd={addScore}
            onWarning={addWarning}
            onMinus={minusManual}
          />
        </main>

        <div className="shrink-0 mt-1 rounded-[1.2rem] bg-white/8 border border-white/10 overflow-hidden">
          <button
            onClick={() => setIsLogOpen((prev) => !prev)}
            className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left active:bg-white/5 transition"
          >
            <div>
              <h3 className="text-xs sm:text-sm font-black">📋 Log Perlawanan</h3>
              <p className="text-[10px] text-white/50">{history.length} rekod</p>
            </div>
            <span className="text-lg font-black">{isLogOpen ? "⌃" : "⌄"}</span>
          </button>

          {isLogOpen && (
            <div className="px-3 pb-3 border-t border-white/10">
              {history.length === 0 ? (
                <p className="text-white/45 text-sm p-3">Belum ada rekod.</p>
              ) : (
                <div className="space-y-1 max-h-28 overflow-y-auto pt-2">
                  {history.map((item, index) => (
                    <div key={`${item}-${index}`} className="rounded-2xl bg-black/20 border border-white/10 px-3 py-2 text-xs sm:text-sm font-semibold">
                      {item}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
