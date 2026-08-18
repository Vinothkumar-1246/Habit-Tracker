const STORAGE = {
  users: "habitflow_users",
  session: "habitflow_session"
};

const API_BASE = window.location.protocol === "file:" ? "http://localhost:8081" : "";

const state = {
  user: null,
  habits: [],
  activeTab: "habits",
  weekStart: startOfWeek(new Date()),
  monthCursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  pendingDeleteId: null
};

const categories = ["Health", "Fitness", "Study", "Work", "Personal", "Finance", "Other"];
const iconMap = {
  Book: "B",
  Run: "R",
  Water: "W",
  Mind: "M",
  Work: "T",
  Money: "$",
  Star: "*"
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

document.addEventListener("DOMContentLoaded", init);

function init() {
  wireEvents();
  recoverSession();
}

function wireEvents() {
  $("#loginTab").addEventListener("click", () => showAuthForm("login"));
  $("#registerTab").addEventListener("click", () => showAuthForm("register"));
  $("#openRegisterLink").addEventListener("click", () => showAuthForm("register"));
  $("#openLoginLink").addEventListener("click", () => showAuthForm("login"));
  $("#loginForm").addEventListener("submit", handleLogin);
  $("#registerForm").addEventListener("submit", handleRegister);
  $("#logoutButton").addEventListener("click", logout);
  $("#headerLogoutButton").addEventListener("click", logout);
  $("#profileButton").addEventListener("click", toggleProfileMenu);
  $("#settingsButton").addEventListener("click", () => showToast("Settings are saved automatically."));
  $("#darkModeToggle").addEventListener("change", toggleTheme);
  $("#addHabitButton").addEventListener("click", () => openHabitModal());
  $("#habitForm").addEventListener("submit", saveHabitFromForm);
  $("#habitSearch").addEventListener("input", renderHabits);
  $("#categoryFilter").addEventListener("change", renderHabits);
  $("#prevWeek").addEventListener("click", () => shiftWeek(-1));
  $("#nextWeek").addEventListener("click", () => shiftWeek(1));
  $("#prevMonth").addEventListener("click", () => shiftMonth(-1));
  $("#nextMonth").addEventListener("click", () => shiftMonth(1));
  $("#cancelDelete").addEventListener("click", closeConfirmModal);
  $("#confirmDelete").addEventListener("click", deletePendingHabit);
  $$("[data-close-modal]").forEach((button) => button.addEventListener("click", closeHabitModal));
  $$("[data-toggle-password]").forEach((button) => {
    button.addEventListener("click", () => togglePassword(button.dataset.togglePassword, button));
  });
  $$(".main-tab").forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".profile-area")) {
      $("#profileMenu").classList.add("hidden");
      $("#profileButton").setAttribute("aria-expanded", "false");
    }
  });
}

function showAuthForm(type) {
  const isLogin = type === "login";
  $("#loginForm").classList.toggle("hidden", !isLogin);
  $("#registerForm").classList.toggle("hidden", isLogin);
  $("#loginTab").classList.toggle("active", isLogin);
  $("#registerTab").classList.toggle("active", !isLogin);
  clearMessages();
}

