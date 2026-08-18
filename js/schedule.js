/* ============================================================
   Schedule — a real time-based week grid, calendar-style.
   Positioning is minute-accurate: top = start time,
   height = end − start. Overlapping classes are placed
   side-by-side in lanes. Each subject gets a unique color.

   Schedule.gridHTML(entries) returns the full card HTML.
   Call Schedule.init(container) on the container that holds
   the grid to enable block clicks → professor popover.
   ============================================================ */
window.Schedule = (() => {

  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const DAY_START = 6 * 60;   // grid never starts before 6:00 AM
  const DAY_END = 22 * 60;    // and never ends after 10:00 PM
  const PX_PER_HOUR = 50;
  const MIN_RANGE = 8 * 60;

  /* indigo-family hues, distinct enough to tell apart at a glance */
  const PALETTE = [
    "#4338ca", "#0e7490", "#b45309", "#be123c", "#047857",
    "#7c3aed", "#0f766e", "#b91c1c", "#1d4ed8", "#a16207",
  ];

  function parseDays(c) {
    const raw = c.schedule_days;
    if (!raw) return [];
    if (typeof raw === "string" && raw.trim().startsWith("[")) {
      try { return JSON.parse(raw); } catch (e) { /* fall through */ }
    }
    return typeof raw === "string"
      ? raw.split(",").map(d => d.trim()).filter(Boolean)
      : (Array.isArray(raw) ? raw : []);
  }

  function toMinutes(t) {
    if (!t) return null;
    const p = String(t).split(":").map(Number);
    if (p.length < 2 || p.some(isNaN)) return null;
    return p[0] * 60 + (p[1] || 0);
  }

  function fmtHour(mins) {
    const h = Math.floor(mins / 60);
    const ampm = h >= 12 ? "PM" : "AM";
    const hr = h % 12 === 0 ? 12 : h % 12;
    return `${hr} ${ampm}`;
  }

  function fmtRange(start, end) {
    const p = m => {
      const h = Math.floor(m / 60), mn = m % 60;
      const ampm = h >= 12 ? "PM" : "AM";
      const hr = h % 12 === 0 ? 12 : h % 12;
      return `${hr}:${String(mn).padStart(2, "0")} ${ampm}`;
    };
    return `${p(start)} – ${p(end)}`;
  }

  function hash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  }

  /* one color per subject: theme_color wins when it is unique,
     otherwise a palette pick (offset until unused) */
  const entryById = new Map();
  function assignColors(entries) {
    const counts = {};
    entries.forEach(c => { const k = c.theme_color || ""; counts[k] = (counts[k] || 0) + 1; });
    const used = new Set();
    return new Map(entries.map(c => {
      let col = null;
      if (c.theme_color && counts[c.theme_color] === 1) col = c.theme_color;
      if (!col) {
        let i = hash(String(c.id || c.class_name || "")) % PALETTE.length;
        for (let off = 0; off < PALETTE.length; off++) {
          const cand = PALETTE[(i + off) % PALETTE.length];
          if (!used.has(cand)) { col = cand; break; }
        }
        if (!col) col = PALETTE[hash(String(c.id)) % PALETTE.length];
      }
      used.add(col);
      return [c.id, col];
    }));
  }

  /* split a day's events into lanes; overlapping events sit
     side-by-side and never hide each other */
  function layoutDay(dayEvents) {
    if (!dayEvents.length) return [];
    const sorted = [...dayEvents].sort((a, b) => a.start - b.start || (b.end - a.end));
    const clusters = [];
    let cur = [], curEnd = -1;
    for (const e of sorted) {
      if (cur.length && e.start >= curEnd) { clusters.push(cur); cur = []; }
      cur.push(e);
      curEnd = Math.max(curEnd, e.end);
    }
    if (cur.length) clusters.push(cur);

    const placed = [];
    for (const cluster of clusters) {
      const laneEnds = [];
      const withLanes = cluster.map(e => {
        let lane = laneEnds.findIndex(end => end <= e.start);
        if (lane === -1) { lane = laneEnds.length; laneEnds.push(e.end); }
        else laneEnds[lane] = e.end;
        return { ...e, lane };
      });
      const n = laneEnds.length;
      withLanes.forEach(e => placed.push({ ...e, width: 100 / n, left: (e.lane * 100) / n }));
    }
    return placed;
  }

  function buildGrid(entries) {
    /* expand each class into one block per day */
    const blocks = [];
    for (const c of entries) {
      const days = parseDays(c);
      const start = toMinutes(c.schedule_start_time);
      const end = toMinutes(c.schedule_end_time);
      if (!start) continue;
      days.forEach(day => blocks.push({ c, day, start, end: end && end > start ? end : start + 30 }));
    }
    if (!blocks.length) return null;

    /* grid range: padded to the hour, clamped 6:00–22:00 */
    const minStart = Math.min(...blocks.map(b => b.start));
    const maxEnd = Math.max(...blocks.map(b => b.end));
    let rStart = Math.max(DAY_START, Math.floor((minStart - 30) / 60) * 60);
    let rEnd = Math.min(DAY_END, Math.ceil((maxEnd + 30) / 60) * 60);
    if (rEnd - rStart < MIN_RANGE) {
      const need = (MIN_RANGE - (rEnd - rStart)) / 2;
      rStart = Math.max(DAY_START, rStart - Math.ceil(need));
      rEnd = Math.min(DAY_END, rEnd + Math.floor(need));
    }
    const hours = (rEnd - rStart) / 60;
    const height = hours * PX_PER_HOUR;
    const y = m => ((m - rStart) / 60) * PX_PER_HOUR;

    const colors = assignColors(entries);

    /* hour lines + labels */
    const HEAD = 34; /* day-head height, aligns gutter with day columns */
    const hourLines = [];
    const hourLabels = [];
    for (let h = 0; h <= hours; h++) {
      const top = h * PX_PER_HOUR;
      hourLines.push(`<span class="sg-line${h === 0 ? " first" : ""}" style="top:${top}px"></span>`);
      if (h < hours) hourLabels.push(`<span class="sg-hour" style="top:${HEAD + top}px">${fmtHour(rStart + h * 60)}</span>`);
    }

    /* now-line on today's column */
    const today = new Date().getDay(); // 0 = Sun
    const todayIdx = DAYS.findIndex(d => d === ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][today]);
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    const nowLine = nowMin >= rStart && nowMin <= rEnd && todayIdx !== -1
      ? `<span class="sg-now" style="top:${y(nowMin)}px" title="Now"></span>`
      : "";

    /* legend: one chip per subject, only when it earns its place */
    const legend = entries.length > 1
      ? `<div class="sg-legend">${entries.map(c => `
          <span class="sg-chip"><i style="background:${colors.get(c.id)}"></i>${UI.escapeHtml(c.class_name || c.subject_name || c.subject_code || "Subject")}</span>`).join("")}
        </div>`
      : "";

    let i = 0;
    const dayCols = DAYS.map(day => {
      const placed = layoutDay(blocks.filter(b => b.day === day).map(b => ({ ...b, color: colors.get(b.c.id) })));
      const isToday = DAYS[todayIdx] === day;
      return `
        <div class="sg-daycol${isToday ? " today" : ""}">
          <div class="sg-dayhead">${day}${isToday ? '<span class="sg-todaydot"></span>' : ""}</div>
          <div class="sg-daybody" style="height:${height}px">
            ${hourLines.join("")}
            ${isToday ? nowLine : ""}
            ${placed.map(b => `
              <button type="button" class="sched-block" data-id="${UI.escapeHtml(String(b.c.id))}"
                   title="${UI.escapeHtml(b.c.class_name || b.c.subject_name || "")} · ${fmtRange(b.start, b.end)}"
                   aria-label="${UI.escapeHtml(b.c.class_name || b.c.subject_name || "Class")}, ${fmtRange(b.start, b.end)}, view professor"
                   style="top:${y(b.start)}px;height:${Math.max(y(b.end) - y(b.start), 28)}px;left:${b.left}%;width:${b.width}%;
                          --sc:${b.color};background:${b.color}14;border-color:${b.color}59;--d:${Math.min(i++, 10)}">
                <span class="sb-name">${UI.escapeHtml(b.c.class_name || b.c.subject_name || "Class")}</span>
                ${b.c.subject_code || b.c.class_code ? `<span class="sb-code">${UI.escapeHtml(b.c.subject_code || b.c.class_code)}</span>` : ""}
                <span class="sb-time" style="color:${b.color}">${fmtRange(b.start, b.end)}</span>
              </button>`).join("")}
          </div>
        </div>`;
    }).join("");

    return `
      <div class="sg-wrap">
        ${legend}
        <div class="sg-scroll">
          <div class="sg-grid">
            <div class="sg-gutter" style="height:${height + HEAD}px">
              ${hourLabels.join("")}
            </div>
            <div class="sg-days">${dayCols}</div>
          </div>
        </div>
      </div>`;
  }

  /* returns the full card HTML (head + legend + grid), or an
     empty-state string when there is nothing scheduled */
  function gridHTML(entries, opts = {}) {
    const list = (entries || []).filter(c => c && (c.schedule_start_time || (c.schedule_days && c.schedule_days.length)));
    entryById.clear();
    list.forEach(c => entryById.set(String(c.id), c));
    const body = buildGrid(list);
    const title = opts.title || "Weekly schedule";
    if (!body) return `<div class="card"><div class="card-head"><h3>${UI.escapeHtml(title)}</h3></div><div class="card-body">${UI.empty("No schedule set yet.", "classes")}</div></div>`;
    return `
      <div class="card">
        <div class="card-head">
          <h3>${UI.escapeHtml(title)}</h3>
          <span class="muted small">${list.length} subject${list.length === 1 ? "" : "s"} &middot; accurate to the minute</span>
        </div>
        <div class="card-body flush">${body}</div>
      </div>`;
  }

  /* ---------- professor popover ---------- */

  let pop = null;
  function closePop() {
    if (pop) { pop.remove(); pop = null; }
  }

  /* bind click → popover on every block inside `root` */
  function init(root) {
    if (!root) return;
    root.addEventListener("click", (e) => {
      const block = e.target.closest(".sched-block");
      if (!block) return;
      e.stopPropagation();
      openPop(block);
    });
  }

  function openPop(block) {
    const c = entryById.get(block.dataset.id);
    if (!c) return;
    closePop();

    const start = toMinutes(c.schedule_start_time);
    const end = toMinutes(c.schedule_end_time);
    const range = fmtRange(start, end && end > start ? end : start + 30);
    const days = parseDays(c).join(" · ") || "Flexible";
    const name = c.class_name || c.subject_name || c.subject_code || "Class";
    const prof = c.professor_name || "Unassigned";
    const href = `#/classes/${c.id}`;

    pop = document.createElement("div");
    pop.className = "sched-pop";
    pop.setAttribute("role", "dialog");
    pop.innerHTML = `
      <div class="sp-head">
        ${UI.avatar(prof)}
        <div style="min-width:0">
          <div class="sp-name">${UI.escapeHtml(prof)}</div>
          <div class="sp-role">Professor</div>
        </div>
      </div>
      <div class="sp-row"><span class="sp-k">Class</span><span class="sp-v">${UI.escapeHtml(name)}</span></div>
      <div class="sp-row"><span class="sp-k">Schedule</span><span class="sp-v">${UI.escapeHtml(days)} — ${range}</span></div>
      <a class="sp-link" href="${href}">Open class</a>`;
    document.body.appendChild(pop);

    const r = block.getBoundingClientRect();
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    let left = Math.min(Math.max(8, r.left + r.width / 2 - pw / 2), window.innerWidth - pw - 8);
    let top = r.top - ph - 10;
    if (top < 8) top = r.bottom + 10;
    top = Math.min(Math.max(8, top), window.innerHeight - ph - 8);
    pop.style.left = left + "px";
    pop.style.top = top + "px";
    requestAnimationFrame(() => pop.classList.add("show"));

    const onDoc = (ev) => { if (!pop.contains(ev.target)) { closePop(); cleanup(); } };
    const onKey = (ev) => { if (ev.key === "Escape") { closePop(); cleanup(); } };
    const onScroll = () => { closePop(); cleanup(); };
    const onNav = () => { closePop(); cleanup(); };
    function cleanup() {
      document.removeEventListener("mousedown", onDoc, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("hashchange", onNav);
    }
    document.addEventListener("mousedown", onDoc, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("hashchange", onNav);
  }

  return { gridHTML, init };
})();