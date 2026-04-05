const state = {
  user: null,
  members: [],
  attendance: {},
  tasks: [],
  logs: [],
  notes: [],
  featureTab: "old",
};

const FEATURES = {
  old: ["Analog mixer optimization", "Manual cable mapping", "Legacy monitor balancing"],
  new: ["Digital routing profiles", "Feedback auto-detection", "Wireless mic health tracking"],
};

const $ = (id) => document.getElementById(id);

function saveState() {
  localStorage.setItem("paSystemState", JSON.stringify(state));
}

function loadState() {
  const data = localStorage.getItem("paSystemState");
  if (!data) return;
  Object.assign(state, JSON.parse(data));
}

function showPage(pageId) {
  document.querySelectorAll(".subpage").forEach((el) => el.classList.add("hidden"));
  $(pageId).classList.remove("hidden");
  document.querySelectorAll(".nav-link").forEach((el) => {
    el.classList.toggle("active", el.dataset.page === pageId);
  });
}

function renderSchedule() {
  const el = $("scheduleContent");
  const day = new Date().getDay();
  if (day !== 0) {
    el.innerHTML = "<p>Today is not Sunday. Sunday schedule will auto-load on Sunday.</p>";
    return;
  }

  const memberLines = state.members.length
    ? state.members.map((m) => `<li>${m.name} — ${m.role}</li>`).join("")
    : "<li>No registered members yet.</li>";
  el.innerHTML = `
    <p><strong>Sunday Schedule (Registered Members)</strong></p>
    <ul>
      <li>08:30 AM - Sound Check</li>
      <li>09:00 AM - Prayer Setup</li>
      <li>10:00 AM - Service Monitoring</li>
      ${memberLines}
    </ul>
  `;
}

function updateBranchOtherVisibility() {
  const isOther = $("branchSelect").value === "Other";
  $("otherBranchWrap").classList.toggle("hidden", !isOther);
  $("otherBranch").required = isOther;
}

function login(e) {
  e.preventDefault();
  const branch = $("branchSelect").value === "Other" ? $("otherBranch").value.trim() : $("branchSelect").value;
  state.user = {
    email: $("email").value,
    branch,
    teamName: $("teamName").value,
  };
  saveState();
  $("loginPage").classList.add("hidden");
  $("appPage").classList.remove("hidden");
  renderAll();
}

function logout() {
  state.user = null;
  saveState();
  $("appPage").classList.add("hidden");
  $("loginPage").classList.remove("hidden");
}

function renderMembers() {
  const list = $("membersList");
  list.innerHTML = "";

  state.members.forEach((m) => {
    const item = document.createElement("div");
    item.className = "list-item";
    item.innerHTML = `
      <div class="member-head">
        <img class="avatar" src="${m.photo || ""}" alt="${m.name}" />
        <div>
          <strong>${m.name}</strong>
          <div class="small">${m.role} • ${m.phone || "No phone"}</div>
        </div>
      </div>
      <div>
        <button data-action="edit">Edit</button>
        <button data-action="delete" class="danger">Delete</button>
      </div>
    `;

    item.querySelector('[data-action="edit"]').addEventListener("click", () => {
      $("memberId").value = m.id;
      $("memberName").value = m.name;
      $("memberRole").value = m.role;
      $("memberPhone").value = m.phone;
    });

    item.querySelector('[data-action="delete"]').addEventListener("click", () => {
      state.members = state.members.filter((x) => x.id !== m.id);
      state.tasks = state.tasks.filter((t) => t.memberId !== m.id);
      Object.keys(state.attendance).forEach((date) => {
        delete state.attendance[date][m.id];
      });
      saveState();
      renderAll();
    });
    list.appendChild(item);
  });
}

