const TOKEN_KEY = "closial-media-token";
const ACTIVE_VIEW_KEY = "closial-active-view";
const ACTIVE_CHAT_KEY = "closial-active-chat";
const savedActiveView = localStorage.getItem(ACTIVE_VIEW_KEY) || "feed";

let state = {
  currentUser: null,
  users: [],
  posts: [],
  chats: [],
  notifications: [],
  activeView: savedActiveView,
  activeChatId: savedActiveView === "chats" ? localStorage.getItem(ACTIVE_CHAT_KEY) || null : null,
  viewedProfileId: localStorage.getItem("closial-view-profile") || null,
};

const authScreen = document.querySelector("#auth-screen");
const appShell = document.querySelector("#app-shell");
const loginForm = document.querySelector("#login-form");
const registerForm = document.querySelector("#register-form");
const loginMessage = document.querySelector("#login-message");
const registerMessage = document.querySelector("#register-message");
const showLogin = document.querySelector("#show-login");
const showRegister = document.querySelector("#show-register");
const logoutBtn = document.querySelector("#logout-btn");
const postForm = document.querySelector("#post-form");
const postBody = postForm.elements.body;
const postCount = document.querySelector("#post-count");
const postMessage = document.querySelector("#post-message");
const postMentionSuggestions = document.querySelector("#post-mention-suggestions");
const imageInput = document.querySelector("#image-input");
const imagePreview = document.querySelector("#image-preview");
const postsList = document.querySelector("#posts-list");
const peopleList = document.querySelector("#people-list");
const peopleSearch = document.querySelector("#people-search");
const currentUserName = document.querySelector("#current-user-name");
const currentKarma = document.querySelector("#current-karma");
const profileCard = document.querySelector("#profile-card");
const storiesList = document.querySelector("#stories-list");
const karmaBoard = document.querySelector("#karma-board");
const railUsername = document.querySelector("#rail-username");
const composerAvatar = document.querySelector("#composer-avatar");
const railAvatar = document.querySelector("#rail-avatar");
const trendList = document.querySelector("#trend-list");
const suggestedList = document.querySelector("#suggested-list");
const liveStatus = document.querySelector("#live-status");
const railLiveStatus = document.querySelector("#rail-live-status");
const chatForm = document.querySelector("#chat-form");
const chatMembers = document.querySelector("#chat-members");
const chatSearch = document.querySelector("#chat-search");
const groupModal = document.querySelector("#group-modal");
const openGroupModal = document.querySelector("#open-group-modal");
const closeGroupModal = document.querySelector("#close-group-modal");
const chatList = document.querySelector("#chat-list");
const messagesList = document.querySelector("#messages-list");
const messageForm = document.querySelector("#message-form");
const messageInput = messageForm.elements.message;
const messageStatus = document.querySelector("#message-status");
const chatMentionSuggestions = document.querySelector("#chat-mention-suggestions");
const chatMessage = document.querySelector("#chat-message");
const groupMessage = document.querySelector("#group-message");
const activeChatHeader = document.querySelector("#active-chat-header");
const notificationsList = document.querySelector("#notifications-list");
const markReadBtn = document.querySelector("#mark-read-btn");
const chatBackBtn = document.querySelector("#chat-back-btn");
const chatLayout = document.querySelector(".chat-layout");
const chatSettings = document.querySelector("#chat-settings");
const replyPreview = document.querySelector("#reply-preview");

let selectedImageData = "";
let liveSource = null;
let refreshTimer = null;
let peopleQuery = "";
let feedFilter = "all";
let replyToMessageId = "";
let profileTab = "posts";
let chatQuery = "";
const MESSAGE_REACTIONS = ["Like", "Wow", "Boost", "Agree"];

