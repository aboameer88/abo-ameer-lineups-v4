import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  FormEvent,
} from "react";
import html2canvas from "html2canvas";
import { supabase, isSupabaseConfigured } from "./supabaseClient";

type BookingPositionKey =
  | "GK"
  | "LB"
  | "CB1"
  | "CB2"
  | "RB"
  | "CM1"
  | "CM2"
  | "CAM"
  | "ST";

type LineType = "GK" | "DEF" | "MID" | "ATT";
type TeamId = "red" | "green";

type BookingSlot = {
  key: BookingPositionKey;
  label: string;
  line: LineType;
  booked: boolean;
  playerName?: string;
  rating?: number | null;
  tags?: string[];
  note?: string;
  paymentStatus?: "unpaid" | "paid";
  sessionId?: string;
};

type TeamSlots = Record<TeamId, BookingSlot[]>;

type BookingRow = {
  id: number;
  team: TeamId;
  position_key: BookingPositionKey;
  player_name: string;
  rating: number | null;
  tags: string[] | null;
  note: string | null;
  payment_status: string | null;
  session_id: string | null;
};

type ViewMode = "booking" | "admin" | "share";

type MatchSettingsRow = {
  id: number;
  match_name: string | null;
  stadium_name: string | null;
  match_time: string | null;
};

type BenchRow = {
  id: number;
  player_name: string;
  session_id: string | null;
};

type BenchPlayer = {
  id: number;
  playerName: string;
  sessionId?: string | null;
};

const baseSlots: Omit<
  BookingSlot,
  "booked" | "playerName" | "rating" | "tags" | "note" | "paymentStatus" | "sessionId"
>[] = [
  { key: "GK", label: "حارس مرمى", line: "GK" },
  { key: "LB", label: "ظهير أيسر", line: "DEF" },
  { key: "CB1", label: "قلب دفاع 1", line: "DEF" },
  { key: "CB2", label: "قلب دفاع 2", line: "DEF" },
  { key: "RB", label: "ظهير أيمن", line: "DEF" },
  { key: "CM1", label: "وسط 1", line: "MID" },
  { key: "CM2", label: "وسط 2", line: "MID" },
  { key: "CAM", label: "صانع لعب (10)", line: "MID" },
  { key: "ST", label: "مهاجم صريح", line: "ATT" },
];

const slotCoords: Record<BookingPositionKey, { top: string; left: string }> = {
  ST: { top: "10%", left: "50%" },
  CAM: { top: "35%", left: "50%" },
  CM1: { top: "33%", left: "24%" },
  CM2: { top: "33%", left: "77%" },
  LB: { top: "60%", left: "18%" },
  CB1: { top: "64%", left: "38%" },
  CB2: { top: "64%", left: "62%" },
  RB: { top: "60%", left: "82%" },
  GK: { top: "86%", left: "50%" },
};

const teamsMeta: Record<
  TeamId,
  { name: string; colorName: string; badgeClass: string; shirtSrc: string }
> = {
  red: {
    name: "الفريق الأحمر",
    colorName: "الأحمر",
    badgeClass: "bg-red-600",
    shirtSrc: "/shirts/red-shirt-3d.png",
  },
  green: {
    name: "الفريق الأخضر",
    colorName: "الأخضر",
    badgeClass: "bg-emerald-600",
    shirtSrc: "/shirts/green-shirt-3d.png",
  },
};

const GK_SHIRT_SRC = "/shirts/gk-shirt-3d.png";

const makeInitialTeamSlots = (): TeamSlots => ({
  red: baseSlots.map((slot) => ({
    ...slot,
    booked: false,
    playerName: undefined,
    rating: null,
    tags: [],
    note: "",
    paymentStatus: "unpaid",
    sessionId: "",
  })),
  green: baseSlots.map((slot) => ({
    ...slot,
    booked: false,
    playerName: undefined,
    rating: null,
    tags: [],
    note: "",
    paymentStatus: "unpaid",
    sessionId: "",
  })),
});

const ratingOptions = [10, 9, 8, 7, 6, 5];

