const ADMIN_TOKEN_KEY = "closial-admin-token";

let adminState = {
  users: [],
  reports: [],
  ipBans: [],
  stats: {},
  query: "",
};

const loginView = document.querySelector("#admin-login");
const dashboard = document.querySelector("#admin-dashboard");
const loginForm = document.querySelector("#admin-login-form");
const loginMessage = document.querySelector("#admin-login-message");
const statsGrid = document.querySelector("#admin-stats");
const reportsList = document.querySelector("#reports-list");
const usersList = document.querySelector("#admin-users-list");
const ipBanList = document.querySelector("#ip-ban-list");
const reportCount = document.querySelector("#report-count");
const userSearch = document.querySelector("#admin-user-search");
const refreshButton = document.querySelector("#admin-refresh");
const logoutButton = document.querySelector("#admin-logout");

function adminToken() {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

function setAdminToken(value) {
  if (value) {
    localStorage.setItem(ADMIN_TOKEN_KEY, value);
  } else {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
  }
}

async function adminApi(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (adminToken()) headers.Authorization = `Bearer ${adminToken()}`;

  const response = await fetch(path, { ...options, headers });
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) throw new Error(payload.error || "Admin request failed.");
  return payload;
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginMessage.textContent = "";
  const data = new FormData(loginForm);

  try {
    const result = await adminApi("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password: data.get("password") }),
    });
    setAdminToken(result.token);
    loginForm.reset();
    await loadAdmin();
  } catch (error) {
    loginMessage.textContent = error.message;
  }
});

refreshButton.addEventListener("click", loadAdmin);

logoutButton.addEventListener("click", async () => {
  try {
    await adminApi("/api/admin/logout", { method: "POST" });
  } catch {
    // Local logout still clears the dashboard if the token was already expired.
  }
  setAdminToken(null);
  renderAuth();
});

userSearch.addEventListener("input", () => {
  adminState.query = userSearch.value.trim().toLowerCase();
  renderUsers();
});

usersList.addEventListener("submit", async (event) => {
  const karmaForm = event.target.closest("[data-admin-karma-form]");
  if (karmaForm) {
    event.preventDefault();
    const data = new FormData(karmaForm);
    const amount = Number(data.get("amount"));
    await adminApi(`/api/admin/users/${karmaForm.dataset.userId}/karma`, {
      method: "PATCH",
      body: JSON.stringify({ amount }),
    });
    await loadAdmin();
    return;
  }

  const form = event.target.closest("[data-user-moderation-form]");
  if (!form) return;
  event.preventDefault();

  const data = new FormData(form);
  await adminApi(`/api/admin/users/${form.dataset.userId}/moderation`, {
    method: "PATCH",
    body: JSON.stringify({
      banned: data.has("banned"),
      muted: data.has("muted"),
      chatRestricted: data.has("chatRestricted"),
      appRestricted: data.has("appRestricted"),
      ipBanned: data.has("ipBanned"),
      isModerator: data.has("isModerator"),
      reason: data.get("reason"),
    }),
  });
  await loadAdmin();
});

