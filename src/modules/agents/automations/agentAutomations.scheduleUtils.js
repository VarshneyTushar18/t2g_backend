const DAY_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** @returns {{ year: number, month: number, day: number, hour: number, minute: number, dayOfWeek: number }} */
export function getLocalParts(date, timeZone = "Asia/Kolkata") {
  const tz = timeZone || "Asia/Kolkata";
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(date).map((p) => [p.type, p.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    dayOfWeek: DAY_MAP[parts.weekday] ?? 0,
  };
}

export function localDateKey(parts) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function parseRunTime(runTime) {
  const [h, m] = String(runTime || "10:00")
    .split(":")
    .map((n) => Number(n));
  return {
    hour: Number.isFinite(h) ? h : 10,
    minute: Number.isFinite(m) ? m : 0,
  };
}

/** Minutes since midnight in configured timezone. */
export function localMinutesNow(date, timeZone) {
  const p = getLocalParts(date, timeZone);
  return p.hour * 60 + p.minute;
}

export function runMinutesFromSettings(settings) {
  const { hour, minute } = parseRunTime(settings.run_time);
  return hour * 60 + minute;
}

/**
 * Whether today's scheduled run should execute now.
 * Runs once per local calendar day after run_time, within catch-up window.
 */
export function shouldRunNow(settings, now = new Date()) {
  if (!settings.enabled) return { ok: false, reason: "disabled" };

  const tz = settings.timezone || "Asia/Kolkata";
  const graceBeforeMin = Number(process.env.AGENT_AUTOMATIONS_EARLY_MINUTES || 2);
  const catchUpMin = Number(process.env.AGENT_AUTOMATIONS_CATCHUP_MINUTES || 180);

  if (settings.window_start && now < new Date(settings.window_start)) {
    return { ok: false, reason: "before_window_start" };
  }
  if (settings.window_end && now > new Date(settings.window_end)) {
    return { ok: false, reason: "after_window_end" };
  }

  const local = getLocalParts(now, tz);
  const runDays = Array.isArray(settings.run_days) ? settings.run_days : [];
  if (runDays.length && !runDays.includes(local.dayOfWeek)) {
    return { ok: false, reason: "wrong_weekday" };
  }

  const nowMin = local.hour * 60 + local.minute;
  const runMin = runMinutesFromSettings(settings);
  const earliest = runMin - graceBeforeMin;
  const latest = runMin + catchUpMin;

  if (nowMin < earliest) {
    return { ok: false, reason: "before_run_time" };
  }
  if (nowMin > latest) {
    return { ok: false, reason: "past_catchup_window" };
  }

  if (settings.last_run_at) {
    const lastLocal = getLocalParts(new Date(settings.last_run_at), tz);
    if (localDateKey(lastLocal) === localDateKey(local)) {
      return { ok: false, reason: "already_ran_today" };
    }
  }

  return { ok: true, reason: "due" };
}

/** Human-readable next run hint (same timezone). */
export function describeScheduleStatus(settings, now = new Date()) {
  const tz = settings.timezone || "Asia/Kolkata";
  const check = shouldRunNow(settings, now);
  const local = getLocalParts(now, tz);
  const runMin = runMinutesFromSettings(settings);
  const h = Math.floor(runMin / 60);
  const m = runMin % 60;
  const runLabel = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

  if (!settings.enabled) {
    return { status: "off", message: "Automation is off", run_time_local: runLabel, timezone: tz };
  }

  if (check.ok) {
    return {
      status: "due_now",
      message: `Due now (scheduled ${runLabel} ${tz})`,
      run_time_local: runLabel,
      timezone: tz,
    };
  }

  if (check.reason === "already_ran_today") {
    return {
      status: "ran_today",
      message: `Already ran today · next run tomorrow at ${runLabel} ${tz}`,
      run_time_local: runLabel,
      timezone: tz,
      local_date: localDateKey(local),
    };
  }

  const nowMin = local.hour * 60 + local.minute;
  if (nowMin < runMin) {
    return {
      status: "waiting_today",
      message: `Runs today at ${runLabel} ${tz} (checks every minute until catch-up window ends)`,
      run_time_local: runLabel,
      timezone: tz,
    };
  }

  return {
    status: "waiting",
    message: `Next run on selected days at ${runLabel} ${tz}`,
    run_time_local: runLabel,
    timezone: tz,
  };
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