async function handleRegister(event) {
  event.preventDefault();
  const name = $("#registerName").value.trim();
  const identifier = normalizeIdentifier($("#registerIdentifier").value);
  const password = $("#registerPassword").value;
  const confirmPassword = $("#confirmPassword").value;
  const message = $("#registerMessage");

  if (!name || !identifier || !password || !confirmPassword) return setMessage(message, "All fields are required.");
  if (identifier.includes("@") && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) return setMessage(message, "Enter a valid email address.");
  if (password.length < 6) return setMessage(message, "Password must be at least 6 characters.");
  if (password !== confirmPassword) return setMessage(message, "Passwords do not match.");

  try {
    await apiRequest("/api/register", {
      method: "POST",
      body: { name, identifier, password }
    });
    setMessage(message, "Account created successfully! You can log in now.", true);
    $("#registerForm").reset();
    setTimeout(() => showAuthForm("login"), 800);
  } catch (error) {
    setMessage(message, error.message);
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const identifier = normalizeIdentifier($("#loginIdentifier").value);
  const password = $("#loginPassword").value;
  const message = $("#loginMessage");

  try {
    const response = await apiRequest("/api/login", {
      method: "POST",
      body: { identifier, password }
    });
    const user = response.user;
    localStorage.setItem(STORAGE.session, JSON.stringify({ userId: user.id, user, remember: $("#rememberLogin").checked }));
    await startDashboard(user);
  } catch (error) {
    setMessage(message, error.message);
  }
}

async function recoverSession() {
  const session = readJSON(STORAGE.session, null);
  if (!session || !session.userId || !session.user) {
    showAuth();
    return;
  }
  await startDashboard(session.user);
}

async function startDashboard(user) {
  state.user = user;
  state.habits = await loadHabits();
  state.weekStart = startOfWeek(new Date());
  state.monthCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  applySavedTheme();
  $("#authView").classList.add("hidden");
  $("#dashboardView").classList.remove("hidden");
  $("#profileName").textContent = user.name.split(" ")[0];
  $("#profileInitials").textContent = initials(user.name);
  $("#menuName").textContent = user.name;
  $("#menuEmail").textContent = user.identifier;
  $("#currentDate").textContent = formatLongDate(new Date());
  $("#greeting").textContent = `${timeGreeting()}, ${user.name.split(" ")[0]}`;
  renderAll();
}

function showAuth() {
  $("#dashboardView").classList.add("hidden");
  $("#authView").classList.remove("hidden");
}

function logout() {
  localStorage.removeItem(STORAGE.session);
  state.user = null;
  state.habits = [];
  $("#loginForm").reset();
  showAuth();
  showToast("Logged out. Your habit data is still saved.");
}

function getUsers() {
  return readJSON(STORAGE.users, []);
}

function saveUsers(users) {
  localStorage.setItem(STORAGE.users, JSON.stringify(users));
}

function userDataKey(userId = state.user.id) {
  return `habitflow_user_${userId}`;
}

function userThemeKey(userId = state.user.id) {
  return `habitflow_theme_${userId}`;
}

async function loadHabits() {
  if (!state.user?.id) return [];
  try {
    const data = await apiRequest(`/api/habits?userId=${encodeURIComponent(state.user.id)}`);
    return Array.isArray(data.habits) ? data.habits : [];
  } catch (error) {
    showToast(error.message);
    return [];
  }
}

async function saveHabits() {
  if (!state.user?.id) return;
  await apiRequest("/api/habits", {
    method: "POST",
    body: { userId: state.user.id, habits: state.habits }
  });
}

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function defaultSampleHabits() {
  const today = new Date();
  return [
    {
      id: `habit_${Date.now()}_1`,
      name: "Morning Exercise",
      description: "30 minutes of workout or stretching",
      category: "Fitness",
      icon: "Run",
      color: "#16a34a",
      frequency: "daily",
      createdAt: toDateKey(addDays(today, -7)),
      completions: {
        [toDateKey(addDays(today, -1))]: true,
        [toDateKey(addDays(today, -2))]: true
      }
    },
    {
      id: `habit_${Date.now()}_2`,
      name: "Drink Water",
      description: "Reach daily hydration target",
      category: "Health",
      icon: "Water",
      color: "#0284c7",
      frequency: "daily",
      createdAt: toDateKey(addDays(today, -7)),
      completions: {
        [toDateKey(today)]: true,
        [toDateKey(addDays(today, -1))]: true
      }
    },
    {
      id: `habit_${Date.now()}_3`,
      name: "Read Book",
      description: "Read 20 pages for growth",
      category: "Personal",
      icon: "Book",
      color: "#d97706",
      frequency: "daily",
      createdAt: toDateKey(addDays(today, -7)),
      completions: {
        [toDateKey(addDays(today, -1))]: true
      }
    }
  ];
}

function handleLocalApi(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const qIndex = path.indexOf("?");
  const endpoint = qIndex !== -1 ? path.slice(0, qIndex) : path;
  const queryString = qIndex !== -1 ? path.slice(qIndex + 1) : "";
  const params = new URLSearchParams(queryString);

  if (endpoint === "/api/register" && method === "POST") {
    const { name, identifier, password } = options.body || {};
    const norm = normalizeIdentifier(identifier || "");
    const users = getUsers();
    if (users.some((u) => normalizeIdentifier(u.identifier) === norm)) {
      throw new Error("An account with this email or username already exists.");
    }
    const newUser = {
      id: `user_${Date.now()}`,
      name,
      identifier: norm,
      password,
      createdAt: new Date().toISOString()
    };
    users.push(newUser);
    saveUsers(users);
    return { ok: true, user: newUser };
  }

  if (endpoint === "/api/login" && method === "POST") {
    const { identifier, password } = options.body || {};
    const norm = normalizeIdentifier(identifier || "");
    const users = getUsers();
    const user = users.find((u) => normalizeIdentifier(u.identifier) === norm && u.password === password);
    if (!user) {
      throw new Error("Invalid email/username or password.");
    }
    return { ok: true, user };
  }

  if (endpoint === "/api/habits" && method === "GET") {
    const userId = params.get("userId");
    if (!userId) return { ok: true, habits: [] };
    const stored = readJSON(userDataKey(userId), null);
    if (stored === null) {
      const defaults = defaultSampleHabits();
      localStorage.setItem(userDataKey(userId), JSON.stringify(defaults));
      return { ok: true, habits: defaults };
    }
    return { ok: true, habits: stored };
  }

  if (endpoint === "/api/habits" && method === "POST") {
    const { userId, habits } = options.body || {};
    if (userId) {
      localStorage.setItem(userDataKey(userId), JSON.stringify(habits || []));
    }
    return { ok: true };
  }

  throw new Error("Endpoint not supported.");
}

async function apiRequest(path, options = {}) {
  const fetchOptions = {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json" }
  };
  if (options.body) {
    fetchOptions.body = JSON.stringify(options.body);
  }

  if (!API_BASE) {
    return handleLocalApi(path, options);
  }

  try {
    const response = await fetch(`${API_BASE}${path}`, fetchOptions);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return handleLocalApi(path, options);
    }
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok || data.ok === false) {
      throw new Error(data.message || "Server request failed.");
    }
    return data;
  } catch (error) {
    if (error.message && !error.message.includes("Invalid") && !error.message.includes("exists")) {
      return handleLocalApi(path, options);
    }
    throw error;
  }
}