function token() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(value) {
  if (value) {
    localStorage.setItem(TOKEN_KEY, value);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

function setLiveState(online) {
  [liveStatus, railLiveStatus].forEach((item) => {
    if (!item) return;
    item.classList.toggle("online", online);
    item.lastChild.textContent = online ? " Live" : " Offline";
  });
}

async function api(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token()) headers.Authorization = `Bearer ${token()}`;

  const response = await fetch(path, {
    ...options,
    headers,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new Error(payload.error || "Something went wrong.");
  }

  return payload;
}

function userById(id) {
  return state.users.find((user) => user.id === id);
}

function formatTime(value) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function karmaRank(karma) {
  if (karma >= 100) return "God Level";
  if (karma >= 50) return "Hero";
  if (karma >= 15) return "Trusted";
  if (karma > -15) return "Neutral";
  if (karma > -50) return "Troublemaker";
  return "Villain Level";
}

function initials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function setAuthTab(mode) {
  const loginMode = mode === "login";
  loginForm.classList.toggle("hidden", !loginMode);
  registerForm.classList.toggle("hidden", loginMode);
  showLogin.classList.toggle("active", loginMode);
  showRegister.classList.toggle("active", !loginMode);
  loginMessage.textContent = "";
  registerMessage.textContent = "";
}

showLogin.addEventListener("click", () => setAuthTab("login"));
showRegister.addEventListener("click", () => setAuthTab("register"));

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  registerMessage.textContent = "";

  const data = Object.fromEntries(new FormData(registerForm));

  try {
    const result = await api("/api/register", {
      method: "POST",
      body: JSON.stringify(data),
    });

    setToken(result.token);
    registerForm.reset();
    await bootstrap();
  } catch (error) {
    registerMessage.textContent = error.message;
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginMessage.textContent = "";

  const data = Object.fromEntries(new FormData(loginForm));

  try {
    const result = await api("/api/login", {
      method: "POST",
      body: JSON.stringify(data),
    });

    setToken(result.token);
    loginForm.reset();
    await bootstrap();
  } catch (error) {
    loginMessage.textContent = error.message;
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    await api("/api/logout", { method: "POST" });
  } catch {
    // Logging out locally is still useful if the server already forgot the session.
  }

  setToken(null);
  closeLiveStream();
  state = {
    ...state,
    currentUser: null,
    posts: [],
    users: [],
    chats: [],
    notifications: [],
    activeView: "feed",
    activeChatId: null,
    viewedProfileId: null,
  };
  localStorage.removeItem(ACTIVE_CHAT_KEY);
  localStorage.removeItem(ACTIVE_VIEW_KEY);
  localStorage.removeItem("closial-view-profile");
  render();
});

document.querySelectorAll(".nav-link").forEach((button) => {
  button.addEventListener("click", async () => {
    const nextView = button.dataset.view;
    const previousView = state.activeView;

    if (nextView === "chats" && previousView !== "chats") {
      clearActiveChat();
    }

    showView(nextView);

    if (nextView === "profile") {
      state.viewedProfileId = state.currentUser.id;
      localStorage.setItem("closial-view-profile", state.viewedProfileId);
      renderProfile();
    }
    if (nextView === "chats") await refreshChats();
    if (nextView === "notifications") await refreshNotifications();
  });
});

document.addEventListener("click", (event) => {
  const mentionTrigger = event.target.closest("[data-mention-user]");
  if (mentionTrigger) {
    event.preventDefault();
    navigateToProfile(mentionTrigger.dataset.mentionUser);
    return;
  }

  const messageTrigger = event.target.closest("[data-message-user]");
  if (messageTrigger && !profileCard.contains(messageTrigger)) {
    event.preventDefault();
    startDirectMessage(messageTrigger.dataset.messageUser);
    return;
  }

  const profileTrigger = event.target.closest("[data-profile-id]");
  if (!profileTrigger) return;

  event.preventDefault();
  navigateToProfile(profileTrigger.dataset.profileId);
});

document.querySelectorAll(".feed-tab").forEach((button) => {
  button.addEventListener("click", () => {
    feedFilter = button.dataset.feedFilter;
    document.querySelectorAll(".feed-tab").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    renderPosts();
  });
});

chatBackBtn.addEventListener("click", () => {
  clearActiveChat();
});

chatSearch.addEventListener("input", () => {
  chatQuery = chatSearch.value.trim().toLowerCase();
  renderChats();
});

openGroupModal.addEventListener("click", () => {
  chatMessage.textContent = "";
  groupMessage.textContent = "";
  groupModal.classList.remove("hidden");
  chatForm.elements.name.focus();
});

closeGroupModal.addEventListener("click", closeGroupCreator);

groupModal.addEventListener("click", (event) => {
  if (event.target === groupModal) closeGroupCreator();
});

peopleSearch.addEventListener("input", () => {
  peopleQuery = peopleSearch.value.trim().toLowerCase();
  renderPeople();
});

markReadBtn.addEventListener("click", async () => {
  await api("/api/notifications/read", { method: "POST" });
  await refreshNotifications();
});

postBody.addEventListener("input", () => {
  postCount.textContent = `${postBody.value.length}/280`;
  renderMentionSuggestions(postBody, postMentionSuggestions, mentionablePostUsers());
});

postBody.addEventListener("keydown", (event) => {
  handleMentionSuggestionKeys(event, postBody, postMentionSuggestions);
});

messageInput.addEventListener("input", () => {
  renderMentionSuggestions(messageInput, chatMentionSuggestions, mentionableChatUsers());
});

messageInput.addEventListener("keydown", (event) => {
  handleMentionSuggestionKeys(event, messageInput, chatMentionSuggestions);
});

imageInput.addEventListener("change", async () => {
  postMessage.textContent = "";
  const file = imageInput.files[0];
  selectedImageData = "";
  imagePreview.classList.add("hidden");
  imagePreview.innerHTML = "";

  if (!file) return;

  if (!file.type.startsWith("image/")) {
    postMessage.textContent = "Please choose an image file.";
    imageInput.value = "";
    return;
  }

  if (file.size > 1_500_000) {
    postMessage.textContent = "Choose an image smaller than 1.5 MB.";
    imageInput.value = "";
    return;
  }

  selectedImageData = await fileToDataUrl(file);
  imagePreview.innerHTML = `<img src="${selectedImageData}" alt="Selected post preview" />`;
  imagePreview.classList.remove("hidden");
});

postForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = postBody.value.trim();
  postMessage.textContent = "";

  if (!body && !selectedImageData) {
    postMessage.textContent = "Add a photo or write a caption first.";
    return;
  }

  try {
    await api("/api/posts", {
      method: "POST",
      body: JSON.stringify({ body, imageData: selectedImageData }),
    });

    postForm.reset();
    hideMentionSuggestions(postMentionSuggestions);
    selectedImageData = "";
    imagePreview.classList.add("hidden");
    imagePreview.innerHTML = "";
    postCount.textContent = "0/280";
    await refreshSocial();
  } catch (error) {
    postMessage.textContent = error.message;
  }
});