const App: React.FC = () => {
  const [teamSlots, setTeamSlots] = useState<TeamSlots>(makeInitialTeamSlots);
  const [bench, setBench] = useState<BenchPlayer[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<TeamId>("red");

  const [tempName, setTempName] = useState("");
  const [selectedKey, setSelectedKey] = useState<BookingPositionKey | null>(null);

  const [isBenchModalOpen, setIsBenchModalOpen] = useState(false);
  const [benchTempName, setBenchTempName] = useState("");

  const [dbStatus, setDbStatus] = useState<
    "idle" | "loading" | "ready" | "error" | "disabled"
  >(isSupabaseConfigured ? "idle" : "disabled");
  const [dbErrorMessage, setDbErrorMessage] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>("booking");

  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);

  const [sessionId, setSessionId] = useState<string>("");

  const [matchName, setMatchName] = useState("ديربي الجمعة");
  const [stadiumName, setStadiumName] = useState("ملعب Abo Ameer");
  const [matchTime, setMatchTime] = useState("الجمعة • 9:00 مساءً");
  const [matchSaveMessage, setMatchSaveMessage] = useState<string | null>(null);
  const [matchSaving, setMatchSaving] = useState(false);

  const shareRef = useRef<HTMLDivElement | null>(null);

  const currentSlots = teamSlots[selectedTeam];
  const currentTeamMeta = teamsMeta[selectedTeam];

  useEffect(() => {
    if (typeof window === "undefined") return;
    let sid = window.localStorage.getItem("abo_ameer_session_id");
    if (!sid) {
      if (window.crypto && "randomUUID" in window.crypto) {
        sid = window.crypto.randomUUID();
      } else {
        sid = `sess_${Math.random().toString(36).slice(2)}_${Date.now()}`;
      }
      window.localStorage.setItem("abo_ameer_session_id", sid);
    }
    setSessionId(sid);
  }, []);

  const deviceBooking = useMemo(() => {
    if (!sessionId) return null;
    for (const team of ["red", "green"] as TeamId[]) {
      for (const slot of teamSlots[team]) {
        if (slot.booked && slot.sessionId === sessionId) {
          return { team, slot };
        }
      }
    }
    return null;
  }, [teamSlots, sessionId]);

  const deviceBenchEntry = useMemo(() => {
    if (!sessionId) return null;
    return bench.find((b) => b.sessionId === sessionId) ?? null;
  }, [bench, sessionId]);

  const canCurrentDeviceCancel = (slot: BookingSlot) => {
    if (!slot.booked) return false;
    if (!slot.sessionId || !sessionId) return true;
    return slot.sessionId === sessionId;
  };

  const canCurrentDeviceCancelBench = (player: BenchPlayer) => {
    if (!sessionId) return false;
    if (!player.sessionId) return true;
    return player.sessionId === sessionId;
  };

  const stats = useMemo(() => {
    const build = (team: TeamId) => {
      const slots = teamSlots[team];
      const total = slots.length;
      const bookedCount = slots.filter((s) => s.booked).length;
      return { total, bookedCount, remaining: total - bookedCount };
    };
    return {
      red: build("red"),
      green: build("green"),
      totalAll: build("red").bookedCount + build("green").bookedCount,
    };
  }, [teamSlots]);

  useEffect(() => {
    const loadFromSupabase = async () => {
      if (!isSupabaseConfigured || !supabase) {
        setDbStatus("disabled");
        return;
      }

      try {
        setDbStatus("loading");
        setDbErrorMessage(null);

        const { data: bookingsData, error: bookingsError } = await supabase
          .from("bookings")
          .select(
            "id, team, position_key, player_name, rating, tags, note, payment_status, session_id"
          );

        if (bookingsError) {
          console.error("Supabase load bookings error:", bookingsError);
          setDbStatus("error");
          setDbErrorMessage("تعذر تحميل الحجوزات من Supabase.");
          return;
        }

        if (bookingsData) {
          setTeamSlots(() => {
            const next = makeInitialTeamSlots();
            (bookingsData as BookingRow[]).forEach((row) => {
              const team = row.team;
              const pos = row.position_key;
              if (next[team]) {
                next[team] = next[team].map((slot) =>
                  slot.key === pos
                    ? {
                        ...slot,
                        booked: true,
                        playerName: row.player_name,
                        rating: row.rating,
                        tags: row.tags ?? [],
                        note: row.note ?? "",
                        paymentStatus:
                          (row.payment_status as BookingSlot["paymentStatus"]) ??
                          "unpaid",
                        sessionId: row.session_id ?? "",
                      }
                    : slot
                );
              }
            });
            return next;
          });
        }

        try {
          const { data: matchRow, error: matchError } = await supabase
            .from("match_settings")
            .select("id, match_name, stadium_name, match_time")
            .eq("id", 1)
            .maybeSingle();

          if (!matchError && matchRow) {
            const row = matchRow as MatchSettingsRow;
            setMatchName(row.match_name || "ديربي الجمعة");
            setStadiumName(row.stadium_name || "ملعب Abo Ameer");
            setMatchTime(row.match_time || "الجمعة • 9:00 مساءً");
          }
        } catch (err) {
          console.warn("match_settings not found or error, using defaults.");
        }

        try {
          const { data: benchData, error: benchError } = await supabase
            .from("bench")
            .select("id, player_name, session_id")
            .order("id", { ascending: true });

          if (!benchError && benchData) {
            setBench(
              (benchData as BenchRow[]).map((row) => ({
                id: row.id,
                playerName: row.player_name,
                sessionId: row.session_id,
              }))
            );
          }
        } catch (err) {
          console.warn("bench table not found or error, starting empty bench.");
        }

        setDbStatus("ready");
      } catch (err) {
        console.error(err);
        setDbStatus("error");
        setDbErrorMessage("حدث خطأ أثناء الاتصال بقاعدة البيانات.");
      }
    };

    loadFromSupabase();
  }, []);

  useEffect(() => {
    const checkSession = async () => {
      if (!isSupabaseConfigured || !supabase) return;
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setIsAdminLoggedIn(true);
      }
    };
    checkSession();
  }, []);

  const handleOpenBooking = (key: BookingPositionKey) => {
    if (deviceBooking) {
      const isSameSlot =
        deviceBooking.team === selectedTeam &&
        deviceBooking.slot.key === key;

      if (!isSameSlot) {
        alert(
          "لا يمكنك حجز أكثر من مركز في نفس الوقت (ولا في فريقين مختلفين).\nقم أولاً بإلغاء حجزك الحالي، ثم احجز مركزاً جديداً."
        );
        return;
      }
    }

    if (deviceBenchEntry) {
      alert(
        "لا يمكنك حجز مركز أساسي وأنت مسجل في قائمة الاحتياط.\nقم أولاً بإلغاء مقعد الاحتياط الخاص بك."
      );
      return;
    }

    setSelectedKey(key);
    setTempName("");
  };

  const saveBookingToSupabase = async (
    team: TeamId,
    key: BookingPositionKey,
    playerName: string,
    sessionOverride?: string | null
  ) => {
    if (!isSupabaseConfigured || !supabase) return;
    try {
      const { error } = await supabase.from("bookings").upsert(
        {
          team,
          position_key: key,
          player_name: playerName,
          session_id: sessionOverride ?? sessionId ?? null,
        },
        {
          onConflict: "team,position_key",
        }
      );
      if (error) console.error("Supabase upsert error:", error);
    } catch (err) {
      console.error("Supabase upsert exception:", err);
    }
  };

  const updateBookingDetails = async (
    team: TeamId,
    key: BookingPositionKey,
    updates: Partial<{
      rating: number | null;
      tags: string[];
      paymentStatus: BookingSlot["paymentStatus"];
      note: string;
    }>
  ) => {
    setTeamSlots((prev) => {
      const copy: TeamSlots = { ...prev };
      copy[team] = copy[team].map((slot) =>
        slot.key === key ? { ...slot, ...updates } : slot
      );
      return copy;
    });

    if (!isSupabaseConfigured || !supabase) return;
    try {
      const payload: Record<string, any> = {};
      if ("rating" in updates) payload.rating = updates.rating;
      if ("tags" in updates) payload.tags = updates.tags;
      if ("paymentStatus" in updates)
        payload.payment_status = updates.paymentStatus;
      if ("note" in updates) payload.note = updates.note;

      const { error } = await supabase
        .from("bookings")
        .update(payload)
        .match({ team, position_key: key });

      if (error) console.error("Supabase update error:", error);
    } catch (err) {
      console.error("Supabase update exception:", err);
    }
  };

  const deleteBookingFromSupabase = async (
    team: TeamId,
    key: BookingPositionKey
  ) => {
    if (!isSupabaseConfigured || !supabase) return;
    try {
      const { error } = await supabase
        .from("bookings")
        .delete()
        .match({ team, position_key: key });
      if (error) console.error("Supabase delete error:", error);
    } catch (err) {
      console.error("Supabase delete exception:", err);
    }
  };

  const handleConfirmBooking = async () => {
    if (!selectedKey || !tempName.trim()) return;
    const playerName = tempName.trim();

    if (deviceBenchEntry) {
      alert(
        "لا يمكنك حجز مركز أساسي وأنت مسجل في قائمة الاحتياط.\nقم أولاً بإلغاء مقعد الاحتياط الخاص بك."
      );
      return;
    }

    setTeamSlots((prev) => {
      const updated: TeamSlots = { ...prev };
      updated[selectedTeam] = updated[selectedTeam].map((s) =>
        s.key === selectedKey
          ? { ...s, booked: true, playerName, sessionId }
          : s
      );
      return updated;
    });

    await saveBookingToSupabase(selectedTeam, selectedKey, playerName);

    setSelectedKey(null);
    setTempName("");
  };

  const handleCancelBooking = async (
    team: TeamId,
    key: BookingPositionKey,
    opts?: { force?: boolean }
  ) => {
    const slot = teamSlots[team].find((s) => s.key === key);
    if (!slot) return;

    if (
      !opts?.force &&
      slot.sessionId &&
      sessionId &&
      slot.sessionId !== sessionId
    ) {
      alert("❌ لا يمكنك إلغاء حجز لاعب آخر.");
      return;
    }

    const benchFirst = bench[0];

    setTeamSlots((prev) => {
      const updated: TeamSlots = { ...prev };
      updated[team] = updated[team].map((s) =>
        s.key === key
          ? {
              ...s,
              booked: false,
              playerName: undefined,
              rating: null,
              tags: [],
              note: "",
              paymentStatus: "unpaid",
              sessionId: "",
            }
          : s
      );

      if (benchFirst) {
        updated[team] = updated[team].map((s) =>
          s.key === key
            ? {
                ...s,
                booked: true,
                playerName: benchFirst.playerName,
                sessionId: benchFirst.sessionId ?? "",
              }
            : s
        );
      }

      return updated;
    });

    if (benchFirst) {
      setBench((prev) => prev.filter((b) => b.id !== benchFirst.id));
    }

    if (!isSupabaseConfigured || !supabase) {
      return;
    }

    try {
      if (benchFirst) {
        await supabase.from("bookings").upsert(
          {
            team,
            position_key: key,
            player_name: benchFirst.playerName,
            session_id: benchFirst.sessionId ?? null,
          },
          { onConflict: "team,position_key" }
        );

        await supabase.from("bench").delete().eq("id", benchFirst.id);
      } else {
        await deleteBookingFromSupabase(team, key);
      }
    } catch (err) {
      console.error("Supabase cancel+sub error:", err);
    }
  };

  const handleSwitchTeam = (team: TeamId) => {
    setSelectedTeam(team);
    setSelectedKey(null);
    setTempName("");
  };

  const handleAdminLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (!isSupabaseConfigured || !supabase) {
      setAuthError("Supabase غير مفعّل حالياً.");
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: adminEmail,
        password: adminPassword,
      });
      if (error || !data.session) {
        setAuthError("بيانات الدخول غير صحيحة.");
        setIsAdminLoggedIn(false);
      } else {
        setIsAdminLoggedIn(true);
      }
    } catch (err) {
      console.error(err);
      setAuthError("حدث خطأ أثناء تسجيل الدخول.");
      setIsAdminLoggedIn(false);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAdminLogout = async () => {
    if (supabase) await supabase.auth.signOut();
    setIsAdminLoggedIn(false);
  };

  const parseTags = (value: string): string[] =>
    value
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

  const handleSaveMatchSettings = async () => {
    if (!isSupabaseConfigured || !supabase) {
      setMatchSaveMessage("Supabase غير مفعّل، لن يتم الحفظ.");
      return;
    }
    try {
      setMatchSaving(true);
      setMatchSaveMessage(null);
      const { error } = await supabase.from("match_settings").upsert(
        {
          id: 1,
          match_name: matchName,
          stadium_name: stadiumName,
          match_time: matchTime,
        },
        { onConflict: "id" }
      );
      if (error) {
        console.error("match_settings upsert error:", error);
        setMatchSaveMessage("❌ تعذّر حفظ تفاصيل المباراة.");
      } else {
        setMatchSaveMessage("✅ تم حفظ تفاصيل المباراة بنجاح.");
      }
    } catch (err) {
      console.error("match_settings upsert exception:", err);
      setMatchSaveMessage("❌ حدث خطأ أثناء حفظ التفاصيل.");
    } finally {
      setMatchSaving(false);
    }
  };

  const handleExportImage = async () => {
    if (!shareRef.current) return;
    try {
      const canvas = await html2canvas(shareRef.current, {
        useCORS: true,
        backgroundColor: "#020617",
        scale: window.devicePixelRatio > 1 ? 2 : 1.5,
      });
      const link = document.createElement("a");
      link.download = "abo-ameer-lineup.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      console.error("Export image error:", err);
      alert("حدث خطأ أثناء تصدير التشكيلة كصورة.");
    }
  };

  const handleOpenBenchBooking = () => {
    if (deviceBooking) {
      alert(
        "لا يمكنك حجز مقعد احتياط وأنت محجوز في مركز داخل الملعب.\nقم أولاً بإلغاء حجزك الأساسي."
      );
      return;
    }
    if (deviceBenchEntry) {
      alert("لديك بالفعل مقعد احتياط محجوز.");
      return;
    }
    setBenchTempName("");
    setIsBenchModalOpen(true);
  };

  const handleConfirmBenchBooking = async () => {
    if (!benchTempName.trim()) return;
    const name = benchTempName.trim();

    const tempId = Date.now();
    const newBenchPlayer: BenchPlayer = {
      id: tempId,
      playerName: name,
      sessionId,
    };
    setBench((prev) => [...prev, newBenchPlayer]);

    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from("bench")
          .insert({
            player_name: name,
            session_id: sessionId ?? null,
          })
          .select("id, player_name, session_id")
          .single();

        if (!error && data) {
          const row = data as BenchRow;
          setBench((prev) =>
            prev.map((b) =>
              b.id === tempId
                ? {
                    id: row.id,
                    playerName: row.player_name,
                    sessionId: row.session_id,
                  }
                : b
            )
          );
        } else if (error) {
          console.error("Supabase bench insert error:", error);
        }
      } catch (err) {
        console.error("Supabase bench insert exception:", err);
      }
    }

    setBenchTempName("");
    setIsBenchModalOpen(false);
  };

  const handleCancelBenchPlayer = async (
    benchId: number,
    opts?: { force?: boolean }
  ) => {
    const player = bench.find((b) => b.id === benchId);
    if (!player) return;

    if (
      !opts?.force &&
      player.sessionId &&
      sessionId &&
      player.sessionId !== sessionId
    ) {
      alert("❌ لا يمكنك إلغاء احتياط لاعب آخر.");
      return;
    }

    setBench((prev) => prev.filter((b) => b.id !== benchId));

    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase.from("bench").delete().eq("id", benchId);
        if (error) console.error("Supabase bench delete error:", error);
      } catch (err) {
        console.error("Supabase bench delete exception:", err);
      }
    }
  };

  const handleResetLineup = async () => {
    if (!isAdminLoggedIn) {
      alert("هذا الزر متاح للمسؤول فقط.");
      return;
    }
    const sure = window.confirm(
      "هل أنت متأكد من مسح جميع الحجوزات وقائمة الاحتياط؟ لا يمكن التراجع."
    );
    if (!sure) return;

    setTeamSlots(makeInitialTeamSlots());
    setBench([]);

    if (!isSupabaseConfigured || !supabase) {
      alert("تم مسح التشكيلة محلياً، لكن Supabase غير مفعّل.");
      return;
    }

    try {
      await supabase.from("bookings").delete().neq("id", 0);
      await supabase.from("bench").delete().neq("id", 0);
      alert("✅ تم مسح جميع الحجوزات وقائمة الاحتياط من التشكيلة وقاعدة البيانات.");
    } catch (err) {
      console.error("Supabase reset lineup error:", err);
      alert("⚠️ تم المسح محلياً لكن حدث خطأ أثناء الحذف من Supabase.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-xs font-bold">
              AA
            </div>
            <div className="flex flex-col">
              <span className="font-semibold">Abo Ameer</span>
              <span className="text-[11px] text-slate-400">
                تشكيلتين + حجز + لوحة إدارة + Rating &amp; Tags + حالة الدفع +
                احتياط مشترك + صفحة مشاركة
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setViewMode("booking")}
              className={`px-3 py-1.5 rounded-full border ${
                viewMode === "booking"
                  ? "bg-slate-100 text-slate-900 border-slate-100"
                  : "bg-slate-900 text-slate-200 border-slate-600"
              }`}
            >
              صفحة الحجز
            </button>
            <button
              type="button"
              onClick={() => setViewMode("admin")}
              className={`px-3 py-1.5 rounded-full border ${
                viewMode === "admin"
                  ? "bg-blue-600 text-white border-blue-500"
                  : "bg-slate-900 text-slate-200 border-slate-600"
              }`}
            >
              لوحة الإدارة
            </button>
            <button
              type="button"
              onClick={() => setViewMode("share")}
              className={`px-3 py-1.5 rounded-full border ${
                viewMode === "share"
                  ? "bg-emerald-600 text-white border-emerald-500"
                  : "bg-slate-900 text-slate-200 border-slate-600"
              }`}
            >
              عرض التشكيلة
            </button>
          </div>
        </div>
      </header>

      {viewMode === "booking" && (
        <main className="max-w-6xl mx-auto px-4 py-6 md:py-10">
          <h1 className="text-xl md:text-2xl font-semibold mb-2">
            حجز التشكيلة – فريق أحمر و فريق أخضر
          </h1>
          <p className="text-sm text-slate-400 mb-4">
            اختر الفريق (أحمر أو أخضر)، ثم احجز مركزك على الملعب. بعد اكتمال
            المراكز، عند اعتذار أي لاعب ينزل الاحتياط مكانه مباشرة بالترتيب.
          </p>

          <div className="mb-3 text-xs">
            {deviceBooking && (
              <div className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-slate-900 border border-slate-700 text-slate-300">
                لديك حجز حالي في{" "}
                <span className="font-semibold text-emerald-300">
                  {teamsMeta[deviceBooking.team].name} –{" "}
                  {deviceBooking.slot.label}
                </span>
                . لإختيار مركز آخر، قم أولاً بإلغاء هذا الحجز.
              </div>
            )}
            {!deviceBooking && deviceBenchEntry && (
              <div className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-slate-900 border border-slate-700 text-slate-300">
                لديك مقعد احتياط محجوز باسم{" "}
                <span className="font-semibold text-emerald-300">
                  {deviceBenchEntry.playerName}
                </span>
                .
              </div>
            )}
          </div>

          <div className="mb-6 text-xs">
            {dbStatus === "disabled" && (
              <div className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-slate-900 border border-slate-700 text-slate-400">
                ⚠️ Supabase غير مفعّل حالياً (لم يتم ضبط مفاتيح الاتصال). النظام
                يعمل على الذاكرة فقط.
              </div>
            )}
            {dbStatus === "loading" && (
              <div className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-slate-900 border border-slate-700 text-slate-300">
                ⏳ يتم الاتصال بقاعدة البيانات وتحميل الحجوزات...
              </div>
            )}
            {dbStatus === "ready" && (
              <div className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-emerald-900/60 border border-emerald-500/60 text-emerald-200">
                ✅ متصل بقاعدة البيانات – الحجوزات محفوظة فعلياً.
              </div>
            )}
            {dbStatus === "error" && (
              <div className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-red-900/70 border border-red-500/70 text-red-200">
                ⚠️ تعذّر الاتصال بقاعدة البيانات: {dbErrorMessage}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 mb-5 text-xs">
            <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-slate-900 border border-slate-800">
              <span className="text-slate-400">الفريق الأحمر:</span>
              <span className="font-semibold text-rose-300">
                {stats.red.bookedCount}/{stats.red.total} محجوز
              </span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-slate-900 border border-slate-800">
              <span className="text-slate-400">الفريق الأخضر:</span>
              <span className="font-semibold text-emerald-300">
                {stats.green.bookedCount}/{stats.green.total} محجوز
              </span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-slate-900 border border-slate-800">
              <span className="text-slate-400">إجمالي الحجوزات:</span>
              <span className="font-semibold text-slate-100">
                {stats.totalAll}/18 لاعب
              </span>
            </div>
          </div>

          <section className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_260px] gap-4">
            <aside className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-3 order-2 lg:order-1">
              <h2 className="text-sm font-semibold mb-1">تفاصيل المباراة</h2>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2">
                  <span className="text-slate-400">اسم المباراة</span>
                  <span className="font-semibold text-slate-100">
                    {matchName}
                  </span>
                </div>
                <div className="flex items-center justify-between bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2">
                  <span className="text-slate-400">الملعب</span>
                  <span className="font-semibold text-slate-100">
                    {stadiumName}
                  </span>
                </div>
                <div className="flex items-center justify-between bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2">
                  <span className="text-slate-400">الوقت</span>
                  <span className="font-semibold text-slate-100">
                    {matchTime}
                  </span>
                </div>
              </div>
            </aside>

            <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3 order-1 lg:order-2">
              <div className="flex items-center justify-between text-xs text-slate-300 mb-1">
                <div className="flex items_center gap-2">
                  <span className="font-semibold">اختيار الفريق المعروض:</span>
                  <div className="flex gap-2">
                    {(["red", "green"] as TeamId[]).map((team) => {
                      const meta = teamsMeta[team];
                      const isActive = selectedTeam === team;
                      return (
                        <button
                          key={team}
                          type="button"
                          onClick={() => handleSwitchTeam(team)}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px] transition ${
                            isActive
                              ? "border-slate-100 bg-slate-800 text-slate-50"
                              : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500"
                          }`}
                        >
                          <span
                            className={`w-4 h-4 rounded-full ${meta.badgeClass}`}
                          ></span>
                          <span>{meta.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div
                className="relative flex-1 min-h-[680px] md:min-h-[780px] lg:min-h-[640px] rounded-2xl overflow-hidden bg-black"
                style={{
                  backgroundImage: "url('/pitch/pitch-top-view-mobile.png')",
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              >
                <div className="absolute inset-0 bg-emerald-950/30" />
                {currentSlots.map((slot) => {
                  const coords = slotCoords[slot.key];
                  const booked = slot.booked;
                  const shirtSrc =
                    slot.key === "GK" ? GK_SHIRT_SRC : currentTeamMeta.shirtSrc;

                  return (
                    <div
                      key={slot.key}
                      className="absolute flex flex-col items-center"
                      style={{
                        top: coords.top,
                        left: coords.left,
                        transform: "translate(-50%, -50%)",
                      }}
                    >
                      <div className="w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center bg-black/40 shadow-lg">
                        <img
                          src={shirtSrc}
                          alt={`قميص ${currentTeamMeta.name} – ${slot.key}`}
                          className="w-11 h-11 md:w-12 md:h-12 object-contain drop-shadow-[0_0_10px_rgba(0,0,0,0.9)]"
                        />
                      </div>
                      <span className="mt-1 text-[11px] text-white font-semibold bg-black/40 px-2 py-0.5 rounded-full">
                        {slot.label}
                      </span>
                      <span className="mt-0.5 text-[10px] text-slate-200 bg-black/40 px-2 py-0.5 rounded-full min-h-[1.5rem] flex items-center text-center">
                        {booked
                          ? `اللاعب: ${slot.playerName}`
                          : "المركز متاح للحجز"}
                      </span>
                      {!booked && (
                        <button
                          type="button"
                          onClick={() => handleOpenBooking(slot.key)}
                          className="mt-1 text-[10px] px-3 py-1 rounded-full bg-emerald-600 hover:bg-emerald-500"
                        >
                          احجز هذا المركز
                        </button>
                      )}
                      {booked && canCurrentDeviceCancel(slot) && (
                        <button
                          type="button"
                          onClick={() =>
                            handleCancelBooking(selectedTeam, slot.key)
                          }
                          className="mt-1 text-[10px] px-3 py-1 rounded-full bg-slate-900/80 border border-slate-500 hover:border-red-400 hover:text-red-300"
                        >
                          إلغاء الحجز
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <aside className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3 order-3 lg:order-3">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-sm font-semibold">
                  مراكز {currentTeamMeta.name}
                </h2>
              </div>
              <div className="space-y-2 text-xs max-h-[360px] overflow-auto">
                {currentSlots.map((slot) => (
                  <div
                    key={slot.key}
                    className="flex items-center justify-between bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2"
                  >
                    <div className="flex flex-col">
                      <span className="font-semibold text-slate-100">
                        {slot.label}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        الرمز: {slot.key}
                      </span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span
                        className={`text-[11px] font-semibold ${
                          slot.booked ? "text-emerald-400" : "text-yellow-300"
                        }`}
                      >
                        {slot.booked ? "محجوز ✅" : "متاح ⏳"}
                      </span>
                      {slot.booked && (
                        <span className="text-[10px] text-slate-300">
                          {slot.playerName}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </aside>
          </section>

          <section className="mt-6 bg-slate-900/60 border border-slate-800 rounded-2xl p-4 text-xs">
            <div className="flex items-center justify-between mb-3">
              <div className="flex flex-col">
                <h2 className="text-sm font-semibold">
                  قائمة الاحتياط (مشتركة بين الفريقين)
                </h2>
                <p className="text-[11px] text-slate-400">
                  عند إلغاء أي لاعب من التشكيلة الأساسية، يتم إدخال أول لاعب من
                  هذه القائمة مكانه تلقائياً.
                </p>
              </div>
              <button
                type="button"
                onClick={handleOpenBenchBooking}
                className="px-4 py-2 rounded-full bg-emerald-600 hover:bg-emerald-500 text-[11px] font-semibold"
              >
                حجز مقعد احتياط
              </button>
            </div>

            {bench.length === 0 ? (
              <p className="text-[11px] text-slate-400">
                لا يوجد لاعبين في قائمة الاحتياط حالياً.
              </p>
            ) : (
              <ul className="space-y-2">
                {bench.map((player, index) => (
                  <li
                    key={player.id}
                    className="flex items-center justify-between bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-500">
                        #{index + 1}
                      </span>
                      <span className="font-semibold text-slate-100">
                        {player.playerName}
                      </span>
                    </div>
                    {canCurrentDeviceCancelBench(player) && (
                      <button
                        type="button"
                        onClick={() => handleCancelBenchPlayer(player.id)}
                        className="text-[10px] px-3 py-1 rounded-full bg-slate-900 border border-slate-600 hover:border-red-400 hover:text-red-300"
                      >
                        إلغاء الاحتياط
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {selectedKey && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-30">
              <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl p-4 space-y-3">
                <h3 className="text-sm font-semibold mb-1">
                  حجز المركز:{" "}
                  {baseSlots.find((s) => s.key === selectedKey)?.label} –{" "}
                  {currentTeamMeta.name}
                </h3>
                <p className="text-[11px] text-slate-400">
                  أدخل اسمك كما تريد أن يظهر أسفل القميص:
                </p>
                <input
                  type="text"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
                  placeholder="مثال: أبو أمير"
                />
                <div className="flex justify-end gap-2 text-xs pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedKey(null);
                      setTempName("");
                    }}
                    className="px-3 py-1 rounded-full border border-slate-600 hover:border-slate-400"
                  >
                    إلغاء
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmBooking}
                    disabled={!tempName.trim()}
                    className="px-3 py-1 rounded-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:cursor-not-allowed"
                  >
                    تأكيد الحجز
                  </button>
                </div>
              </div>
            </div>
          )}

          {isBenchModalOpen && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-30">
              <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl p-4 space-y-3">
                <h3 className="text-sm font-semibold mb-1">
                  حجز مقعد احتياط مشترك
                </h3>
                <p className="text-[11px] text-slate-400">
                  أدخل اسمك ليتم إضافتك في قائمة الاحتياط. عند توفر مركز سيتم
                  نقلك تلقائياً إلى الملعب حسب ترتيبك.
                </p>
                <input
                  type="text"
                  value={benchTempName}
                  onChange={(e) => setBenchTempName(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
                  placeholder="مثال: أبو سعود"
                />
                <div className="flex justify-end gap-2 text-xs pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsBenchModalOpen(false);
                      setBenchTempName("");
                    }}
                    className="px-3 py-1 rounded-full border border-slate-600 hover:border-slate-400"
                  >
                    إلغاء
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmBenchBooking}
                    disabled={!benchTempName.trim()}
                    className="px-3 py-1 rounded-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:cursor-not-allowed"
                  >
                    تأكيد الحجز
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      )}

      {viewMode === "admin" && (
        <main className="max-w-6xl mx-auto px-4 py-6 md:py-10">
          <h1 className="text-xl md:text-2xl font-semibold mb-2">
            لوحة إدارة الحجوزات
          </h1>
          <p className="text-sm text-slate-400 mb-4">
            هذه الصفحة للمسؤول فقط: تعديل Rating / Tags / الملاحظات / حالة
            الدفع لكل مركز، بالإضافة إلى إلغاء الحجوزات وإدارة تفاصيل المباراة
            وقائمة الاحتياط.
          </p>

          {!isAdminLoggedIn && (
            <section className="max-w-md bg-slate-900/70 border border-slate-800 rounded-2xl p-4 text-xs">
              <h2 className="text-sm font-semibold mb-2">تسجيل دخول المسؤول</h2>
              {!isSupabaseConfigured && (
                <p className="mb-2 text-red-300">
                  ⚠️ Supabase غير مفعّل. لن يعمل تسجيل الدخول حتى تضبط مفاتيح
                  الاتصال في .env.local.
                </p>
              )}
              <form onSubmit={handleAdminLogin} className="space-y-3">
                <div>
                  <label className="block mb-1 text-slate-300">
                    البريد الإلكتروني
                  </label>
                  <input
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
                    placeholder="admin@example.com"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-300">
                    كلمة المرور
                  </label>
                  <input
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
                    placeholder="••••••••"
                  />
                </div>
                {authError && (
                  <p className="text-red-400 text-[11px]">{authError}</p>
                )}
                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full mt-1 text-xs px-3 py-2 rounded-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:cursor-not-allowed"
                >
                  {authLoading ? "جارٍ تسجيل الدخول..." : "تسجيل الدخول"}
                </button>
              </form>
              <p className="mt-3 text-[11px] text-slate-500">
                قم بإنشاء مستخدم Admin من لوحة Supabase (Auth → Users) ثم
                استخدم بريده وكلمة المرور هنا.
              </p>
            </section>
          )}

          {isAdminLoggedIn && (
            <>
              <div className="flex flex-wrap items-center justify-between text-xs mb-4 gap-2">
                <div className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-emerald-900/60 border border-emerald-500/60 text-emerald-200">
                  ✅ تم تسجيل الدخول كمسؤول.
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleResetLineup}
                    className="px-3 py-1.5 rounded-full bg-red-600 hover:bg-red-500 border border-red-400 text-[11px] font-semibold"
                  >
                    مسح التشكيلة بالكامل (الحجوزات + الاحتياط)
                  </button>
                  <button
                    type="button"
                    onClick={handleAdminLogout}
                    className="px-3 py-1.5 rounded-full bg-slate-900 border border-slate-700 hover:border-red-400 text-[11px]"
                  >
                    تسجيل الخروج
                  </button>
                </div>
              </div>

              <section className="mb-6 bg-slate-900/70 border border-slate-800 rounded-2xl p-4 text-xs max-w-xl">
                <h2 className="text-sm font-semibold mb-2">
                  إعدادات تفاصيل المباراة
                </h2>
                <p className="text-[11px] text-slate-400 mb-3">
                  هنا يمكنك تعديل اسم المباراة والملعب والوقت. هذه القيم تظهر في
                  صفحة الحجز وصفحة عرض التشكيلة، ولا يمكن للمستخدمين العاديين
                  تعديلها.
                </p>
                <div className="space-y-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-slate-300 text-[11px]">
                      اسم المباراة
                    </label>
                    <input
                      value={matchName}
                      onChange={(e) => setMatchName(e.target.value)}
                      className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
                      placeholder="مثال: ديربي الجمعة"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-slate-300 text-[11px]">
                      اسم الملعب
                    </label>
                    <input
                      value={stadiumName}
                      onChange={(e) => setStadiumName(e.target.value)}
                      className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
                      placeholder="مثال: ملعب Abo Ameer"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-slate-300 text-[11px]">
                      وقت المباراة
                    </label>
                    <input
                      value={matchTime}
                      onChange={(e) => setMatchTime(e.target.value)}
                      className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
                      placeholder="مثال: الجمعة • 9:00 مساءً"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={handleSaveMatchSettings}
                      disabled={matchSaving}
                      className="px-4 py-2 rounded-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-[11px] font-semibold"
                    >
                      {matchSaving
                        ? "جارٍ الحفظ..."
                        : "حفظ تفاصيل المباراة في Supabase"}
                    </button>
                    {matchSaveMessage && (
                      <span className="text-[11px] text-slate-300">
                        {matchSaveMessage}
                      </span>
                    )}
                  </div>
                </div>
              </section>

              <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
                {(["red", "green"] as TeamId[]).map((team) => {
                  const meta = teamsMeta[team];
                  const slots = teamSlots[team];
                  return (
                    <div
                      key={team}
                      className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 space-y-3"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className={`w-3 h-3 rounded-full ${meta.badgeClass}`}
                        ></span>
                        <h2 className="text-sm font-semibold">
                          {meta.name} – إدارة المراكز
                        </h2>
                      </div>

                      <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
                        {slots.map((slot) => {
                          const tagsText = (slot.tags ?? []).join(", ");
                          return (
                            <div
                              key={slot.key}
                              className="bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 space-y-2"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex flex-col">
                                  <span className="font-semibold text-slate-100">
                                    {slot.label}
                                  </span>
                                  <span className="text-[10px] text-slate-400">
                                    الرمز: {slot.key}
                                  </span>
                                </div>
                                <div className="text-right">
                                  <span
                                    className={`text-[11px] font-semibold ${
                                      slot.booked
                                        ? "text-emerald-400"
                                        : "text-yellow-300"
                                    }`}
                                  >
                                    {slot.booked ? "محجوز ✅" : "متاح ⏳"}
                                  </span>
                                  {slot.booked && (
                                    <div className="text-[10px] text-slate-300">
                                      {slot.playerName}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {slot.booked && (
                                <>
                                  <div className="flex flex-wrap gap-2">
                                    <div className="flex flex-col">
                                      <label className="text-[10px] text-slate-400 mb-1">
                                        Rating (من 10)
                                      </label>
                                      <select
                                        className="rounded-lg bg-slate-950 border border-slate-700 px-2 py-1 text-[11px]"
                                        value={slot.rating ?? ""}
                                        onChange={(e) =>
                                          updateBookingDetails(team, slot.key, {
                                            rating: e.target.value
                                              ? Number(e.target.value)
                                              : null,
                                          })
                                        }
                                      >
                                        <option value="">بدون</option>
                                        {ratingOptions.map((r) => (
                                          <option key={r} value={r}>
                                            {r}
                                          </option>
                                        ))}
                                      </select>
                                    </div>

                                    <div className="flex flex-col">
                                      <label className="text-[10px] text-slate-400 mb-1">
                                        حالة الدفع
                                      </label>
                                      <select
                                        className="rounded-lg bg-slate-950 border border-slate-700 px-2 py-1 text-[11px]"
                                        value={slot.paymentStatus ?? "unpaid"}
                                        onChange={(e) =>
                                          updateBookingDetails(team, slot.key, {
                                            paymentStatus: e.target
                                              .value as BookingSlot["paymentStatus"],
                                          })
                                        }
                                      >
                                        <option value="unpaid">
                                          غير مدفوع
                                        </option>
                                        <option value="paid">مدفوع ✅</option>
                                      </select>
                                    </div>
                                  </div>

                                  <div className="flex flex-col">
                                    <label className="text-[10px] text-slate-400 mb-1">
                                      الوسوم (Tags) – افصل بينها بفاصلة ,
                                    </label>
                                    <input
                                      type="text"
                                      className="rounded-lg bg-slate-950 border border-slate-700 px-2 py-1 text-[11px]"
                                      placeholder="مثال: سريع, جناح, بديل جاهز"
                                      value={tagsText}
                                      onChange={(e) =>
                                        updateBookingDetails(team, slot.key, {
                                          tags: parseTags(e.target.value),
                                        })
                                      }
                                    />
                                  </div>

                                  <div className="flex flex-col">
                                    <label className="text-[10px] text-slate-400 mb-1">
                                      ملاحظة على اللاعب / المركز
                                    </label>
                                    <textarea
                                      className="rounded-lg bg-slate-950 border border-slate-700 px-2 py-1 text-[11px] min-h-[50px]"
                                      placeholder="مثال: مناسب للجناح الأيسر، ينفّذ الركلات الثابتة."
                                      value={slot.note ?? ""}
                                      onChange={(e) =>
                                        updateBookingDetails(team, slot.key, {
                                          note: e.target.value,
                                        })
                                      }
                                    />
                                  </div>

                                  <div className="flex justify-end gap-2 pt-1">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleCancelBooking(team, slot.key, {
                                          force: true,
                                        })
                                      }
                                      className="text-[10px] px-2 py-1 rounded-full bg-slate-900 border border-red-500/70 text-red-300 hover:bg-red-500/20"
                                    >
                                      إلغاء الحجز
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </section>

              <section className="mt-4 bg-slate-900/70 border border-slate-800 rounded-2xl p-4 text-xs max-w-xl">
                <h2 className="text-sm font-semibold mb-2">
                  إدارة قائمة الاحتياط
                </h2>
                <p className="text-[11px] text-slate-400 mb-3">
                  يمكن للمسؤول رؤية جميع لاعبي الاحتياط وحذف أي لاعب إذا لزم
                  الأمر.
                </p>
                {bench.length === 0 ? (
                  <p className="text-[11px] text-slate-500">
                    لا يوجد لاعبين في قائمة الاحتياط حالياً.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {bench.map((player, index) => (
                      <li
                        key={player.id}
                        className="flex items-center justify-between bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-slate-500">
                            #{index + 1}
                          </span>
                          <span className="font-semibold text-slate-100">
                            {player.playerName}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            handleCancelBenchPlayer(player.id, { force: true })
                          }
                          className="text-[10px] px-3 py-1 rounded-full bg-slate-900 border border-red-500/70 text-red-300 hover:bg-red-500/20"
                        >
                          حذف من الاحتياط
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <p className="mt-4 text-[11px] text-slate-500">
                ملاحظة الدفع: حالياً يتم تغيير حالة الدفع يدوياً (غير مدفوع /
                مدفوع). لربط نظام دفع حقيقي تحتاج Back-end يستقبل Webhooks من
                بوابة الدفع ويحدّث هذا الحقل تلقائياً.
              </p>
            </>
          )}
        </main>
      )}

      {viewMode === "share" && (
        <main className="max-w-5xl mx-auto px-4 py-6 md:py-10">
          <h1 className="text-xl md:text-2xl font-semibold mb-2">
            التشكيلة النهائية – عرض ومشاركة
          </h1>
          <p className="text-sm text-slate-400 mb-4">
            هذه الصفحة لعرض التشكيلة بشكل نهائي ونظيف، مع إمكانية تحميل صورة
            جاهزة للمشاركة في الواتساب أو تويتر أو أي مكان آخر.
          </p>

          <div className="flex flex-wrap items-center justify-between gap-3 mb-4 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-300">
                الفريق المعروض:
              </span>
              <div className="flex gap-2">
                {(["red", "green"] as TeamId[]).map((team) => {
                  const meta = teamsMeta[team];
                  const isActive = selectedTeam === team;
                  return (
                    <button
                      key={team}
                      type="button"
                      onClick={() => setSelectedTeam(team)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px] transition ${
                        isActive
                          ? "border-slate-100 bg-slate-800 text-slate-50"
                          : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500"
                      }`}
                    >
                      <span
                        className={`w-4 h-4 rounded-full ${meta.badgeClass}`}
                      ></span>
                      <span>{meta.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={handleExportImage}
              className="px-4 py-2 rounded-full bg-emerald-600 hover:bg-emerald-500 text-[12px] font-semibold"
            >
              ⬇️ تحميل التشكيلة كصورة PNG
            </button>
          </div>

          <div
            ref={shareRef}
            className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 md:p-6 shadow-2xl max-w-4xl mx-auto"
          >
            <div className="flex items-center justify-between text-[11px] text-slate-300 mb-3">
              <div className="flex flex-col">
                <span className="font-semibold text-slate-100">
                  {matchName}
                </span>
                <span className="text-slate-400">
                  {teamsMeta[selectedTeam].name} • خطة 4–3–1 + حارس
                </span>
                <span className="text-slate-500 text-[10px]">
                  {stadiumName} – {matchTime}
                </span>
              </div>
              <div className="text-right">
                <span className="block text-slate-400">
                  إجمالي اللاعبين المحجوزين:
                </span>
                <span className="font-semibold text-slate-100">
                  {teamSlots[selectedTeam].filter((s) => s.booked).length}
                  /9
                </span>
              </div>
            </div>

            <div
              className="relative w-full rounded-2xl overflow-hidden bg-black aspect-[9/16] md:aspect-[3/5]"
              style={{
                backgroundImage: "url('/pitch/pitch-top-view-mobile.png')",
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            >
              <div className="absolute inset-0 bg-emerald-950/30" />
              {teamSlots[selectedTeam].map((slot) => {
                const coords = slotCoords[slot.key];
                const shirtSrc =
                  slot.key === "GK"
                    ? GK_SHIRT_SRC
                    : teamsMeta[selectedTeam].shirtSrc;
                const booked = slot.booked;

                return (
                  <div
                    key={slot.key}
                    className="absolute flex flex-col items-center"
                    style={{
                      top: coords.top,
                      left: coords.left,
                      transform: "translate(-50%, -50%)",
                    }}
                  >
                    <div className="w-16 h-16 rounded-full flex items-center justify-center bg-black/50 shadow-xl">
                      <img
                        src={shirtSrc}
                        alt={slot.label}
                        className="w-12 h-12 object-contain drop-shadow-[0_0_14px_rgba(0,0,0,0.9)]"
                      />
                    </div>
                    <span className="mt-1 text-[11px] font-semibold text-white bg-black/45 px-2 py-0.5 rounded-full">
                      {slot.label}
                    </span>
                    <span className="mt-0.5 text-[11px] text-amber-100 bg-black/45 px-2 py-0.5 rounded-full min-h-[1.6rem] flex items-center text-center">
                      {booked
                        ? `اللاعب: ${slot.playerName}`
                        : "غير محجوز حتى الآن"}
                    </span>
                    {booked && (
                      <div className="mt-0.5 flex flex-col items-center gap-0.5">
                        {slot.rating != null && (
                          <span className="text-[10px] text-emerald-200 bg-emerald-900/70 px-2 py-0.5 rounded-full">
                            Rating: {slot.rating}/10
                          </span>
                        )}
                        {slot.paymentStatus === "paid" && (
                          <span className="text-[10px] text-emerald-100 bg-emerald-800/80 px-2 py-0.5 rounded-full">
                            مدفوع ✅
                          </span>
                        )}
                        {slot.tags && slot.tags.length > 0 && (
                          <span className="text-[9px] text-slate-100 bg-black/55 px-2 py-0.5 rounded-full">
                            {slot.tags.join(" • ")}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {bench.length > 0 && (
              <div className="mt-3 text-[10px] text-slate-300">
                <span className="font-semibold">قائمة الاحتياط:</span>{" "}
                {bench.map((b) => b.playerName).join(" ، ")}
              </div>
            )}

            <div className="mt-3 text-[10px] text-slate-500 flex items-center justify-between">
              <span>تم إنشاء هذه التشكيلة عبر منصة Abo Ameer.</span>
              <span>نموذج واجهة – abo ameer lineups</span>
            </div>
          </div>
        </main>
      )}
    </div>
  );
};

export default App;