function normalizeIdentifier(value) {
  return value.trim().toLowerCase();
}

function setMessage(element, text, success = false) {
  element.textContent = text;
  element.classList.toggle("success", success);
}

function clearMessages() {
  $$(".form-message").forEach((item) => {
    item.textContent = "";
    item.classList.remove("success");
  });
}

function togglePassword(inputId, button) {
  const input = $(`#${inputId}`);
  input.type = input.type === "password" ? "text" : "password";
  button.textContent = input.type === "password" ? "Show" : "Hide";
}

function toggleProfileMenu() {
  const menu = $("#profileMenu");
  menu.classList.toggle("hidden");
  $("#profileButton").setAttribute("aria-expanded", String(!menu.classList.contains("hidden")));
}

function toggleTheme(event) {
  document.body.classList.toggle("dark", event.target.checked);
  localStorage.setItem(userThemeKey(), event.target.checked ? "dark" : "light");
  showToast("Theme preference saved.");
}

function applySavedTheme() {
  const theme = localStorage.getItem(userThemeKey()) || "light";
  document.body.classList.toggle("dark", theme === "dark");
  $("#darkModeToggle").checked = theme === "dark";
}

function renderAll() {
  renderStats();
  renderTodaySummary();
  renderHabits();
  renderWeeklyProgress();
  renderMonthlyProgress();
}

function switchTab(tab) {
  state.activeTab = tab;
  $$(".main-tab").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
  $$(".tab-section").forEach((section) => section.classList.remove("active"));
  $(`#${tab}Section`).classList.add("active");
  if (tab === "weekly") renderWeeklyProgress();
  if (tab === "monthly") renderMonthlyProgress();
}

function openHabitModal(habit = null) {
  $("#habitModalTitle").textContent = habit ? "Edit Habit" : "Add New Habit";
  $("#habitId").value = habit?.id || "";
  $("#habitName").value = habit?.name || "";
  $("#habitDescription").value = habit?.description || "";
  $("#habitCategory").value = habit?.category || "Health";
  $("#habitIcon").value = habit?.icon || "Book";
  $("#habitColor").value = habit?.color || "#4f46e5";
  $("#habitFrequency").value = habit?.frequency || "daily";
  $("#habitStartDate").value = habit?.createdAt || toDateKey(new Date());
  $("#habitModal").classList.remove("hidden");
  $("#habitName").focus();
}

function closeHabitModal() {
  $("#habitModal").classList.add("hidden");
  $("#habitForm").reset();
}