reportsList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-report-status]");
  if (!button) return;

  await adminApi(`/api/admin/reports/${button.dataset.reportId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: button.dataset.reportStatus }),
  });
  await loadAdmin();
});

ipBanList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-remove-ip]");
  if (!button) return;

  await adminApi(`/api/admin/ip-bans/${encodeURIComponent(button.dataset.removeIp)}`, {
    method: "DELETE",
  });
  await loadAdmin();
});

async function loadAdmin() {
  if (!adminToken()) {
    renderAuth();
    return;
  }

  try {
    const result = await adminApi("/api/admin/overview");
    adminState = {
      ...adminState,
      users: result.users,
      reports: result.reports,
      ipBans: result.ipBans,
      stats: result.stats,
    };
    renderDashboard();
  } catch {
    setAdminToken(null);
    renderAuth();
  }
}

function renderAuth() {
  loginView.classList.toggle("hidden", Boolean(adminToken()));
  dashboard.classList.toggle("hidden", !adminToken());
}

function renderDashboard() {
  renderAuth();
  statsGrid.innerHTML = `
    <div class="stat-card"><strong>${adminState.stats.users || 0}</strong><span>Users</span></div>
    <div class="stat-card"><strong>${adminState.stats.openReports || 0}</strong><span>Open reports</span></div>
    <div class="stat-card"><strong>${adminState.stats.reports || 0}</strong><span>Total reports</span></div>
    <div class="stat-card"><strong>${adminState.stats.ipBans || 0}</strong><span>IP bans</span></div>
  `;
  renderReports();
  renderUsers();
  renderIpBans();
}

function renderReports() {
  const open = adminState.reports.filter((report) => report.status === "open").length;
  reportCount.textContent = `${open} open`;

  reportsList.innerHTML = adminState.reports.length
    ? adminState.reports
        .map(
          (report) => `
            <article class="report-card ${report.status}">
              <div class="item-head">
                <div>
                  <strong>${escapeHtml(report.targetType)} report</strong>
                  <span>${formatTime(report.createdAt)} - ${escapeHtml(report.status)}</span>
                </div>
                <b>${escapeHtml(report.reason)}</b>
              </div>
              <p>${escapeHtml(report.details || "No extra details.")}</p>
              <div class="metadata">
                <span>Reporter: @${escapeHtml(report.reporter?.username || "unknown")}</span>
                <span>Target: ${escapeHtml(report.targetPreview || "unknown")}</span>
                <span>IP: ${escapeHtml(report.reporterIp || "unknown")}</span>
              </div>
              <div class="row-actions">
                ${["open", "reviewing", "resolved", "dismissed"]
                  .map(
                    (status) =>
                      `<button class="${report.status === status ? "active" : ""}" data-report-status="${status}" data-report-id="${report.id}" type="button">${status}</button>`,
                  )
                  .join("")}
              </div>
            </article>
          `,
        )
        .join("")
    : `<p class="muted">No reports yet.</p>`;
}

function renderUsers() {
  const filtered = adminState.users.filter((user) => {
    const haystack = `${user.fullName} ${user.username} ${user.email}`.toLowerCase();
    return !adminState.query || haystack.includes(adminState.query);
  });

  usersList.innerHTML = filtered.length
    ? filtered
        .map((user) => {
          const moderation = user.moderation || {};
          const ipBanned = Boolean(user.lastIp && adminState.ipBans.some((ban) => ban.ip === user.lastIp));
          return `
            <article class="user-card">
              <div class="item-head">
                <div>
                  <strong>${escapeHtml(user.fullName)}</strong>
                  <span>@${escapeHtml(user.username)}${modBadge(user)} - ${escapeHtml(user.email)}</span>
                </div>
                <b>${user.karma} karma</b>
              </div>
              <div class="metadata">
                <span>Last IP: ${escapeHtml(user.lastIp || "unknown")}</span>
                <span>Registered: ${formatTime(user.createdAt)}</span>
                <span>${user.followers.length} followers</span>
              </div>
              <form class="admin-karma-form" data-admin-karma-form data-user-id="${user.id}">
                <label>
                  Karma adjustment
                  <input name="amount" type="number" step="1" placeholder="+50 or -25" required />
                </label>
                <button type="submit">Apply karma</button>
              </form>
              <form class="moderation-form" data-user-moderation-form data-user-id="${user.id}">
                <label><input name="banned" type="checkbox" ${moderation.banned ? "checked" : ""} /> Ban account</label>
                <label><input name="appRestricted" type="checkbox" ${moderation.appRestricted ? "checked" : ""} /> Restrict app</label>
                <label><input name="muted" type="checkbox" ${moderation.muted ? "checked" : ""} /> Mute posting</label>
                <label><input name="chatRestricted" type="checkbox" ${moderation.chatRestricted ? "checked" : ""} /> Restrict chat</label>
                <label><input name="ipBanned" type="checkbox" ${ipBanned ? "checked" : ""} /> IP ban</label>
                <label><input name="isModerator" type="checkbox" ${user.isModerator ? "checked" : ""} /> Moderator</label>
                <input name="reason" type="text" maxlength="180" value="${escapeAttribute(moderation.reason || "")}" placeholder="Reason visible to admins" />
                <button type="submit">Save moderation</button>
              </form>
            </article>
          `;
        })
        .join("")
    : `<p class="muted">No users match that search.</p>`;
}

function renderIpBans() {
  ipBanList.innerHTML = adminState.ipBans.length
    ? adminState.ipBans
        .map(
          (ban) => `
            <div class="ip-row">
              <div>
                <strong>${escapeHtml(ban.ip)}</strong>
                <span>${escapeHtml(ban.reason || "No reason")} - ${formatTime(ban.createdAt)}</span>
              </div>
              <button data-remove-ip="${escapeAttribute(ban.ip)}" type="button">Remove</button>
            </div>
          `,
        )
        .join("")
    : `<p class="muted">No IP bans active.</p>`;
}

function modBadge(user) {
  return user?.isModerator ? `<span class="mod-badge" title="Closebook Moderator">MOD</span>` : "";
}

function formatTime(value) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value || Date.now()));
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

loadAdmin();