postsList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  if (button.dataset.action === "report") {
    await submitReport("post", button.dataset.postId, "Report this post");
  } else if (button.dataset.action === "comment") {
    const input = postsList.querySelector(`input[data-comment-input="${button.dataset.postId}"]`);
    const body = input?.value.trim();
    if (!body) return;
    await api(`/api/posts/${button.dataset.postId}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
    input.value = "";
  } else if (button.dataset.action === "delete") {
    await api(`/api/posts/${button.dataset.postId}`, {
      method: "DELETE",
    });
  } else {
    await api(`/api/posts/${button.dataset.postId}/${button.dataset.action}`, {
      method: "POST",
    });
  }

  await refreshSocial();
});

peopleList.addEventListener("click", async (event) => {
  const reportButton = event.target.closest("button[data-report-user]");
  if (reportButton) {
    await submitReport("user", reportButton.dataset.reportUser, "Report this user");
    return;
  }

  const followButton = event.target.closest("button[data-follow-user]");
  if (followButton) {
    await api(`/api/users/${followButton.dataset.followUser}/follow`, { method: "POST" });
    await refreshSocial();
    return;
  }

  const button = event.target.closest("button[data-karma]");
  if (!button) return;

  await api(`/api/users/${button.dataset.userId}/karma`, {
    method: "POST",
    body: JSON.stringify({ vote: Number(button.dataset.karma) }),
  });

  await refreshSocial();
});

profileCard.addEventListener("click", async (event) => {
  const tabButton = event.target.closest("button[data-profile-tab]");
  if (tabButton) {
    profileTab = tabButton.dataset.profileTab;
    renderProfile();
    return;
  }

  const followButton = event.target.closest("button[data-follow-user]");
  if (followButton) {
    await api(`/api/users/${followButton.dataset.followUser}/follow`, { method: "POST" });
    await refreshSocial();
    return;
  }

  const karmaButton = event.target.closest("button[data-karma]");
  if (karmaButton) {
    await api(`/api/users/${karmaButton.dataset.userId}/karma`, {
      method: "POST",
      body: JSON.stringify({ vote: Number(karmaButton.dataset.karma) }),
    });
    await refreshSocial();
    return;
  }

  const messageButton = event.target.closest("button[data-message-user]");
  if (messageButton) {
    await startDirectMessage(messageButton.dataset.messageUser);
    return;
  }

  const reportButton = event.target.closest("button[data-report-user]");
  if (reportButton) {
    await submitReport("user", reportButton.dataset.reportUser, "Report this user");
  }
});

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  groupMessage.textContent = "";
  const data = new FormData(chatForm);
  const selectedMembers = Array.from(
    chatMembers.querySelectorAll("input[type='checkbox']:checked"),
  ).map((input) => input.value);

  if (!selectedMembers.length) return;
  if (selectedMembers.length < 2) {
    groupMessage.textContent = "Select at least two people for a group chat.";
    return;
  }
  if (!data.get("name").trim()) {
    chatForm.elements.name.focus();
    return;
  }

  try {
    const result = await api("/api/chats", {
      method: "POST",
      body: JSON.stringify({
        name: data.get("name"),
        members: selectedMembers,
      }),
    });

    state.activeChatId = result.chat.id;
    localStorage.setItem(ACTIVE_CHAT_KEY, state.activeChatId);
    showView("chats");
    chatForm.reset();
    closeGroupCreator();
    await refreshChats();
  } catch (error) {
    groupMessage.textContent = error.message;
  }
});

chatSettings.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-chat-action]");
  if (!button || !state.activeChatId) return;

  const action = button.dataset.chatAction;
  const userId = button.dataset.userId || "";

  if (action === "add-member") {
    const select = chatSettings.querySelector("[data-add-member-select]");
    if (!select.value) return;
    await api(`/api/chats/${state.activeChatId}/members`, {
      method: "POST",
      body: JSON.stringify({ userId: select.value }),
    });
  }

  if (action === "remove-member") {
    await api(`/api/chats/${state.activeChatId}/members`, {
      method: "DELETE",
      body: JSON.stringify({ userId }),
    });
  }

  if (action === "make-admin") {
    await api(`/api/chats/${state.activeChatId}/admins`, {
      method: "POST",
      body: JSON.stringify({ userId }),
    });
  }

  if (action === "remove-admin") {
    await api(`/api/chats/${state.activeChatId}/admins`, {
      method: "DELETE",
      body: JSON.stringify({ userId }),
    });
  }

  await refreshChats();
});

chatSettings.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-rename-chat-form]");
  if (!form || !state.activeChatId) return;

  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  await api(`/api/chats/${state.activeChatId}`, {
    method: "PATCH",
    body: JSON.stringify({ name: data.name }),
  });
  await refreshChats();
});

chatList.addEventListener("click", async (event) => {
  const userButton = event.target.closest("button[data-start-chat-user]");
  if (userButton) {
    chatMessage.textContent = "";
    try {
      await startDirectMessage(userButton.dataset.startChatUser);
      chatSearch.value = "";
      chatQuery = "";
    } catch (error) {
      chatMessage.textContent = error.message;
    }
    return;
  }

  const button = event.target.closest("button[data-chat-id]");
  if (!button) return;
  state.activeChatId = button.dataset.chatId;
  localStorage.setItem(ACTIVE_CHAT_KEY, state.activeChatId);
  showView("chats");
  chatLayout.classList.add("thread-open");
  await api(`/api/chats/${state.activeChatId}/read`, { method: "POST" });
  await refreshChats();
});

messagesList.addEventListener("click", async (event) => {
  const reportButton = event.target.closest("button[data-report-message]");
  if (reportButton) {
    await submitReport("message", reportButton.dataset.reportMessage, "Report this message");
    return;
  }

  const reactionButton = event.target.closest("button[data-message-reaction]");
  if (reactionButton && state.activeChatId) {
    await api(`/api/chats/${state.activeChatId}/messages/${reactionButton.dataset.messageId}/reactions`, {
      method: "POST",
      body: JSON.stringify({ reaction: reactionButton.dataset.messageReaction }),
    });
    await refreshChats();
    return;
  }

  const button = event.target.closest("button[data-reply-message]");
  if (!button) return;

  const chat = activeChat();
  const message = chat?.messages.find((item) => item.id === button.dataset.replyMessage);
  if (!message || message.system) return;

  replyToMessageId = message.id;
  const author = userById(message.authorId);
  replyPreview.innerHTML = `
    <span>Replying to <strong>${escapeHtml(author?.username || "user")}</strong>: ${escapeHtml(message.body.slice(0, 80))}</span>
    <button type="button" data-clear-reply>Cancel</button>
  `;
  replyPreview.classList.remove("hidden");
  messageForm.elements.message.focus();
});

replyPreview.addEventListener("click", (event) => {
  if (event.target.closest("[data-clear-reply]")) clearReply();
});

postMentionSuggestions.addEventListener("mousedown", (event) => {
  const button = event.target.closest("[data-insert-mention]");
  if (!button) return;
  event.preventDefault();
  insertMention(postBody, postMentionSuggestions, button.dataset.insertMention);
});

chatMentionSuggestions.addEventListener("mousedown", (event) => {
  const button = event.target.closest("[data-insert-mention]");
  if (!button) return;
  event.preventDefault();
  insertMention(messageInput, chatMentionSuggestions, button.dataset.insertMention);
});

profileCard.addEventListener("submit", async (event) => {
  const form = event.target.closest("#profile-edit-form");
  if (!form) return;

  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  await api("/api/me", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  await refreshSocial();
});

messageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = messageInput.value.trim();
  if (!state.activeChatId || !message) return;
  messageStatus.textContent = "";

  try {
    await api(`/api/chats/${state.activeChatId}/messages`, {
      method: "POST",
      body: JSON.stringify({ body: message, replyTo: replyToMessageId }),
    });

    messageForm.reset();
    hideMentionSuggestions(chatMentionSuggestions);
    clearReply();
    await refreshChats();
  } catch (error) {
    messageStatus.textContent = error.message;
  }
});

async function bootstrap() {
  if (!token()) {
    render();
    return;
  }

  try {
    const result = await api("/api/me");
    state.currentUser = result.user;
    await refreshSocial();
    await refreshChats();
    connectLiveStream();
  } catch {
    setToken(null);
    closeLiveStream();
    state.currentUser = null;
    render();
  }
}

function connectLiveStream() {
  closeLiveStream();
  if (!token()) return;

  liveSource = new EventSource(`/api/live?token=${encodeURIComponent(token())}`);
  liveSource.addEventListener("ready", () => setLiveState(true));
  liveSource.addEventListener("open", () => setLiveState(true));
  liveSource.addEventListener("error", () => setLiveState(false));
  liveSource.addEventListener("social", () => scheduleRealtimeRefresh("social"));
  liveSource.addEventListener("chat", () => scheduleRealtimeRefresh("chat"));
}

function closeLiveStream() {
  if (liveSource) {
    liveSource.close();
    liveSource = null;
  }

  setLiveState(false);
}

function scheduleRealtimeRefresh(scope) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    try {
      if (scope === "chat") {
        await refreshSocial();
        await refreshChats();
      } else {
        await refreshSocial();
      }
    } catch {
      setLiveState(false);
    }
  }, 160);
}

async function refreshSocial() {
  const [usersResult, postsResult, meResult, notificationsResult] = await Promise.all([
    api("/api/users"),
    api("/api/posts"),
    api("/api/me"),
    api("/api/notifications"),
  ]);

  state.users = usersResult.users;
  state.posts = postsResult.posts;
  state.currentUser = meResult.user;
  state.notifications = notificationsResult.notifications;
  render();
}

async function refreshNotifications() {
  if (!state.currentUser) return;
  const result = await api("/api/notifications");
  state.notifications = result.notifications;
  renderNotifications();
  renderHeader();
}

async function refreshChats() {
  if (!state.currentUser) return;

  const result = await api("/api/chats");
  state.chats = result.chats;

  if (!state.chats.some((chat) => chat.id === state.activeChatId)) {
    state.activeChatId = null;
    localStorage.removeItem(ACTIVE_CHAT_KEY);
  }

  renderChats();
  renderMessages();
  renderHeader();
  renderProfile();
}

function render() {
  authScreen.classList.toggle("hidden", Boolean(state.currentUser));
  appShell.classList.toggle("hidden", !state.currentUser);

  if (!state.currentUser) return;

  renderHeader();
  renderStories();
  renderPosts();
  renderPeople();
  renderKarmaBoard();
  renderRightRail();
  renderChats();
  renderMessages();
  renderNotifications();
  renderProfile();
  showView(state.activeView || "feed", { preserveChat: true });
}

function showView(viewName, options = {}) {
  if (!document.querySelector(`#${viewName}-view`)) viewName = "feed";
  state.activeView = viewName;
  localStorage.setItem(ACTIVE_VIEW_KEY, viewName);
  if (viewName !== "chats" && !options.preserveChat) {
    state.activeChatId = null;
    localStorage.removeItem(ACTIVE_CHAT_KEY);
    chatLayout.classList.remove("thread-open");
  }
  document.querySelectorAll(".nav-link").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === viewName);
  });
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  document.querySelector(`#${viewName}-view`).classList.add("active");
}