async function saveHabitFromForm(event) {
  event.preventDefault();
  const id = $("#habitId").value;
  const name = $("#habitName").value.trim();
  const createdAt = $("#habitStartDate").value;
  if (!name) return showToast("Habit name is required.");
  if (!createdAt) return showToast("Starting date is required.");

  const habitData = {
    name,
    description: $("#habitDescription").value.trim(),
    category: $("#habitCategory").value,
    icon: $("#habitIcon").value,
    color: $("#habitColor").value,
    frequency: $("#habitFrequency").value,
    createdAt
  };

  if (id) {
    state.habits = state.habits.map((habit) => habit.id === id ? { ...habit, ...habitData } : habit);
    showToast("Habit updated.");
  } else {
    state.habits.push({
      id: `habit_${Date.now()}`,
      ...habitData,
      completions: {}
    });
    showToast("Habit created successfully.");
  }
  try {
    await saveHabits();
    closeHabitModal();
    renderAll();
  } catch (error) {
    showToast(error.message);
  }
}

function renderHabits() {
  const list = $("#habitList");
  const query = $("#habitSearch").value.trim().toLowerCase();
  const category = $("#categoryFilter").value;
  const filtered = state.habits.filter((habit) => {
    const matchesQuery = habit.name.toLowerCase().includes(query) || habit.category.toLowerCase().includes(query);
    const matchesCategory = category === "All" || habit.category === category;
    return matchesQuery && matchesCategory;
  });

  if (!state.habits.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">+</div>
        <h3>No habits yet</h3>
        <p class="muted">Start building better habits today.</p>
        <button class="primary-button" type="button" data-create-first>Create Your First Habit</button>
        <button class="secondary-button" type="button" data-load-demo>Load Demo Data</button>
      </div>`;
    $("[data-create-first]").addEventListener("click", () => openHabitModal());
    $("[data-load-demo]").addEventListener("click", loadDemoData);
    return;
  }

  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state"><h3>No matching habits</h3><p class="muted">Try another search or category.</p></div>`;
    return;
  }

  list.innerHTML = filtered.map(renderHabitCard).join("");
  list.querySelectorAll("[data-complete]").forEach((button) => button.addEventListener("click", () => toggleCompletion(button.dataset.complete)));
  list.querySelectorAll("[data-edit]").forEach((button) => {
    button.addEventListener("click", () => openHabitModal(state.habits.find((habit) => habit.id === button.dataset.edit)));
  });
  list.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => openConfirmModal(button.dataset.delete)));
}

function renderHabitCard(habit) {
  const today = toDateKey(new Date());
  const isDone = Boolean(habit.completions[today]);
  const stats = habitStats(habit, new Date());
  return `
    <article class="habit-card ${isDone ? "completed" : ""}" style="--habit-color:${escapeHTML(habit.color)}">
      <button class="check-toggle" type="button" data-complete="${habit.id}" aria-label="${isDone ? "Undo" : "Complete"} ${escapeHTML(habit.name)}">
        <span>${isDone ? "&#10003;" : ""}</span>
      </button>
      <div class="habit-checklist-main">
        <div class="habit-title">
          <div class="habit-icon" aria-hidden="true">${escapeHTML(iconMap[habit.icon] || "*")}</div>
          <div>
            <h4>${escapeHTML(habit.name)}</h4>
            <div class="habit-tags">
              <span class="pill">${escapeHTML(habit.category)}</span>
              <span class="pill">${frequencyLabel(habit.frequency)}</span>
              <span class="pill">${isDone ? "Done Today" : "Open"}</span>
            </div>
          </div>
        </div>
        <p class="muted">${escapeHTML(habit.description || "No description added.")}</p>
        <div class="meta-grid">
          <span>Current streak: ${stats.currentStreak} days</span>
          <span>Best streak: ${stats.longestStreak} days</span>
          <span>Total completed: ${stats.totalCompleted}</span>
        </div>
      </div>
      <div class="habit-actions">
        <button class="primary-button complete-button" type="button" data-complete="${habit.id}">${isDone ? "Undo" : "Complete"}</button>
        <button class="secondary-button" type="button" data-edit="${habit.id}">Edit</button>
        <button class="secondary-button danger" type="button" data-delete="${habit.id}">Delete</button>
      </div>
    </article>`;
}