function croppedImageFromFile(file, cb) {
  const img = new Image();
  const reader = new FileReader();
  reader.onload = () => {
    img.onload = () => {
      const canvas = $("cropCanvas");
      canvas.classList.remove("hidden");
      const ctx = canvas.getContext("2d");
      const size = Math.min(img.width, img.height);
      const sx = (img.width - size) / 2;
      const sy = (img.height - size) / 2;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, sx, sy, size, size, 0, 0, canvas.width, canvas.height);
      cb(canvas.toDataURL("image/png"));
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function upsertMember(e) {
  e.preventDefault();
  const id = $("memberId").value || crypto.randomUUID();
  const existing = state.members.find((m) => m.id === id);
  const handleSave = (photo) => {
    const member = {
      id,
      name: $("memberName").value,
      role: $("memberRole").value,
      phone: $("memberPhone").value,
      photo: photo ?? existing?.photo ?? "",
    };

    if (existing) {
      Object.assign(existing, member);
    } else {
      state.members.push(member);
    }

    e.target.reset();
    $("memberId").value = "";
    saveState();
    renderAll();
  };

  const file = $("memberPhoto").files[0];
  if (file) {
    croppedImageFromFile(file, handleSave);
  } else {
    handleSave();
  }
}

function renderMemberOptions() {
  const options = state.members.map((m) => `<option value="${m.id}">${m.name}</option>`).join("");
  $("taskMember").innerHTML = options;
  $("taskFilterMember").innerHTML = `<option value="">All members</option>${options}`;
}

function addTask(e) {
  e.preventDefault();
  state.tasks.push({
    id: crypto.randomUUID(),
    memberId: $("taskMember").value,
    task: $("taskName").value,
    date: $("taskDate").value,
  });
  e.target.reset();
  saveState();
  renderTasks();
  renderAnalytics();
}

function renderTasks() {
  const fMember = $("taskFilterMember").value;
  const fDate = $("taskFilterDate").value;
  const rows = state.tasks.filter((t) => (!fMember || t.memberId === fMember) && (!fDate || t.date === fDate));
  $("taskTableBody").innerHTML = rows
    .map((t) => {
      const member = state.members.find((m) => m.id === t.memberId)?.name || "Unknown";
      return `<tr><td>${member}</td><td>${t.task}</td><td>${t.date}</td></tr>`;
    })
    .join("");
}

function toggleAttendance(memberId, checked) {
  const date = $("attendanceDate").value;
  if (!date) return;
  state.attendance[date] = state.attendance[date] || {};
  state.attendance[date][memberId] = checked;
  saveState();
  renderAnalytics();
  renderTeamPerformance();
}

function renderAttendance() {
  const date = $("attendanceDate").value;
  const map = state.attendance[date] || {};
  const el = $("attendanceGrid");
  el.innerHTML = state.members
    .map(
      (m) => `<label><input type="checkbox" data-member="${m.id}" ${map[m.id] ? "checked" : ""}/> ${m.name}</label>`,
    )
    .join("");
  el.querySelectorAll("input").forEach((box) => {
    box.addEventListener("change", (e) => toggleAttendance(box.dataset.member, e.target.checked));
  });
}

function renderAnalytics() {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);

  let weekly = 0;
  let monthly = 0;
  let yearly = 0;
  let overall = 0;

  Object.entries(state.attendance).forEach(([date, members]) => {
    const d = new Date(date);
    const attended = Object.values(members).filter(Boolean).length;
    overall += attended;
    if (d >= startOfWeek) weekly += attended;
    if (d >= startOfMonth) monthly += attended;
    if (d >= startOfYear) yearly += attended;
  });

  $("analytics").innerHTML = `
    <div class="stat"><strong>Weekly</strong><div>${weekly}</div></div>
    <div class="stat"><strong>Monthly</strong><div>${monthly}</div></div>
    <div class="stat"><strong>Yearly</strong><div>${yearly}</div></div>
    <div class="stat"><strong>Overall</strong><div>${overall}</div></div>
  `;
}

function renderFeatureTab() {
  const list = $("featureList");
  list.innerHTML = FEATURES[state.featureTab].map((f) => `<li>${f}</li>`).join("");
  document.querySelectorAll(".feature-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === state.featureTab);
  });
}