function navigateToProfile(userId) {
  if (!userById(userId)) return;
  state.viewedProfileId = userId;
  profileTab = "posts";
  localStorage.setItem("closial-view-profile", userId);
  showView("profile");
  renderProfile();
}

function renderHeader() {
  const unreadNotifications = state.notifications.filter((item) => !item.read).length;
  const unreadMessages = state.chats.reduce((total, chat) => total + unreadChatCount(chat), 0);

  currentUserName.textContent = state.currentUser.fullName;
  currentUserName.dataset.profileId = state.currentUser.id;
  railUsername.textContent = `@${state.currentUser.username}`;
  railUsername.dataset.profileId = state.currentUser.id;
  composerAvatar.textContent = initials(state.currentUser.fullName);
  composerAvatar.dataset.profileId = state.currentUser.id;
  railAvatar.textContent = initials(state.currentUser.fullName);
  railAvatar.dataset.profileId = state.currentUser.id;
  currentKarma.textContent = `${state.currentUser.karma} karma - ${karmaRank(state.currentUser.karma)}`;

  document.querySelectorAll(".nav-link").forEach((button) => {
    const count =
      button.dataset.view === "notifications"
        ? unreadNotifications
        : button.dataset.view === "chats"
          ? unreadMessages
          : 0;
    button.dataset.badge = count ? String(count) : "";
    button.classList.toggle("has-badge", count > 0);
  });
}

function renderStories() {
  const storyUsers = [state.currentUser, ...state.users.filter((user) => user.id !== state.currentUser.id)];

  storiesList.innerHTML = storyUsers
    .map(
      (user) => `
        <button class="story-item profile-link" data-profile-id="${user.id}" type="button">
          <div class="story-ring"><div class="avatar">${initials(user.fullName)}</div></div>
          <span>${escapeHtml(user.username)}</span>
        </button>
      `,
    )
    .join("");
}