async function toggleCompletion(id) {
  const today = toDateKey(new Date());
  const habit = state.habits.find((item) => item.id === id);
  if (!habit) return;
  const wasDone = Boolean(habit.completions[today]);
  if (habit.completions[today]) {
    delete habit.completions[today];
  } else {
    habit.completions[today] = true;
  }
  try {
    await saveHabits();
    showToast(wasDone ? "Today completion undone." : "Habit completed.");
    renderAll();
  } catch (error) {
    habit.completions[today] = wasDone || undefined;
    if (!wasDone) delete habit.completions[today];
    showToast(error.message);
  }
}

function openConfirmModal(id) {
  state.pendingDeleteId = id;
  $("#confirmModal").classList.remove("hidden");
}

function closeConfirmModal() {
  state.pendingDeleteId = null;
  $("#confirmModal").classList.add("hidden");
}

async function deletePendingHabit() {
  if (!state.pendingDeleteId) return;
  const previous = [...state.habits];
  state.habits = state.habits.filter((habit) => habit.id !== state.pendingDeleteId);
  try {
    await saveHabits();
    closeConfirmModal();
    renderAll();
    showToast("Habit deleted.");
  } catch (error) {
    state.habits = previous;
    showToast(error.message);
  }
}

function renderStats() {
  const today = progressForDay(new Date());
  const currentWeekStart = startOfWeek(new Date());
  const week = progressForRange(daysInRange(currentWeekStart, addDays(currentWeekStart, 6)));
  const now = new Date();
  const monthDays = daysInMonth(now.getFullYear(), now.getMonth());
  const month = progressForRange(monthDays);
  const streaks = state.habits.map((habit) => habitStats(habit, new Date()));
  const currentStreak = Math.max(0, ...streaks.map((item) => item.currentStreak));
  const bestStreak = Math.max(0, ...streaks.map((item) => item.longestStreak));
  $("#statsGrid").innerHTML = [
    ["Total Habits", state.habits.length],
    ["Today's Progress", `${today.percent}%`],
    ["Weekly Progress", `${week.percent}%`],
    ["Monthly Progress", `${month.percent}%`],
    ["Current Streak", `${currentStreak} days`],
    ["Best Streak", `${bestStreak} days`]
  ].map(statCard).join("");
}

function renderTodaySummary() {
  const today = progressForDay(new Date());
  $("#todaySummary").textContent = `${today.completed} / ${today.required} Habits Completed`;
  $("#todayPercent").textContent = `${today.percent}% Complete`;
}

function renderWeeklyProgress() {
  const days = daysInRange(state.weekStart, addDays(state.weekStart, 6));
  $("#weekTitle").textContent = `${formatShortDate(days[0])} - ${formatShortDate(days[6])}`;
  const week = progressForRange(days);
  const bestDay = days.reduce((best, day) => {
    const progress = progressForDay(day);
    return progress.percent > best.percent ? { day, percent: progress.percent } : best;
  }, { day: days[0], percent: -1 });

  $("#weeklySummary").innerHTML = [
    ["Overall Completion", `${week.percent}%`],
    ["Completed", week.completed],
    ["Missed", week.missed],
    ["Best Day", formatWeekday(bestDay.day)]
  ].map(statCard).join("");

  $("#weeklyChart").innerHTML = days.map((day) => {
    const progress = progressForDay(day);
    return `
      <div class="bar-row">
        <strong>${formatWeekday(day).slice(0, 3)}</strong>
        <div class="bar-track"><div class="bar-fill" style="width:${progress.percent}%"></div></div>
        <span>${progress.percent}%</span>
      </div>`;
  }).join("");

  $("#weeklyCalendar").innerHTML = days.map((day) => {
    const progress = progressForDay(day);
    const status = statusForProgress(progress, day);
    return `
      <div class="day-box">
        <strong>${formatWeekday(day).slice(0, 3)}</strong>
        <span>${day.getDate()}</span>
        <span class="status ${status.className}">${status.label}</span>
      </div>`;
  }).join("");

  $("#weeklyBreakdown").innerHTML = renderBreakdown(days);
}