function renderTeamPerformance() {
  const totalAssigned = state.tasks.length;
  const totalMembers = state.members.length;
  const attendanceEvents = Object.values(state.attendance).flatMap((m) => Object.values(m));
  const present = attendanceEvents.filter(Boolean).length;
  const rate = attendanceEvents.length ? ((present / attendanceEvents.length) * 100).toFixed(1) : "0.0";

  $("teamPerformance").innerHTML = `
    <p><strong>Registered Members:</strong> ${totalMembers}</p>
    <p><strong>Total Assigned Tasks:</strong> ${totalAssigned}</p>
    <p><strong>Attendance Reliability:</strong> ${rate}%</p>
  `;
}

function addLog(e) {
  e.preventDefault();
  state.logs.unshift({ id: crypto.randomUUID(), title: $("logTitle").value, desc: $("logDesc").value, time: new Date().toISOString() });
  e.target.reset();
  saveState();
  renderLogs();
}

function renderLogs() {
  $("logList").innerHTML = state.logs
    .map((l) => `<div class="list-item"><div><strong>${l.title}</strong><div class="small">${new Date(l.time).toLocaleString()}</div><div>${l.desc}</div></div></div>`)
    .join("");
}

function addNote(e) {
  e.preventDefault();
  state.notes.unshift({ id: crypto.randomUUID(), text: $("noteText").value, done: false });
  e.target.reset();
  saveState();
  renderNotes();
}

function renderNotes() {
  const wrapper = $("notesList");
  wrapper.innerHTML = "";
  state.notes.forEach((n) => {
    const item = document.createElement("div");
    item.className = "list-item";
    item.innerHTML = `<span class="${n.done ? "note-done" : ""}">${n.text}</span><button>${n.done ? "Undo" : "Mark Done"}</button>`;
    item.querySelector("button").addEventListener("click", () => {
      n.done = !n.done;
      saveState();
      renderNotes();
    });
    wrapper.appendChild(item);
  });
}

function runClock() {
  const tick = () => {
    $("liveClock").textContent = new Date().toLocaleString();
  };
  tick();
  setInterval(tick, 1000);
}

function renderAll() {
  if (!state.user) return;
  $("dashboardSubtitle").textContent = `${state.user.teamName} • ${state.user.branch}`;
  renderSchedule();
  renderMembers();
  renderMemberOptions();
  renderAttendance();
  renderTasks();
  renderAnalytics();
  renderFeatureTab();
  renderTeamPerformance();
  renderLogs();
  renderNotes();
}

function setupEvents() {
  $("branchSelect").addEventListener("change", updateBranchOtherVisibility);
  $("loginForm").addEventListener("submit", login);
  $("logoutBtn").addEventListener("click", logout);

  document.querySelectorAll(".nav-link").forEach((btn) => {
    btn.addEventListener("click", () => showPage(btn.dataset.page));
  });

  $("memberForm").addEventListener("submit", upsertMember);
  $("attendanceDate").addEventListener("change", renderAttendance);
  $("taskForm").addEventListener("submit", addTask);
  $("taskFilterMember").addEventListener("change", renderTasks);
  $("taskFilterDate").addEventListener("change", renderTasks);

  document.querySelectorAll(".feature-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.featureTab = btn.dataset.tab;
      renderFeatureTab();
    });
  });

  $("logForm").addEventListener("submit", addLog);
  $("noteForm").addEventListener("submit", addNote);
}

function init() {
  loadState();
  setupEvents();
  $("attendanceDate").value = new Date().toISOString().slice(0, 10);
  runClock();
  if (state.user) {
    $("loginPage").classList.add("hidden");
    $("appPage").classList.remove("hidden");
    renderAll();
  }
}

init();