function renderPosts() {
  const posts = filteredPosts();

  if (!posts.length) {
    postsList.innerHTML = emptyState("No posts yet. Start the feed.");
    return;
  }

  postsList.innerHTML = posts
    .map((post) => {
      const author = post.author || userById(post.authorId);
      if (!author) return "";
      const liked = post.likes.includes(state.currentUser.id);
      const shared = post.shares.includes(state.currentUser.id);
      const saved = state.currentUser.savedPosts.includes(post.id);
      const previewComments = post.comments.slice(-3);
      const mine = post.authorId === state.currentUser.id;
      const tags = post.body.match(/#[a-z0-9_]+/gi) || [];

      return `
        <article class="post-card">
          <div class="post-head">
            <button class="identity profile-link" data-profile-id="${author.id}" type="button">
              <div class="avatar">${initials(author.fullName)}</div>
              <div>
                <strong>${escapeHtml(author.fullName)}</strong>
                <span>@${escapeHtml(author.username)} - ${karmaRank(author.karma)}</span>
              </div>
            </button>
            <div class="post-meta">${formatTime(post.createdAt)}</div>
          </div>
          ${
            post.imageData
              ? `<img class="post-image" src="${post.imageData}" alt="Post by ${escapeHtml(author.username)}" loading="lazy" />`
              : ""
          }
          <div class="post-body">${renderTextWithMentions(post.body)}</div>
          ${
            tags.length
              ? `<div class="post-tags">${tags
                  .slice(0, 4)
                  .map((tag) => `<span>${escapeHtml(tag.toLowerCase())}</span>`)
                  .join("")}</div>`
              : ""
          }
          <div class="post-stats">
            <strong>${post.likes.length} hearts</strong>
            <span>${post.comments.length} comments</span>
          </div>
          <div class="post-actions">
            <button class="chip-btn ${liked ? "active" : ""}" data-action="like" data-post-id="${post.id}" type="button">
              Heart ${post.likes.length}
            </button>
            <button class="chip-btn ${shared ? "active" : ""}" data-action="share" data-post-id="${post.id}" type="button">
              Repost ${post.shares.length}
            </button>
            <button class="chip-btn ${saved ? "active save-active" : ""}" data-action="save" data-post-id="${post.id}" type="button">
              ${saved ? "Saved" : "Save"}
            </button>
            ${
              mine
                ? ""
                : `<button class="chip-btn" data-action="report" data-post-id="${post.id}" type="button">Report</button>`
            }
            ${
              mine
                ? `<button class="chip-btn danger" data-action="delete" data-post-id="${post.id}" type="button">Delete</button>`
                : ""
            }
          </div>
          <div class="comments">
            ${previewComments
              .map((comment) => {
                const commenter = userById(comment.authorId);
                return `
                  <p><button class="inline-profile-link" data-profile-id="${commenter?.id || ""}" type="button">${escapeHtml(commenter?.username || "user")}</button> ${renderTextWithMentions(comment.body)}</p>
                `;
              })
              .join("")}
            <div class="comment-form">
              <input data-comment-input="${post.id}" type="text" maxlength="180" placeholder="Add a comment..." />
              <button class="text-action" data-action="comment" data-post-id="${post.id}" type="button">Post</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderKarmaBoard() {
  const ranked = state.users
    .slice()
    .sort((a, b) => b.karma - a.karma)
    .slice(0, 5);

  karmaBoard.innerHTML = ranked.length
    ? ranked
        .map(
          (user) => `
            <div class="karma-row">
              <button class="identity profile-link" data-profile-id="${user.id}" type="button">
                <div class="avatar">${initials(user.fullName)}</div>
                <div>
                  <strong>${escapeHtml(user.username)}</strong>
                  <span>${karmaRank(user.karma)}</span>
                </div>
              </button>
              <b>${user.karma}</b>
            </div>
          `,
        )
        .join("")
    : `<p class="profile-muted">No users yet.</p>`;
}

function renderRightRail() {
  if (!trendList || !suggestedList) return;

  const tags = new Map();
  state.posts.forEach((post) => {
    const foundTags = post.body.match(/#[a-z0-9_]+/gi) || [];
    foundTags.forEach((tag) => tags.set(tag.toLowerCase(), (tags.get(tag.toLowerCase()) || 0) + 1));
  });

  const trending = Array.from(tags.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  trendList.innerHTML = trending.length
    ? trending
        .map(
          ([tag, count]) => `
            <div class="trend-row">
              <span>${escapeHtml(tag)}</span>
              <strong>${count} ${count === 1 ? "post" : "posts"}</strong>
            </div>
          `,
        )
        .join("")
    : `
      <div class="trend-row">
        <span>#closebook</span>
        <strong>Start a trend</strong>
      </div>
    `;

  const suggestions = state.users
    .filter((user) => user.id !== state.currentUser.id && !state.currentUser.following.includes(user.id))
    .sort((a, b) => b.karma - a.karma)
    .slice(0, 4);

  suggestedList.innerHTML = suggestions.length
    ? suggestions
        .map(
          (user) => `
            <div class="suggested-row">
              <button class="identity profile-link" data-profile-id="${user.id}" type="button">
                <div class="avatar">${initials(user.fullName)}</div>
                <span><strong>${escapeHtml(user.fullName)}</strong><small>@${escapeHtml(user.username)}</small></span>
              </button>
              <button class="text-action" data-message-user="${user.id}" type="button">Message</button>
            </div>
          `,
        )
        .join("")
    : `<p class="profile-muted">You are connected with everyone here.</p>`;
}

function filteredPosts() {
  if (feedFilter === "following") {
    return state.posts.filter((post) => state.currentUser.following.includes(post.authorId));
  }

  if (feedFilter === "saved") {
    return state.posts.filter((post) => state.currentUser.savedPosts.includes(post.id));
  }

  return state.posts;
}

function renderPeople() {
  const others = state.users.filter((user) => {
    if (user.id === state.currentUser.id) return false;
    const haystack = `${user.fullName} ${user.username}`.toLowerCase();
    return !peopleQuery || haystack.includes(peopleQuery);
  });

  if (!others.length) {
    peopleList.innerHTML = emptyState("Register another user to exchange karma.");
    return;
  }

  peopleList.innerHTML = others
    .map((user) => {
      const currentVote = state.currentUser.votedUsers[user.id] || 0;
      const following = state.currentUser.following.includes(user.id);
      return `
        <article class="person-card">
          <div class="person-head">
            <button class="identity profile-link" data-profile-id="${user.id}" type="button">
              <div class="avatar">${initials(user.fullName)}</div>
              <div>
                <strong>${escapeHtml(user.fullName)}</strong>
                <span>@${escapeHtml(user.username)} - age ${user.age}</span>
              </div>
            </button>
            <div class="karma-title">${user.karma} - ${karmaRank(user.karma)}</div>
          </div>
          <div class="profile-muted">${user.followers.length} followers - following ${user.following.length}</div>
          <div class="person-actions">
            <button class="chip-btn ${following ? "active save-active" : ""}" data-follow-user="${user.id}" type="button">
              ${following ? "Following" : "Follow"}
            </button>
            <button class="chip-btn ${currentVote === 1 ? "active" : ""}" data-karma="1" data-user-id="${user.id}" type="button">
              + Karma
            </button>
            <button class="chip-btn danger ${currentVote === -1 ? "active" : ""}" data-karma="-1" data-user-id="${user.id}" type="button">
              - Karma
            </button>
            <button class="chip-btn" data-report-user="${user.id}" type="button">Report</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderChats() {
  if (!state.currentUser) return;
  chatLayout.classList.toggle("thread-open", Boolean(state.activeChatId));

  const others = state.users.filter((item) => item.id !== state.currentUser.id);
  chatMembers.innerHTML = others.length
    ? others
        .map(
          (member) => `
            <label>
              <input type="checkbox" value="${member.id}" />
              <span>${escapeHtml(member.fullName)} <small>@${escapeHtml(member.username)}</small></span>
            </label>
          `,
        )
        .join("")
    : `<p class="profile-muted">Register another user to create a group chat.</p>`;

  const matchingChats = state.chats
    .slice()
    .sort((a, b) => lastChatActivity(b) - lastChatActivity(a))
    .filter((chat) => chatMatchesQuery(chat, chatQuery));
  const matchingUsers = chatQuery
    ? others.filter((user) => `${user.fullName} ${user.username}`.toLowerCase().includes(chatQuery))
    : [];
  const chatResults = matchingChats
    .map((chat) => {
          const last = chat.messages.at(-1);
          const unread = unreadChatCount(chat);
          return `
            <button class="chat-item ${chat.id === state.activeChatId ? "active" : ""}" data-chat-id="${chat.id}" type="button">
              <span class="chat-avatar">${chat.direct ? initials(chatDisplayName(chat)) : "GC"}</span>
              <span>
                <strong>${escapeHtml(chatDisplayName(chat))} ${unread ? `<b class="unread-dot">${unread}</b>` : ""}</strong>
                <small>${last ? escapeHtml(last.system ? last.body : last.body) : `${chat.members.length} members`}</small>
              </span>
            </button>
          `;
        })
        .join("");
  const userResults = matchingUsers
    .filter((user) => !state.chats.some((chat) => chat.direct && chat.members.includes(user.id)))
    .map(
      (user) => `
        <button class="chat-item user-result" data-start-chat-user="${user.id}" type="button">
          <span class="chat-avatar">${initials(user.fullName)}</span>
          <span>
            <strong>${escapeHtml(user.fullName)}</strong>
            <small>@${escapeHtml(user.username)} - start direct message</small>
          </span>
        </button>
      `,
    )
    .join("");

  chatList.innerHTML =
    chatResults || userResults
      ? `${chatResults}${userResults ? `<div class="chat-result-label">People</div>${userResults}` : ""}`
      : emptyState(chatQuery ? "No chats or people match that search." : "No chats yet. Search for someone or create a group.");
}

function renderMessages() {
  const chat = activeChat();

  messageForm.classList.toggle("hidden", !chat);
  chatSettings.classList.toggle("hidden", !chat);

  if (!chat) {
    activeChatHeader.querySelector("span").textContent = "Select or create a chat";
    chatSettings.innerHTML = "";
    messagesList.innerHTML = emptyState("Messages will appear here.");
    return;
  }

  activeChatHeader.querySelector("span").textContent = chatDisplayName(chat);
  renderChatSettings(chat);
  messagesList.innerHTML = chat.messages.length
    ? chat.messages
        .map((message) => {
          const author = userById(message.authorId);
          const mine = message.authorId === state.currentUser.id;
          const replied = message.replyTo ? chat.messages.find((item) => item.id === message.replyTo) : null;
          const repliedAuthor = replied ? userById(replied.authorId) : null;
          const currentReaction = message.reactions?.[state.currentUser.id] || "";
          const reactionCounts = reactionSummary(message.reactions || {});
          if (message.system) {
            return `<div class="system-message">${escapeHtml(message.body)}</div>`;
          }
          return `
            <div class="message ${mine ? "mine" : ""}" id="message-${message.id}">
              ${
                replied
                  ? `<div class="reply-card">Reply to ${escapeHtml(repliedAuthor?.username || "user")}: ${renderTextWithMentions(replied.body.slice(0, 90))}</div>`
                  : ""
              }
              <strong><button class="inline-profile-link" data-profile-id="${author?.id || ""}" type="button">${escapeHtml(author?.fullName || "Unknown")}</button> - ${formatTime(message.createdAt)}</strong>
              <span class="message-body">${renderTextWithMentions(message.body)}</span>
              ${
                reactionCounts.length
                  ? `<div class="reaction-summary">${reactionCounts
                      .map(([name, count]) => `<span>${escapeHtml(name)} ${count}</span>`)
                      .join("")}</div>`
                  : ""
              }
              <div class="message-tools">
                <button class="reply-button" data-reply-message="${message.id}" type="button">Reply</button>
                <button class="reply-button" data-report-message="${message.id}" type="button">Report</button>
                <div class="reaction-picker">
                  ${MESSAGE_REACTIONS.map(
                    (reaction) =>
                      `<button class="${currentReaction === reaction ? "active" : ""}" data-message-reaction="${reaction}" data-message-id="${message.id}" type="button">${reaction}</button>`,
                  ).join("")}
                </div>
              </div>
            </div>
          `;
        })
        .join("")
    : emptyState("Start this conversation.");

  messagesList.scrollTop = messagesList.scrollHeight;
}

function renderNotifications() {
  if (!state.currentUser) return;

  notificationsList.innerHTML = state.notifications.length
    ? state.notifications
        .map(
          (notification) => `
            <article class="notification-card ${notification.read ? "" : "unread"} ${notification.type === "admin-strike" ? "admin-strike" : ""}">
              <button class="avatar profile-link" data-profile-id="${notification.actor?.id || ""}" type="button">${initials(notification.actor?.fullName || "C")}</button>
              <div>
                <button class="inline-profile-link" data-profile-id="${notification.actor?.id || ""}" type="button">${escapeHtml(notification.type === "admin-strike" ? "Closebook Admin" : notification.actor?.username || "Closebook")}</button>
                <p>${renderTextWithMentions(notification.text)}</p>
                <span>${formatTime(notification.createdAt)}</span>
              </div>
            </article>
          `,
        )
        .join("")
    : emptyState("No activity yet.");
}

function renderProfile() {
  if (!state.currentUser) return;

  const profileUser = userById(state.viewedProfileId) || state.currentUser;
  const isOwnProfile = profileUser.id === state.currentUser.id;
  const userPosts = state.posts.filter((post) => post.authorId === profileUser.id);
  const likes = state.posts.reduce(
    (count, post) => count + (post.authorId === profileUser.id ? post.likes.length : 0),
    0,
  );
  const chats = state.chats.filter((chat) => chat.members.includes(profileUser.id));
  const saved = state.posts.filter((post) => profileUser.savedPosts.includes(post.id));
  const likedPosts = state.posts.filter((post) => post.likes.includes(profileUser.id));
  const following = state.currentUser.following.includes(profileUser.id);
  const currentVote = state.currentUser.votedUsers[profileUser.id] || 0;
  const availableTabs = isOwnProfile ? ["posts", "saved", "liked"] : ["posts", "liked"];
  if (!availableTabs.includes(profileTab)) profileTab = "posts";
  const activeGridPosts = profileTab === "saved" ? saved : profileTab === "liked" ? likedPosts : userPosts;
  const gridPosts = activeGridPosts
    .map(
      (post) => `
        <button class="profile-grid-item" type="button" title="${escapeAttribute(post.body.slice(0, 80))}">
          ${
            post.imageData
              ? `<img src="${post.imageData}" alt="Profile post" />`
              : `<div class="text-tile">${escapeHtml(post.body)}</div>`
          }
        </button>
      `,
    )
    .join("");

  profileCard.innerHTML = `
    <div class="profile-cover">
      <span>${escapeHtml(karmaRank(profileUser.karma))}</span>
      <strong>${profileUser.karma} karma</strong>
    </div>
    <div class="profile-top">
      <div class="avatar">${initials(profileUser.fullName)}</div>
      <div>
        <h2>${escapeHtml(profileUser.fullName)}</h2>
        <p class="profile-muted">@${escapeHtml(profileUser.username)} - ${profileUser.age} years old - ${escapeHtml(profileUser.email)}</p>
        ${profileUser.bio ? `<p class="profile-bio">${escapeHtml(profileUser.bio)}</p>` : ""}
        ${profileUser.website ? `<p class="profile-muted">${escapeHtml(profileUser.website)}</p>` : ""}
      </div>
    </div>
    ${
      isOwnProfile
        ? `<form id="profile-edit-form" class="profile-edit">
            <input name="fullName" type="text" maxlength="70" value="${escapeAttribute(profileUser.fullName)}" required />
            <input name="website" type="text" maxlength="80" value="${escapeAttribute(profileUser.website || "")}" placeholder="Website or link" />
            <textarea name="bio" maxlength="140" placeholder="Write a short bio...">${escapeHtml(profileUser.bio || "")}</textarea>
            <button class="primary-action compact" type="submit">Save profile</button>
          </form>`
        : `<div class="profile-actions">
            <button class="chip-btn ${following ? "active save-active" : ""}" data-follow-user="${profileUser.id}" type="button">${following ? "Following" : "Follow"}</button>
            <button class="chip-btn" data-message-user="${profileUser.id}" type="button">Message</button>
            <button class="chip-btn ${currentVote === 1 ? "active" : ""}" data-karma="1" data-user-id="${profileUser.id}" type="button">+ Karma</button>
            <button class="chip-btn danger ${currentVote === -1 ? "active" : ""}" data-karma="-1" data-user-id="${profileUser.id}" type="button">- Karma</button>
            <button class="chip-btn" data-report-user="${profileUser.id}" type="button">Report</button>
          </div>`
    }
    <div class="karma-title">${profileUser.karma} karma - ${karmaRank(profileUser.karma)}</div>
    <div class="stat-grid">
      <div class="stat-box"><strong>${userPosts.length}</strong><span class="profile-muted">Posts</span></div>
      <div class="stat-box"><strong>${profileUser.followers.length}</strong><span class="profile-muted">Followers</span></div>
      <div class="stat-box"><strong>${profileUser.following.length}</strong><span class="profile-muted">Following</span></div>
      <div class="stat-box"><strong>${likes}</strong><span class="profile-muted">Likes received</span></div>
      <div class="stat-box"><strong>${isOwnProfile ? saved.length : profileUser.karma}</strong><span class="profile-muted">${isOwnProfile ? "Saved" : "Karma"}</span></div>
      <div class="stat-box"><strong>${chats.length}</strong><span class="profile-muted">Chats</span></div>
    </div>
    <div class="profile-tabs" aria-label="Profile post filters">
      ${availableTabs
        .map(
          (tab) => `
            <button class="${profileTab === tab ? "active" : ""}" data-profile-tab="${tab}" type="button">
              ${tab[0].toUpperCase()}${tab.slice(1)}
            </button>
          `,
        )
        .join("")}
    </div>
    <h3 class="profile-section-title">${profileSectionTitle(profileTab, profileUser, isOwnProfile)}</h3>
    <div class="profile-grid">${gridPosts || `<p class="profile-muted">Your post grid is empty.</p>`}</div>
  `;
}

async function startDirectMessage(userId) {
  const result = await api("/api/chats/direct", {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
  state.activeChatId = result.chat.id;
  localStorage.setItem(ACTIVE_CHAT_KEY, state.activeChatId);
  showView("chats");
  await refreshChats();
}

async function submitReport(targetType, targetId, title) {
  const reason = window.prompt(`${title}\nWhat is the main reason?`);
  if (!reason || !reason.trim()) return;

  const details = window.prompt("Add optional details for the admin team:") || "";
  await api("/api/reports", {
    method: "POST",
    body: JSON.stringify({
      targetType,
      targetId,
      reason: reason.trim(),
      details: details.trim(),
    }),
  });
  window.alert("Report sent to the admin team.");
}

function reactionSummary(reactions) {
  const counts = new Map();
  Object.values(reactions || {}).forEach((reaction) => counts.set(reaction, (counts.get(reaction) || 0) + 1));
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
}

function profileSectionTitle(tab, user, own) {
  if (tab === "saved") return "Saved posts";
  if (tab === "liked") return own ? "Posts you liked" : `${escapeHtml(user.username)} liked`;
  return own ? "Your posts" : `${escapeHtml(user.username)}'s posts`;
}

function unreadChatCount(chat) {
  const lastRead = chat.readBy?.[state.currentUser.id] || 0;
  return chat.messages.filter(
    (message) => message.authorId !== state.currentUser.id && message.createdAt > lastRead,
  ).length;
}

function activeChat() {
  return state.chats.find((item) => item.id === state.activeChatId);
}

function clearActiveChat() {
  state.activeChatId = null;
  localStorage.removeItem(ACTIVE_CHAT_KEY);
  chatLayout.classList.remove("thread-open");
  clearReply();
  renderChats();
  renderMessages();
}

function lastChatActivity(chat) {
  return chat.messages?.at(-1)?.createdAt || chat.createdAt || 0;
}

function chatDisplayName(chat) {
  if (!chat.direct) return chat.name;
  const otherId = chat.members.find((id) => id !== state.currentUser.id);
  const other = userById(otherId);
  return other ? other.fullName : chat.name;
}

function chatMatchesQuery(chat, query) {
  if (!query) return true;
  const memberNames = chat.members
    .map((id) => {
      const user = userById(id);
      return user ? `${user.fullName} ${user.username}` : "";
    })
    .join(" ");
  return `${chatDisplayName(chat)} ${memberNames}`.toLowerCase().includes(query);
}

function closeGroupCreator() {
  groupModal.classList.add("hidden");
  groupMessage.textContent = "";
}

function renderChatSettings(chat) {
  if (chat.direct) {
    const other = userById(chat.members.find((id) => id !== state.currentUser.id));
    chatSettings.innerHTML = `
      <div class="chat-profile-strip">
        <button class="identity profile-link" data-profile-id="${other?.id || ""}" type="button">
          <span class="chat-avatar">${initials(other?.fullName || "DM")}</span>
          <span><strong>${escapeHtml(other?.fullName || "Direct message")}</strong><small>@${escapeHtml(other?.username || "user")}</small></span>
        </button>
        <span class="chat-badge">Direct</span>
      </div>
    `;
    return;
  }

  const isAdmin = chat.creatorId === state.currentUser.id || chat.admins.includes(state.currentUser.id);
  const availableUsers = state.users.filter((user) => !chat.members.includes(user.id));
  chatSettings.innerHTML = `
    <details class="group-settings">
      <summary>
        <span>Group settings</span>
        <b>${chat.members.length} members - ${chat.admins.length} admins</b>
      </summary>
      ${
        isAdmin
          ? `<form data-rename-chat-form class="group-rename">
              <input name="name" value="${escapeAttribute(chat.name)}" maxlength="40" />
              <button class="chip-btn" type="submit">Rename</button>
            </form>
            <div class="group-add">
              <select data-add-member-select>
                <option value="">Add member...</option>
                ${availableUsers.map((user) => `<option value="${user.id}">${escapeHtml(user.fullName)} (@${escapeHtml(user.username)})</option>`).join("")}
              </select>
              <button class="chip-btn" data-chat-action="add-member" type="button">Add</button>
            </div>`
          : ""
      }
      <div class="member-list">
        ${chat.members
          .map((memberId) => {
            const member = userById(memberId);
            const memberIsCreator = chat.creatorId === memberId;
            const memberIsAdmin = chat.admins.includes(memberId) || memberIsCreator;
            const canManage = isAdmin && memberId !== state.currentUser.id && !memberIsCreator;
            return `
              <div class="member-row">
                <button class="identity profile-link" data-profile-id="${memberId}" type="button">
                  <span class="chat-avatar">${initials(member?.fullName || "U")}</span>
                  <span><strong>${escapeHtml(member?.fullName || "User")}</strong><small>${memberIsCreator ? "Creator" : memberIsAdmin ? "Admin" : "Member"}</small></span>
                </button>
                ${
                  canManage
                    ? `<div class="member-actions">
                        <button class="text-action" data-chat-action="${memberIsAdmin ? "remove-admin" : "make-admin"}" data-user-id="${memberId}" type="button">${memberIsAdmin ? "Remove admin" : "Make admin"}</button>
                        <button class="text-action danger-text" data-chat-action="remove-member" data-user-id="${memberId}" type="button">Remove</button>
                      </div>`
                    : ""
                }
              </div>
            `;
          })
          .join("")}
      </div>
    </details>
  `;
}

function clearReply() {
  replyToMessageId = "";
  replyPreview.innerHTML = "";
  replyPreview.classList.add("hidden");
}

function mentionablePostUsers() {
  return state.users.filter((user) => user.id !== state.currentUser?.id);
}

function mentionableChatUsers() {
  const chat = activeChat();
  if (!chat) return [];
  return chat.members
    .map((id) => userById(id))
    .filter((user) => user && user.id !== state.currentUser.id);
}

function currentMentionQuery(input) {
  const cursor = input.selectionStart ?? input.value.length;
  const beforeCursor = input.value.slice(0, cursor);
  const match = beforeCursor.match(/(^|\s)@([a-zA-Z0-9_]*)$/);
  if (!match) return null;

  return {
    query: match[2].toLowerCase(),
    start: cursor - match[2].length - 1,
    end: cursor,
  };
}

function renderMentionSuggestions(input, box, users) {
  const mention = currentMentionQuery(input);
  if (!mention) {
    hideMentionSuggestions(box);
    return;
  }

  const matches = users
    .filter((user) => `${user.username} ${user.fullName}`.toLowerCase().includes(mention.query))
    .slice(0, 6);

  if (!matches.length) {
    hideMentionSuggestions(box);
    return;
  }

  box.dataset.mentionStart = mention.start;
  box.dataset.mentionEnd = mention.end;
  box.innerHTML = matches
    .map(
      (user, index) => `
        <button class="${index === 0 ? "active" : ""}" data-insert-mention="${user.username}" type="button">
          <span class="avatar">${initials(user.fullName)}</span>
          <span><strong>@${escapeHtml(user.username)}</strong><small>${escapeHtml(user.fullName)}</small></span>
        </button>
      `,
    )
    .join("");
  box.classList.remove("hidden");
}

function hideMentionSuggestions(box) {
  box.innerHTML = "";
  box.classList.add("hidden");
  delete box.dataset.mentionStart;
  delete box.dataset.mentionEnd;
}

function handleMentionSuggestionKeys(event, input, box) {
  if (box.classList.contains("hidden")) return;
  const buttons = Array.from(box.querySelectorAll("[data-insert-mention]"));
  const activeIndex = buttons.findIndex((button) => button.classList.contains("active"));

  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const nextIndex =
      event.key === "ArrowDown"
        ? (activeIndex + 1) % buttons.length
        : (activeIndex - 1 + buttons.length) % buttons.length;
    buttons.forEach((button, index) => button.classList.toggle("active", index === nextIndex));
  }

  if (event.key === "Enter" || event.key === "Tab") {
    event.preventDefault();
    insertMention(input, box, buttons[Math.max(activeIndex, 0)]?.dataset.insertMention || "");
  }

  if (event.key === "Escape") hideMentionSuggestions(box);
}

function insertMention(input, box, username) {
  if (!username) return;
  const start = Number(box.dataset.mentionStart);
  const end = Number(box.dataset.mentionEnd);
  const prefix = input.value.slice(0, start);
  const suffix = input.value.slice(end);
  input.value = `${prefix}@${username} ${suffix}`;
  const cursor = prefix.length + username.length + 2;
  input.setSelectionRange(cursor, cursor);
  hideMentionSuggestions(box);
  input.dispatchEvent(new Event("input"));
  input.focus();
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function emptyState(text) {
  return `<div class="post-card"><p class="profile-muted">${text}</p></div>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderTextWithMentions(value) {
  return escapeHtml(value).replace(
    /(^|[^a-zA-Z0-9_])@([a-zA-Z0-9_]{2,30})/g,
    (match, prefix, username) => {
      const user = state.users.find((item) => item.username.toLowerCase() === username.toLowerCase());
      if (!user) return `${prefix}<span class="mention">@${username}</span>`;
      return `${prefix}<button class="mention mention-link" data-mention-user="${user.id}" type="button">@${escapeHtml(user.username)}</button>`;
    },
  );
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

bootstrap();