function renderMonthlyProgress() {
  const year = state.monthCursor.getFullYear();
  const month = state.monthCursor.getMonth();
  const monthDays = daysInMonth(year, month);
  const stats = progressForRange(monthDays);
  const habitTotals = state.habits.map((habit) => {
    const required = monthDays.filter((day) => isRequiredOn(habit, day)).length;
    const completed = monthDays.filter((day) => habit.completions[toDateKey(day)] && isRequiredOn(habit, day)).length;
    return { habit, completed, required, percent: required ? Math.round((completed / required) * 100) : 0 };
  });
  const bestHabit = habitTotals.reduce((best, item) => item.percent > best.percent ? item : best, { habit: null, percent: 0 });
  const longest = Math.max(0, ...state.habits.map((habit) => habitStats(habit, new Date(year, month + 1, 0)).longestStreak));

  $("#monthTitle").textContent = state.monthCursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  $("#monthlySummary").innerHTML = [
    ["Monthly Completion", `${stats.percent}%`],
    ["Completed", stats.completed],
    ["Missed", stats.missed],
    ["Best Habit", bestHabit.habit ? bestHabit.habit.name : "None"],
    ["Longest Streak", `${longest} days`]
  ].map(statCard).join("");

  renderMonthlyCalendar(year, month);
  renderHeatmap(monthDays);
  $("#monthlyBreakdown").innerHTML = renderBreakdown(monthDays);
}

function renderMonthlyCalendar(year, month) {
  const labels = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((label) => `<div class="calendar-label">${label}</div>`);
  const first = new Date(year, month, 1);
  const blanks = (first.getDay() + 6) % 7;
  const days = daysInMonth(year, month);
  const blankCells = Array.from({ length: blanks }, () => `<div class="month-day blank"></div>`);
  const dayCells = days.map((day) => {
    const progress = progressForDay(day);
    return `<div class="month-day level-${levelForPercent(progress.percent, progress.required)}"><strong>${day.getDate()}</strong><br><span class="muted">${progress.required ? `${progress.percent}%` : "No activity"}</span></div>`;
  });
  $("#monthlyCalendar").innerHTML = [...labels, ...blankCells, ...dayCells].join("");
}

function renderHeatmap(days) {
  const weekLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const cells = [];
  weekLabels.forEach((label, index) => {
    cells.push(`<span class="heat-label">${label}</span>`);
    for (let week = 0; week < 6; week++) {
      const day = days.find((date) => Math.floor((date.getDate() + ((new Date(date.getFullYear(), date.getMonth(), 1).getDay() + 6) % 7) - 1) / 7) === week && ((date.getDay() + 6) % 7) === index);
      if (!day) {
        cells.push(`<span class="heat-cell"></span>`);
      } else {
        const progress = progressForDay(day);
        cells.push(`<span class="heat-cell heat-level-${levelForPercent(progress.percent, progress.required)}" title="${toDateKey(day)} ${progress.percent}%"></span>`);
      }
    }
  });
  $("#monthlyHeatmap").innerHTML = cells.join("");
}

function renderBreakdown(days) {
  if (!state.habits.length) return `<p class="muted">No habits to analyze yet.</p>`;
  return state.habits.map((habit) => {
    const required = days.filter((day) => isRequiredOn(habit, day)).length;
    const completed = days.filter((day) => habit.completions[toDateKey(day)] && isRequiredOn(habit, day)).length;
    const percent = required ? Math.round((completed / required) * 100) : 0;
    return `
      <div class="breakdown-item">
        <strong>${escapeHTML(habit.name)}</strong>
        <div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div>
        <span>${completed}/${required} ${percent}%</span>
      </div>`;
  }).join("");
}

function statCard([label, value]) {
  return `<article class="stat-card"><span>${escapeHTML(String(label))}</span><strong>${escapeHTML(String(value))}</strong></article>`;
}

function progressForDay(day) {
  const today = parseDate(toDateKey(new Date()));
  if (day > today) {
    return { completed: 0, required: 0, missed: 0, percent: 0 };
  }
  const requiredHabits = state.habits.filter((habit) => isRequiredOn(habit, day));
  const completed = requiredHabits.filter((habit) => habit.completions[toDateKey(day)]).length;
  const required = requiredHabits.length;
  return {
    completed,
    required,
    missed: Math.max(required - completed, 0),
    percent: required ? Math.round((completed / required) * 100) : 0
  };
}

function progressForRange(days) {
  const totals = days.reduce((acc, day) => {
    const progress = progressForDay(day);
    acc.completed += progress.completed;
    acc.required += progress.required;
    return acc;
  }, { completed: 0, required: 0 });
  return {
    ...totals,
    missed: Math.max(totals.required - totals.completed, 0),
    percent: totals.required ? Math.round((totals.completed / totals.required) * 100) : 0
  };
}

function habitStats(habit, anchorDate) {
  const completedKeys = Object.keys(habit.completions || {}).filter((key) => habit.completions[key]).sort();
  let longestStreak = 0;
  let running = 0;
  const start = parseDate(habit.createdAt);
  const end = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate());

  for (const day of daysInRange(start, end)) {
    if (!isRequiredOn(habit, day)) continue;
    if (habit.completions[toDateKey(day)]) {
      running += 1;
      longestStreak = Math.max(longestStreak, running);
    } else if (day <= end) {
      running = 0;
    }
  }

  let currentStreak = 0;
  for (let day = new Date(end); day >= start; day = addDays(day, -1)) {
    if (!isRequiredOn(habit, day)) continue;
    if (habit.completions[toDateKey(day)]) {
      currentStreak += 1;
    } else {
      break;
    }
  }

  return { currentStreak, longestStreak, totalCompleted: completedKeys.length };
}

function isRequiredOn(habit, date) {
  if (parseDate(habit.createdAt) > date) return false;
  const day = date.getDay();
  if (habit.frequency === "weekdays") return day >= 1 && day <= 5;
  if (habit.frequency === "weekends") return day === 0 || day === 6;
  return true;
}

async function loadDemoData() {
  const today = new Date();
  const demo = [
    ["Study Java", "Practice Java for 1 hour", "Study", "Book", "#4f46e5", "daily"],
    ["Exercise", "Move for at least 30 minutes", "Fitness", "Run", "#16a34a", "weekdays"],
    ["Drink Water", "Reach the daily hydration target", "Health", "Water", "#0284c7", "daily"],
    ["Read Book", "Read 20 focused pages", "Personal", "Book", "#d97706", "daily"],
    ["Meditation", "Ten quiet minutes", "Health", "Mind", "#7c3aed", "weekends"]
  ];
  state.habits = demo.map((item, index) => {
    const completions = {};
    for (let offset = 0; offset < 18; offset++) {
      const day = addDays(today, -offset);
      if ((offset + index) % 4 !== 0) completions[toDateKey(day)] = true;
    }
    return {
      id: `habit_demo_${Date.now()}_${index}`,
      name: item[0],
      description: item[1],
      category: item[2],
      icon: item[3],
      color: item[4],
      frequency: item[5],
      createdAt: toDateKey(addDays(today, -22)),
      completions
    };
  });
  try {
    await saveHabits();
    renderAll();
    showToast("Demo data loaded.");
  } catch (error) {
    showToast(error.message);
  }
}

function shiftWeek(amount) {
  state.weekStart = addDays(state.weekStart, amount * 7);
  renderWeeklyProgress();
  renderStats();
}

function shiftMonth(amount) {
  state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() + amount, 1);
  renderMonthlyProgress();
  renderStats();
}

function statusForProgress(progress, day) {
  const today = parseDate(toDateKey(new Date()));
  if (day > today) return { label: "-", className: "status-future" };
  if (!progress.required) return { label: "-", className: "status-future" };
  if (progress.percent === 100) return { label: "OK", className: "status-complete" };
  if (progress.percent > 0) return { label: "PART", className: "status-partial" };
  return { label: "MISS", className: "status-missed" };
}

function levelForPercent(percent, required) {
  if (!required) return 0;
  if (percent === 100) return 4;
  if (percent >= 67) return 3;
  if (percent >= 34) return 2;
  if (percent > 0) return 1;
  return 0;
}

function daysInMonth(year, month) {
  const total = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: total }, (_, index) => new Date(year, month, index + 1));
}

function daysInRange(start, end) {
  const days = [];
  for (let day = new Date(start); day <= end; day = addDays(day, 1)) {
    days.push(new Date(day));
  }
  return days;
}

function startOfWeek(date) {
  const copy = parseDate(toDateKey(date));
  const diff = (copy.getDay() + 6) % 7;
  return addDays(copy, -diff);
}

function addDays(date, amount) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

function parseDate(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatLongDate(date) {
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function formatShortDate(date) {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatWeekday(date) {
  return date.toLocaleDateString(undefined, { weekday: "long" });
}

function timeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join("") || "HF";
}

function frequencyLabel(value) {
  return {
    daily: "Daily",
    weekdays: "Weekdays",
    weekends: "Weekends",
    custom: "Custom"
  }[value] || "Daily";
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  $("#toastHost").appendChild(toast);
  setTimeout(() => toast.remove(), 2800);
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}
