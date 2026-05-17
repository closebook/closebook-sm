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
  previewPostId: null,
  typing: {},
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
const tagFilterBar = document.querySelector("#tag-filter-bar");
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
const postModal = document.querySelector("#post-modal");
const closePostModal = document.querySelector("#close-post-modal");
const postModalContent = document.querySelector("#post-modal-content");
const connectionsModal = document.querySelector("#connections-modal");
const connectionsModalContent = document.querySelector("#connections-modal-content");
const profileEditorModal = document.querySelector("#profile-editor-modal");
const profileEditorContent = document.querySelector("#profile-editor-content");
const closeProfileEditor = document.querySelector("#close-profile-editor");
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
const communitiesList = document.querySelector("#communities-list");
const markReadBtn = document.querySelector("#mark-read-btn");
const mobileMenuBtn = document.querySelector("#mobile-menu-btn");
const mobileMoreMenu = document.querySelector("#mobile-more-menu");
const chatBackBtn = document.querySelector("#chat-back-btn");
const chatInfoBtn = document.querySelector("#chat-info-btn");
const chatLayout = document.querySelector(".chat-layout");
const chatSettings = document.querySelector("#chat-settings");
const replyPreview = document.querySelector("#reply-preview");
const openMediaPicker = document.querySelector("#open-media-picker");
const mediaPicker = document.querySelector("#media-picker");
const voiceMessageBtn = document.querySelector("#voice-message-btn");
const typingIndicator = document.querySelector("#typing-indicator");

let selectedImageData = "";
let botPostImages = {};
let liveSource = null;
let refreshTimer = null;
let typingTimer = null;
let typingStopTimer = null;
let lastTypingSent = 0;
let mediaRecorder = null;
let voiceChunks = [];
let peopleQuery = "";
let feedFilter = "all";
let activeTag = "";
let replyToMessageId = "";
let profileTab = "posts";
let profileConnectionMode = "";
let chatQuery = "";
let chatInfoOpen = false;
const EMOJI_ITEMS = [
  ["😀", "grin happy smile"], ["😃", "happy smile"], ["😄", "laugh smile"], ["😁", "beam smile"], ["😆", "laugh"], ["😂", "tears laugh"], ["🤣", "rolling laugh"], ["😊", "blush happy"],
  ["😍", "love heart eyes"], ["😘", "kiss"], ["😎", "cool sunglasses"], ["🤩", "star eyes"], ["🥳", "party"], ["😭", "cry tears"], ["😤", "triumph"], ["😡", "angry"],
  ["😈", "devil savage"], ["💀", "dead skull"], ["🤡", "clown"], ["👀", "eyes"], ["🙌", "celebrate"], ["👏", "clap"], ["🙏", "pray"], ["💪", "strong flex"],
  ["👍", "thumbs up"], ["👎", "thumbs down"], ["🔥", "fire"], ["✨", "sparkle"], ["💯", "hundred"], ["❤️", "heart love"], ["💙", "blue heart"], ["💜", "purple heart"],
  ["🎉", "confetti"], ["🏆", "trophy"], ["👑", "crown"], ["⚡", "bolt"], ["🌟", "star"], ["🚀", "rocket"], ["📸", "camera"], ["🎧", "music"],
];
const GIF_ITEMS = ["Happy dance", "Mind blown", "Applause", "Mic drop", "Side eye", "No way", "Big laugh", "Victory", "Face palm", "Plot twist", "Respect", "Shock"];
const STICKER_ITEMS = ["Savage Mode", "Big W", "Certified Chaos", "Main Character", "GOD Tier", "Villain Arc", "Respect+", "Karma Blast", "Too Clean", "Final Boss", "Mood", "Legend"];
const MESSAGE_REACTIONS = ["👍", "❤️", "😂", "🔥"];

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
  const positiveRanks = [
    "Rookie Flame",
    "Street Saint",
    "Clutch Dealer",
    "Aura Holder",
    "Respect Magnet",
    "Crowd Favorite",
    "Elite Operator",
    "Certified Icon",
    "Main Character",
    "Untouchable",
    "Legacy Maker",
    "Crown Bearer",
    "Myth Walker",
    "Hall of Famer",
    "Reality Bender",
    "Heaven Sent",
    "Divine Menace",
    "Immortal Flex",
    "Final Boss Hero",
    "Cosmic Emperor",
    "GOD",
  ];
  const negativeRanks = [
    "Side Eye",
    "Walking L",
    "Drama Merchant",
    "Certified Menace",
    "Chaos Intern",
    "Ratio Magnet",
    "Public Problem",
    "Toxic Specialist",
    "Reputation Reaper",
    "Blacklist Energy",
    "Nightmare Fuel",
    "Disaster Artist",
    "Dark Influence",
    "Villain Arc",
    "Chaos Commander",
    "Abyss Regular",
    "Doom Dealer",
    "Evil CEO",
    "Final Boss Menace",
    "World Class Threat",
    "Villain",
  ];

  if (karma >= 50) return positiveRanks[Math.min(Math.floor(karma / 50) - 1, positiveRanks.length - 1)];
  if (karma <= -50) return negativeRanks[Math.min(Math.floor(Math.abs(karma) / 50) - 1, negativeRanks.length - 1)];
  return "Neutral";
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
    if (!button.dataset.view) return;
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
    mobileMoreMenu.classList.add("hidden");
  });
});

mobileMenuBtn.addEventListener("click", () => {
  mobileMoreMenu.classList.toggle("hidden");
});

mobileMoreMenu.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-view]");
  if (!button) return;
  mobileMoreMenu.classList.add("hidden");
  showView(button.dataset.view);
  if (button.dataset.view === "notifications") await refreshNotifications();
});

document.addEventListener("click", (event) => {
  const tagTrigger = event.target.closest("[data-tag-filter]");
  if (tagTrigger) {
    event.preventDefault();
    showTaggedPosts(tagTrigger.dataset.tagFilter);
    return;
  }

  const clearTagTrigger = event.target.closest("[data-clear-tag-filter]");
  if (clearTagTrigger) {
    event.preventDefault();
    clearTaggedPosts();
    return;
  }

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
    activeTag = "";
    document.querySelectorAll(".feed-tab").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    renderPosts();
    renderTagFilterBar();
  });
});

chatBackBtn.addEventListener("click", () => {
  clearActiveChat();
});

chatInfoBtn.addEventListener("click", () => {
  if (!activeChat()) return;
  chatInfoOpen = !chatInfoOpen;
  renderMessages();
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

closePostModal.addEventListener("click", closePostPreview);

postModal.addEventListener("click", async (event) => {
  if (event.target === postModal) {
    closePostPreview();
    return;
  }

  const button = event.target.closest("button[data-action]");
  if (!button) return;
  await handlePostAction(button, postModalContent);
  if (state.previewPostId) renderPostPreview(state.previewPostId);
});

peopleSearch.addEventListener("input", () => {
  peopleQuery = peopleSearch.value.trim().toLowerCase();
  renderPeople();
});

markReadBtn.addEventListener("click", async () => {
  await api("/api/notifications/read", { method: "POST" });
  await refreshNotifications();
});

communitiesList.addEventListener("click", async (event) => {
  const focusCreate = event.target.closest("[data-focus-create-community]");
  if (focusCreate) {
    const details = communitiesList.querySelector("[data-create-community-panel]");
    details?.setAttribute("open", "");
    communitiesList.querySelector("[data-create-community-name]")?.focus();
    return;
  }

  const featureButton = event.target.closest("button[data-bot-feature]");
  if (featureButton) {
    const bot = userById(featureButton.dataset.botId);
    if (!bot) return;
    await api(`/api/bots/${bot.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        fullName: bot.fullName,
        bio: bot.bio || "",
        ...bot.botFeatures,
        [featureButton.dataset.botFeature]: !(bot.botFeatures || {})[featureButton.dataset.botFeature],
      }),
    });
    await refreshSocial();
    return;
  }

  const viewButton = event.target.closest("[data-view]");
  if (viewButton) showView(viewButton.dataset.view);
});

profileCard.addEventListener("change", async (event) => {
  const input = event.target.closest("[data-bot-post-image]");
  if (!input) return;

  const botId = input.dataset.botId;
  const preview = profileCard.querySelector(`[data-bot-post-preview="${botId}"]`);
  botPostImages[botId] = "";
  if (preview) {
    preview.innerHTML = "";
    preview.classList.add("hidden");
  }

  const file = input.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    input.value = "";
    return;
  }
  if (file.size > 1_500_000) {
    input.value = "";
    if (preview) {
      preview.innerHTML = `<p class="form-note">Choose an image smaller than 1.5 MB.</p>`;
      preview.classList.remove("hidden");
    }
    return;
  }

  botPostImages[botId] = await fileToDataUrl(file);
  if (preview) {
    preview.innerHTML = `<img src="${botPostImages[botId]}" alt="Community post preview" />`;
    preview.classList.remove("hidden");
  }
});

communitiesList.addEventListener("submit", async (event) => {
  const createForm = event.target.closest("[data-create-bot-form]");
  const editForm = event.target.closest("[data-edit-bot-form]");
  if (!createForm && !editForm) return;

  event.preventDefault();
  const form = createForm || editForm;
  const message = form.querySelector("[data-form-message]");
  if (message) message.textContent = "";
  const data = Object.fromEntries(new FormData(form));

  try {
    if (createForm) {
      await api("/api/bots", {
        method: "POST",
        body: JSON.stringify(data),
      });
      form.reset();
    } else {
      await api(`/api/bots/${form.dataset.botId}`, {
        method: "PATCH",
        body: JSON.stringify({
          fullName: data.fullName,
          bio: data.bio,
          irisCore: data.irisCore === "on",
          autoWelcome: data.autoWelcome === "on",
          antiSpam: data.antiSpam === "on",
        }),
      });
    }
    await refreshSocial();
  } catch (error) {
    if (message) message.textContent = error.message;
  }
});

postBody.addEventListener("input", () => {
  postCount.textContent = `${postBody.value.length}/280`;
  renderMentionSuggestions(postBody, postMentionSuggestions, mentionablePostUsers());
});

postBody.addEventListener("keydown", (event) => {
  handleMentionSuggestionKeys(event, postBody, postMentionSuggestions);
});

messageInput.addEventListener("input", () => {
  autoResizeMessageInput();
  updateComposerMode();
  renderMentionSuggestions(messageInput, chatMentionSuggestions, mentionableChatUsers());
  sendTypingState(true);
  clearTimeout(typingStopTimer);
  typingStopTimer = setTimeout(() => sendTypingState(false), 1800);
});

messageInput.addEventListener("keydown", (event) => {
  handleMentionSuggestionKeys(event, messageInput, chatMentionSuggestions);
  if (event.defaultPrevented) return;

  if (event.key === "Enter" && !event.shiftKey && !isMobileInputDevice()) {
    event.preventDefault();
    messageForm.requestSubmit();
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    messageForm.requestSubmit();
  }
});

openMediaPicker.addEventListener("click", () => {
  renderMediaPicker();
  mediaPicker.classList.toggle("hidden");
});

mediaPicker.addEventListener("input", (event) => {
  if (event.target.matches("[data-media-search]")) renderMediaPicker(event.target.value);
});

mediaPicker.addEventListener("click", async (event) => {
  const emoji = event.target.closest("[data-insert-emoji]");
  if (emoji) {
    insertAtCursor(messageInput, emoji.dataset.insertEmoji);
    autoResizeMessageInput();
    messageInput.focus();
    return;
  }

  const gif = event.target.closest("[data-send-gif]");
  if (gif) {
    await sendChatMessage(`[gif:${gif.dataset.sendGif}]`, { type: "gif" });
    mediaPicker.classList.add("hidden");
    return;
  }

  const sticker = event.target.closest("[data-send-sticker]");
  if (sticker) {
    await sendChatMessage(`[sticker:${sticker.dataset.sendSticker}]`, { type: "sticker" });
    mediaPicker.classList.add("hidden");
  }
});

voiceMessageBtn.addEventListener("click", toggleVoiceRecording);

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

  await handlePostAction(button, postsList);
});

async function handlePostAction(button, root) {
  if (button.dataset.action === "report") {
    await submitReport("post", button.dataset.postId, "Report this post");
  } else if (button.dataset.action === "comment") {
    const input = root.querySelector(`input[data-comment-input="${button.dataset.postId}"]`);
    const body = input?.value.trim();
    if (!body) return;
    await api(`/api/posts/${button.dataset.postId}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
    input.value = "";
  } else if (button.dataset.action === "delete") {
    if (!window.confirm("Delete this post permanently?")) return;
    await api(`/api/posts/${button.dataset.postId}`, {
      method: "DELETE",
    });
  } else {
    await api(`/api/posts/${button.dataset.postId}/${button.dataset.action}`, {
      method: "POST",
    });
  }

  await refreshSocial();
}

peopleList.addEventListener("click", async (event) => {
  const modKarmaButton = event.target.closest("button[data-mod-karma]");
  if (modKarmaButton) {
    await adjustModeratorKarma(modKarmaButton.dataset.userId, Number(modKarmaButton.dataset.modKarma));
    return;
  }

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
  const editProfileButton = event.target.closest("button[data-edit-profile]");
  if (editProfileButton) {
    openProfileEditor(editProfileButton.dataset.editProfile);
    return;
  }

  const viewButton = event.target.closest("button[data-view]");
  if (viewButton) {
    showView(viewButton.dataset.view);
    return;
  }

  const connectionButton = event.target.closest("button[data-profile-list]");
  if (connectionButton) {
    openConnectionsModal(connectionButton.dataset.profileList);
    return;
  }

  const previewButton = event.target.closest("button[data-post-preview]");
  if (previewButton) {
    openPostPreview(previewButton.dataset.postPreview);
    return;
  }

  const tabButton = event.target.closest("button[data-profile-tab]");
  if (tabButton) {
    profileTab = tabButton.dataset.profileTab;
    renderProfile();
    return;
  }

  const modKarmaButton = event.target.closest("button[data-mod-karma]");
  if (modKarmaButton) {
    await adjustModeratorKarma(modKarmaButton.dataset.userId, Number(modKarmaButton.dataset.modKarma));
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

connectionsModal.addEventListener("click", async (event) => {
  if (event.target === connectionsModal || event.target.closest("[data-close-connections]")) {
    closeConnectionsModal();
    return;
  }

  const followButton = event.target.closest("button[data-follow-user]");
  if (followButton) {
    await api(`/api/users/${followButton.dataset.followUser}/follow`, { method: "POST" });
    await refreshSocial();
    renderOpenConnectionsModal();
    return;
  }

  const messageButton = event.target.closest("button[data-message-user]");
  if (messageButton) {
    closeConnectionsModal();
    await startDirectMessage(messageButton.dataset.messageUser);
  }
});

closeProfileEditor.addEventListener("click", closeProfileEditorModal);

profileEditorModal.addEventListener("click", (event) => {
  if (event.target === profileEditorModal) closeProfileEditorModal();
});

profileEditorContent.addEventListener("submit", async (event) => {
  const userForm = event.target.closest("[data-modal-user-edit-form]");
  const botForm = event.target.closest("[data-modal-bot-edit-form]");
  if (!userForm && !botForm) return;

  event.preventDefault();
  const data = Object.fromEntries(new FormData(userForm || botForm));

  if (userForm) {
    await api("/api/me", {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  } else {
    await api(`/api/bots/${botForm.dataset.botId}`, {
      method: "PATCH",
      body: JSON.stringify({
        fullName: data.fullName,
        bio: data.bio,
        irisCore: data.irisCore === "on",
        autoWelcome: data.autoWelcome === "on",
        antiSpam: data.antiSpam === "on",
      }),
    });
  }

  closeProfileEditorModal();
  await refreshSocial();
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
  chatInfoOpen = false;
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
  const botPostForm = event.target.closest("[data-bot-post-form]");
  if (botPostForm) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(botPostForm));
    const imageData = botPostImages[botPostForm.dataset.botId] || "";
    if (!String(data.body || "").trim() && !imageData) return;
    await api(`/api/bots/${botPostForm.dataset.botId}/posts`, {
      method: "POST",
      body: JSON.stringify({ body: data.body, imageData }),
    });
    botPostImages[botPostForm.dataset.botId] = "";
    botPostForm.reset();
    await refreshSocial();
    return;
  }

  const botEditForm = event.target.closest("[data-profile-bot-edit-form]");
  if (botEditForm) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(botEditForm));
    await api(`/api/bots/${botEditForm.dataset.botId}`, {
      method: "PATCH",
      body: JSON.stringify({
        fullName: data.fullName,
        bio: data.bio,
        irisCore: data.irisCore === "on",
        autoWelcome: data.autoWelcome === "on",
        antiSpam: data.antiSpam === "on",
      }),
    });
    await refreshSocial();
    return;
  }

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
  await sendChatMessage(message, { type: "text" });
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
  liveSource.addEventListener("typing", (event) => {
    try {
      handleTypingEvent(JSON.parse(event.data));
    } catch {
      // Ignore malformed realtime payloads.
    }
  });
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
  renderTagFilterBar();
  renderPosts();
  renderPeople();
  renderKarmaBoard();
  renderRightRail();
  renderChats();
  renderMessages();
  renderNotifications();
  renderCommunities();
  renderProfile();
  if (state.previewPostId) renderPostPreview(state.previewPostId);
  renderOpenConnectionsModal();
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
  profileConnectionMode = "";
  localStorage.setItem("closial-view-profile", userId);
  showView("profile");
  renderProfile();
}

function renderHeader() {
  const unreadNotifications = state.notifications.filter((item) => !item.read).length;
  const unreadMessages = state.chats.reduce((total, chat) => total + unreadChatCount(chat), 0);

  currentUserName.textContent = state.currentUser.fullName;
  currentUserName.dataset.profileId = state.currentUser.id;
  railUsername.innerHTML = `@${escapeHtml(state.currentUser.username)}${modBadge(state.currentUser)}`;
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
  mobileMenuBtn.dataset.badge = unreadNotifications ? String(unreadNotifications) : "";
  mobileMenuBtn.classList.toggle("has-badge", unreadNotifications > 0);
}

function renderStories() {
  const storyUsers = [state.currentUser, ...state.users.filter((user) => user.id !== state.currentUser.id)];

  storiesList.innerHTML = storyUsers
    .map(
      (user) => `
        <button class="story-item profile-link" data-profile-id="${user.id}" type="button">
          <div class="story-ring"><div class="avatar">${initials(user.fullName)}</div></div>
          <span>${escapeHtml(user.username)}${modBadge(user)}</span>
        </button>
      `,
    )
    .join("");
}

function renderTagFilterBar() {
  if (!tagFilterBar) return;

  if (!activeTag) {
    tagFilterBar.classList.add("hidden");
    tagFilterBar.innerHTML = "";
    return;
  }

  const count = state.posts.filter((post) => postHasTag(post, activeTag)).length;
  tagFilterBar.innerHTML = `
    <div>
      <span>Tagged posts</span>
      <strong>#${escapeHtml(activeTag)}</strong>
      <small>${count} ${count === 1 ? "post" : "posts"}</small>
    </div>
    <button class="chip-btn" data-clear-tag-filter type="button">Show all</button>
  `;
  tagFilterBar.classList.remove("hidden");
}

function renderPosts() {
  const posts = filteredPosts();

  if (!posts.length) {
    postsList.innerHTML = emptyState(activeTag ? `No posts found for #${activeTag}.` : "No posts yet. Start the feed.");
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
      const mine = canManagePost(post, author);
      const tags = extractTags(post.body);

      return `
        <article class="post-card">
          <div class="post-head">
            <button class="identity profile-link" data-profile-id="${author.id}" type="button">
              <div class="avatar">${initials(author.fullName)}</div>
              <div>
                <strong>${escapeHtml(author.fullName)}</strong>
                <span>@${escapeHtml(author.username)}${modBadge(author)} - ${karmaRank(author.karma)}</span>
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
                  .map((tag) => tagButton(tag))
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
                ? `<button class="chip-btn danger delete-post-btn" data-action="delete" data-post-id="${post.id}" type="button">Delete</button>`
                : ""
            }
          </div>
          <div class="comments">
            ${previewComments
              .map((comment) => {
                const commenter = userById(comment.authorId);
                return `
                  <p><button class="inline-profile-link" data-profile-id="${commenter?.id || ""}" type="button">${escapeHtml(commenter?.username || "user")}${modBadge(commenter)}</button> ${renderTextWithMentions(comment.body)}</p>
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
                  <strong>${escapeHtml(user.username)}${modBadge(user)}</strong>
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
    extractTags(post.body).forEach((tag) => tags.set(tag, (tags.get(tag) || 0) + 1));
  });

  const trending = Array.from(tags.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  trendList.innerHTML = trending.length
    ? trending
        .map(
          ([tag, count]) => `
            <div class="trend-row">
              ${tagButton(tag)}
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
                <span><strong>${escapeHtml(user.fullName)}</strong><small>@${escapeHtml(user.username)}${modBadge(user)}</small></span>
              </button>
              <button class="text-action" data-message-user="${user.id}" type="button">Message</button>
            </div>
          `,
        )
        .join("")
    : `<p class="profile-muted">You are connected with everyone here.</p>`;
}

function filteredPosts() {
  if (activeTag) {
    return state.posts.filter((post) => postHasTag(post, activeTag));
  }

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
      const cooldown = karmaCooldownRemaining(user.id);
      const cooldownLabel = cooldown ? formatCooldown(cooldown) : "";
      const following = state.currentUser.following.includes(user.id);
      return `
        <article class="person-card">
          <div class="person-head">
            <button class="identity profile-link" data-profile-id="${user.id}" type="button">
              <div class="avatar">${initials(user.fullName)}</div>
              <div>
                <strong>${escapeHtml(user.fullName)}</strong>
                <span>@${escapeHtml(user.username)}${modBadge(user)} - ${karmaRank(user.karma)}</span>
              </div>
            </button>
            <div class="karma-title">${user.karma} - ${karmaRank(user.karma)}</div>
          </div>
          <div class="profile-muted">${user.followers.length} followers - following ${user.following.length}</div>
          <div class="person-actions">
            <button class="chip-btn ${following ? "active save-active" : ""}" data-follow-user="${user.id}" type="button">
              ${following ? "Following" : "Follow"}
            </button>
            <button class="chip-btn ${currentVote === 1 && cooldown ? "active" : ""}" data-karma="1" data-user-id="${user.id}" type="button" ${cooldown ? "disabled" : ""}>
              + Karma
            </button>
            <button class="chip-btn danger ${currentVote === -1 && cooldown ? "active" : ""}" data-karma="-1" data-user-id="${user.id}" type="button" ${cooldown ? "disabled" : ""}>
              - Karma
            </button>
            <button class="chip-btn" data-report-user="${user.id}" type="button">Report</button>
          </div>
          ${cooldownLabel ? `<p class="karma-cooldown">Karma available again in ${cooldownLabel}</p>` : ""}
          ${state.currentUser.isModerator ? moderatorKarmaControls(user.id) : ""}
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
              <span>${escapeHtml(member.fullName)} <small>@${escapeHtml(member.username)}${modBadge(member)}${member.isBot ? " - bot" : ""}</small></span>
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
          const groupBot = chat.direct ? null : chat.members.map(userById).find((user) => user?.isBot && user.botFeatures?.irisCore);
          return `
            <button class="chat-item ${chat.id === state.activeChatId ? "active" : ""}" data-chat-id="${chat.id}" type="button">
              <span class="chat-avatar">${chat.direct ? initials(chatDisplayName(chat)) : groupBot ? initials(groupBot.fullName) : "GC"}</span>
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
            <small>@${escapeHtml(user.username)}${modBadge(user)} - start direct message</small>
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
  chatSettings.classList.toggle("hidden", !chat || !chatInfoOpen);
  chatInfoBtn.classList.toggle("hidden", !chat);
  chatInfoBtn.classList.toggle("active", Boolean(chat && chatInfoOpen));
  chatInfoBtn.setAttribute("aria-expanded", chat && chatInfoOpen ? "true" : "false");

  if (!chat) {
    activeChatHeader.querySelector("span").textContent = "Select or create a chat";
    chatSettings.innerHTML = "";
    messagesList.innerHTML = emptyState("Messages will appear here.");
    return;
  }

  activeChatHeader.querySelector("span").textContent = chatDisplayName(chat);
  renderChatSettings(chat);
  renderTypingIndicator(chat);
  messagesList.innerHTML = chat.messages.length
    ? chat.messages
        .map((message) => {
          const author = userById(message.authorId);
          const mine = message.authorId === state.currentUser.id;
          const replied = message.replyTo ? chat.messages.find((item) => item.id === message.replyTo) : null;
          const repliedAuthor = replied ? userById(replied.authorId) : null;
          const currentReaction = message.reactions?.[state.currentUser.id] || "";
          const reactionCounts = reactionSummary(message.reactions || {});
          const receipt = mine ? readReceiptText(chat, message) : "";
          if (message.system) {
            return `<div class="system-message">${escapeHtml(message.body)}</div>`;
          }
          return `
            <div class="message-stack ${mine ? "mine" : ""}">
              <div class="message ${mine ? "mine" : ""}" id="message-${message.id}">
                ${
                  replied
                    ? `<div class="reply-card">Reply to ${escapeHtml(repliedAuthor?.username || "user")}: ${renderTextWithMentions(replied.body.slice(0, 90))}</div>`
                    : ""
                }
                <strong><button class="inline-profile-link" data-profile-id="${author?.id || ""}" type="button">${escapeHtml(author?.fullName || "Unknown")}${modBadge(author)}</button> - ${formatTime(message.createdAt)}</strong>
                <span class="message-body">${renderMessageContent(message)}</span>
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
              ${receipt ? `<span class="read-receipt">${escapeHtml(receipt)}</span>` : ""}
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
                <button class="inline-profile-link" data-profile-id="${notification.actor?.id || ""}" type="button">${escapeHtml(notification.type === "admin-strike" ? "Closebook Admin" : notification.actor?.username || "Closebook")}${notification.type === "admin-strike" ? "" : modBadge(notification.actor)}</button>
                <p>${renderTextWithMentions(notification.text)}</p>
                <span>${formatTime(notification.createdAt)}</span>
              </div>
            </article>
          `,
        )
        .join("")
    : emptyState("No activity yet.");
}

function renderCommunities() {
  if (!communitiesList) return;
  const iris = state.users.find((user) => user.id === "user_iris_bot" || user.username === "irisbot");
  const ownedBots = state.users.filter((user) => user.isBot && user.botOwnerId === state.currentUser.id);
  const communityBots = state.users.filter((user) => user.isBot && user.botCommunity);
  const totalBotPosts = state.posts.filter((post) => userById(post.authorId)?.isBot).length;

  communitiesList.innerHTML = `
    <div class="community-hub-layout">
      <section class="community-main-column">
        <article class="community-card community-overview-card">
          <div class="community-section-head">
            <div>
              <span>Communities</span>
              <h3>Explore bot-powered communities</h3>
              <p>Community pages act like public bot profiles. Owners can post updates, enable Iris Core powers, and add their bots into group chats.</p>
            </div>
            <button class="primary-action compact" data-focus-create-community type="button">Create Community</button>
          </div>
          <div class="community-metrics">
            <div><strong>${communityBots.length}</strong><span>communities</span></div>
            <div><strong>${ownedBots.length}</strong><span>owned by you</span></div>
            <div><strong>${totalBotPosts}</strong><span>community posts</span></div>
          </div>
        </article>

        <article class="community-card iris-community-card">
          <div class="community-hero">
            <div class="avatar large">IB</div>
            <div>
              <span>Father of all bots</span>
              <h3>Iris Bot Community</h3>
              <p>Iris Core is the master command set that can power your own bots: rules, warnings, mutes, bans, slow mode, locks, welcome posts, and status checks.</p>
            </div>
          </div>
          <div class="community-feature-row">
            <span>Iris Core</span><span>Moderation</span><span>Rules</span><span>Welcome posts</span>
          </div>
          <div class="community-actions">
            <button class="chip-btn" data-profile-id="${iris?.id || "user_iris_bot"}" type="button">Open Iris Profile</button>
            <button class="chip-btn" data-view="chats" type="button">Go to Messages</button>
          </div>
        </article>

        <article class="community-card">
          <div class="community-section-head">
            <div>
              <span>Directory</span>
              <h3>Community list</h3>
            </div>
            <strong>${communityBots.length}</strong>
          </div>
          <div class="bot-directory">
            ${communityBots.map((bot) => botDirectoryCard(bot)).join("")}
          </div>
        </article>
      </section>

      <aside class="community-side-panel">
        <details class="community-card create-community-panel" data-create-community-panel>
          <summary>
            <span>Create</span>
            <strong>New community</strong>
          </summary>
          <form class="bot-create-form" data-create-bot-form>
            <input data-create-community-name name="fullName" type="text" maxlength="60" placeholder="Community name, e.g. Nova Guard" required />
            <input name="username" type="text" maxlength="24" placeholder="community_username" required />
            <textarea name="bio" maxlength="140" placeholder="Describe what this community/bot does..."></textarea>
            <button class="primary-action compact" type="submit">Create Community</button>
            <p class="form-note" data-form-message></p>
          </form>
        </details>

        <article class="community-card manage-community-panel">
          <div class="community-section-head">
            <div>
              <span>Manage</span>
              <h3>Your communities</h3>
            </div>
            <strong>${ownedBots.length}</strong>
          </div>
          <div class="bot-community-grid">
            ${
              ownedBots.length
                ? ownedBots.map((bot) => botCommunityManageCard(bot)).join("")
                : `<p class="profile-muted">Create a community, then activate Iris Core features here.</p>`
            }
          </div>
        </article>
      </aside>
    </div>
  `;
}

function botCommunityManageCard(bot) {
  const features = bot.botFeatures || {};
  return `
    <section class="bot-manage-card">
      <button class="identity profile-link" data-profile-id="${bot.id}" type="button">
        <div class="avatar">${initials(bot.fullName)}</div>
        <span>
          <strong>${escapeHtml(bot.fullName)}</strong>
          <small>@${escapeHtml(bot.username)} - ${features.irisCore ? "Iris Core active" : "Basic bot"}</small>
        </span>
      </button>
      <form data-edit-bot-form data-bot-id="${bot.id}" class="bot-manage-form">
        <input name="fullName" value="${escapeAttribute(bot.fullName)}" maxlength="60" />
        <textarea name="bio" maxlength="140">${escapeHtml(bot.bio || "")}</textarea>
        <details class="bot-feature-store" open>
          <summary>Activate bot features</summary>
          <div>
            <label><input name="irisCore" type="checkbox" ${features.irisCore ? "checked" : ""} /> Iris Core moderation</label>
            <label><input name="autoWelcome" type="checkbox" ${features.autoWelcome ? "checked" : ""} /> Welcome and rules posts</label>
            <label><input name="antiSpam" type="checkbox" ${features.antiSpam ? "checked" : ""} /> Anti-spam guard</label>
          </div>
        </details>
        <button class="chip-btn" type="submit">Save bot</button>
        <p class="form-note" data-form-message></p>
      </form>
    </section>
  `;
}

function botDirectoryCard(bot) {
  const owner = userById(bot.botOwnerId);
  const features = bot.botFeatures || {};
  const posts = state.posts.filter((post) => post.authorId === bot.id);
  const likes = posts.reduce((total, post) => total + post.likes.length, 0);
  return `
    <button class="bot-directory-card profile-link" data-profile-id="${bot.id}" type="button">
      <div class="avatar">${initials(bot.fullName)}</div>
      <span>
        <strong>${escapeHtml(bot.fullName)}</strong>
        <small>@${escapeHtml(bot.username)}${owner ? ` by @${escapeHtml(owner.username)}` : ""}</small>
        <small>${posts.length} posts - ${likes} hearts - ${bot.karma} karma</small>
      </span>
      <em>${features.irisCore ? "Iris Core" : "Community"}</em>
    </button>
  `;
}

function renderProfile() {
  if (!state.currentUser) return;

  const profileUser = userById(state.viewedProfileId) || state.currentUser;
  if (profileUser.isBot && profileUser.username === "irisbot") {
    profileCard.innerHTML = renderIrisCommunityProfile(profileUser);
    return;
  }
  const isOwnProfile = profileUser.id === state.currentUser.id;
  const canManageBot = profileUser.isBot && profileUser.botOwnerId === state.currentUser.id;
  const userPosts = state.posts.filter((post) => post.authorId === profileUser.id);
  const saved = state.posts.filter((post) => profileUser.savedPosts.includes(post.id));
  const likedPosts = state.posts.filter((post) => post.likes.includes(profileUser.id));
  const following = state.currentUser.following.includes(profileUser.id);
  const currentVote = state.currentUser.votedUsers[profileUser.id] || 0;
  const cooldown = isOwnProfile ? 0 : karmaCooldownRemaining(profileUser.id);
  const cooldownLabel = cooldown ? formatCooldown(cooldown) : "";
  const availableTabs = isOwnProfile ? ["posts", "saved", "liked"] : ["posts", "liked"];
  if (!availableTabs.includes(profileTab)) profileTab = "posts";
  const activeGridPosts = profileTab === "saved" ? saved : profileTab === "liked" ? likedPosts : userPosts;
  const gridPosts = activeGridPosts
    .map(
      (post) => `
        <button class="profile-grid-item" data-post-preview="${post.id}" type="button" title="${escapeAttribute(post.body.slice(0, 80))}">
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
        <p class="profile-muted">@${escapeHtml(profileUser.username)}${modBadge(profileUser)}${profileUser.isBot ? " - community bot" : ""} - ${escapeHtml(karmaRank(profileUser.karma))}</p>
        ${profileUser.bio ? `<p class="profile-bio">${escapeHtml(profileUser.bio)}</p>` : ""}
        ${profileUser.website ? `<p class="profile-muted">${escapeHtml(profileUser.website)}</p>` : ""}
      </div>
    </div>
    ${
      canManageBot
        ? `<div class="profile-actions clean-profile-actions">
            <button class="primary-action compact" data-edit-profile="${profileUser.id}" type="button">Edit profile</button>
            <button class="chip-btn" data-view="communities" type="button">Manage community</button>
            <button class="chip-btn" data-view="chats" type="button">Add to group</button>
          </div>
          <form data-bot-post-form data-bot-id="${profileUser.id}" class="bot-post-composer">
            <textarea name="body" maxlength="280" placeholder="Post as ${escapeAttribute(profileUser.fullName)}..."></textarea>
            <label class="media-upload-chip">
              <input data-bot-post-image data-bot-id="${profileUser.id}" type="file" accept="image/*" />
              Add photo
            </label>
            <div class="image-preview hidden" data-bot-post-preview="${profileUser.id}"></div>
            <button class="primary-action compact" type="submit">Publish as bot</button>
          </form>`
        : isOwnProfile
        ? `<div class="profile-actions clean-profile-actions">
            <button class="primary-action compact" data-edit-profile="${profileUser.id}" type="button">Edit profile</button>
          </div>`
        : profileUser.isBot
          ? `<div class="profile-actions">
              <button class="chip-btn" data-view="communities" type="button">Community</button>
              <button class="chip-btn" data-view="chats" type="button">Add to group</button>
              <button class="chip-btn" data-report-user="${profileUser.id}" type="button">Report</button>
            </div>`
        : `<div class="profile-actions">
            <button class="chip-btn ${following ? "active save-active" : ""}" data-follow-user="${profileUser.id}" type="button">${following ? "Following" : "Follow"}</button>
            <button class="chip-btn" data-message-user="${profileUser.id}" type="button">Message</button>
            <button class="chip-btn ${currentVote === 1 && cooldown ? "active" : ""}" data-karma="1" data-user-id="${profileUser.id}" type="button" ${cooldown ? "disabled" : ""}>+ Karma</button>
            <button class="chip-btn danger ${currentVote === -1 && cooldown ? "active" : ""}" data-karma="-1" data-user-id="${profileUser.id}" type="button" ${cooldown ? "disabled" : ""}>- Karma</button>
            <button class="chip-btn" data-report-user="${profileUser.id}" type="button">Report</button>
          </div>`
    }
    ${cooldownLabel ? `<p class="karma-cooldown">Karma available again in ${cooldownLabel}</p>` : ""}
    ${!isOwnProfile && state.currentUser.isModerator ? moderatorKarmaControls(profileUser.id) : ""}
    <div class="karma-title">${profileUser.karma} karma - ${karmaRank(profileUser.karma)}</div>
    <div class="stat-grid">
      <div class="stat-box"><strong>${userPosts.length}</strong><span class="profile-muted">Posts</span></div>
      <button class="stat-box clickable ${profileConnectionMode === "followers" ? "active" : ""}" data-profile-list="followers" type="button"><strong>${profileUser.followers.length}</strong><span class="profile-muted">Followers</span></button>
      <button class="stat-box clickable ${profileConnectionMode === "following" ? "active" : ""}" data-profile-list="following" type="button"><strong>${profileUser.following.length}</strong><span class="profile-muted">Following</span></button>
      <div class="stat-box"><strong>${profileUser.karma}</strong><span class="profile-muted">Karma</span></div>
      ${isOwnProfile ? `<div class="stat-box"><strong>${saved.length}</strong><span class="profile-muted">Saved</span></div>` : ""}
      ${canManageBot ? `<div class="stat-box"><strong>${profileUser.botFeatures?.irisCore ? "On" : "Off"}</strong><span class="profile-muted">Iris Core</span></div>` : ""}
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

function renderProfileConnections(profileUser, mode) {
  const ids = mode === "followers" ? profileUser.followers : profileUser.following;
  const people = ids.map((id) => userById(id)).filter(Boolean);
  const title = mode === "followers" ? "Followers" : "Following";

  if (!people.length) {
    return `
      <section class="connection-panel">
        <div class="connection-head">
          <div>
            <span>${escapeHtml(profileUser.username)}</span>
            <strong>${title}</strong>
          </div>
          <button class="icon-action ghost-icon" data-close-connections type="button" aria-label="Close ${title}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 4 14 14-2 2L4 6zm12 0 2 2L6 20l-2-2z"/></svg>
          </button>
        </div>
        <p class="profile-muted">No ${mode} yet.</p>
      </section>
    `;
  }

  return `
    <section class="connection-panel">
      <div class="connection-head">
        <div>
          <span>${escapeHtml(profileUser.username)}</span>
          <strong>${title}</strong>
        </div>
        <button class="icon-action ghost-icon" data-close-connections type="button" aria-label="Close ${title}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 4 14 14-2 2L4 6zm12 0 2 2L6 20l-2-2z"/></svg>
        </button>
      </div>
      <div class="connection-list">
        ${people
          .map((user) => {
            const isMe = user.id === state.currentUser.id;
            const amFollowing = state.currentUser.following.includes(user.id);
            return `
              <article class="connection-card">
                <button class="identity profile-link" data-profile-id="${user.id}" type="button">
                  <div class="avatar">${initials(user.fullName)}</div>
                  <span>
                    <strong>${escapeHtml(user.fullName)}${modBadge(user)}</strong>
                    <small>@${escapeHtml(user.username)} - ${escapeHtml(karmaRank(user.karma))}</small>
                  </span>
                </button>
                <div class="connection-meta">
                  <span>${user.karma} karma</span>
                  <span>${user.followers.length} followers</span>
                </div>
                ${
                  isMe
                    ? `<button class="chip-btn" data-profile-id="${user.id}" type="button">You</button>`
                    : `<div class="connection-actions">
                        <button class="chip-btn ${amFollowing ? "active save-active" : ""}" data-follow-user="${user.id}" type="button">${amFollowing ? "Following" : "Follow"}</button>
                        <button class="chip-btn" data-message-user="${user.id}" type="button">Message</button>
                      </div>`
                }
              </article>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderIrisCommunityProfile(iris) {
  const groupsWithIris = state.chats.filter((chat) => !chat.direct && chat.members.includes(iris.id));
  const canManageBot = iris.botOwnerId === state.currentUser.id;
  const irisPosts = state.posts.filter((post) => post.authorId === iris.id);
  const commandDocs = [
    ["/help", "Show every command Iris Core can use."],
    ["/status", "Check lock, slow mode, welcome, and rules status."],
    ["/rules", "Display the current group rules."],
    ["/set rules <rules>", "Save rules. Supports multiple lines."],
    ["/welcome <message>", "Set the new-member welcome message."],
    ["/welcome off", "Disable the welcome message."],
    ["/lock", "Pause member messages."],
    ["/unlock", "Resume member messages."],
    ["/slowmode <seconds|off>", "Limit how often non-admins can speak."],
    ["/warn @user", "Warn a member. Three warnings kicks them."],
    ["/warnings @user", "Show a member's warning count."],
    ["/clear warnings @user", "Reset one member's warnings."],
    ["/clear all warnings", "Reset warnings for everyone."],
    ["/mute @user <minutes>", "Mute a member temporarily."],
    ["/kick @user", "Remove a member from the group."],
    ["/ban @user", "Ban and remove a member."],
    ["/unban @user", "Allow a banned member back."],
    ["/purge <1-50>", "Remove recent member messages."],
  ];
  const docs = [
    {
      title: "Pinned setup guide",
      body: "Add Iris Bot from group settings, then make Iris an admin. After that, moderation commands, rules, welcome messages, locks, slow mode, warnings, mutes, kicks, and bans become available for group admins.",
      tags: ["#iris", "#setup", "#groups"],
      stats: "Pinned guide",
    },
    {
      title: "Command handbook",
      commands: commandDocs,
      tags: ["#commands", "#moderation"],
      stats: "Command docs",
    },
    {
      title: "Safety notes",
      body: "Iris respects group ownership. The bot will not moderate the group creator, itself, or active admins. Remove an admin role first if that person should become manageable by bot commands.",
      tags: ["#safety", "#admins"],
      stats: "Admin note",
    },
    {
      title: "Rules and welcome post",
      body: "Use /set rules followed by your full rules text. When new members join, Iris posts the saved rules and welcome message so everyone sees the group expectations immediately.",
      tags: ["#rules", "#welcome"],
      stats: "Group onboarding",
    },
  ];
  const irisPostGrid = irisPosts
    .map(
      (post) => `
        <button class="profile-grid-item" data-post-preview="${post.id}" type="button" title="${escapeAttribute(post.body.slice(0, 80))}">
          ${
            post.imageData
              ? `<img src="${post.imageData}" alt="Iris post" />`
              : `<div class="text-tile">${escapeHtml(post.body)}</div>`
          }
        </button>
      `,
    )
    .join("");

  return `
    <div class="profile-cover iris-profile-cover">
      <span>Closebook Community Bot</span>
      <strong>${groupsWithIris.length} active groups</strong>
    </div>
    <div class="profile-top iris-profile-top">
      <div class="avatar">IB</div>
      <div>
        <h2>${escapeHtml(iris.fullName || "Iris Bot")}</h2>
        <p class="profile-muted">@${escapeHtml(iris.username)} - bot - ${escapeHtml(karmaRank(iris.karma))}</p>
        <p class="profile-bio">Iris publishes moderation guides here like posts and helps group admins manage rules, warnings, mutes, bans, locks, slow mode, and welcome messages.</p>
      </div>
    </div>
    <div class="profile-actions">
      ${canManageBot ? `<button class="primary-action compact" data-edit-profile="${iris.id}" type="button">Edit profile</button>` : ""}
      <button class="chip-btn" data-view="communities" type="button">Community Hub</button>
      <button class="chip-btn" data-view="chats" type="button">Add Iris in Messages</button>
    </div>
    ${
      canManageBot
        ? `<form data-bot-post-form data-bot-id="${iris.id}" class="bot-post-composer">
            <textarea name="body" maxlength="280" placeholder="Post as ${escapeAttribute(iris.fullName || "Iris Bot")}..."></textarea>
            <label class="media-upload-chip">
              <input data-bot-post-image data-bot-id="${iris.id}" type="file" accept="image/*" />
              Add photo
            </label>
            <div class="image-preview hidden" data-bot-post-preview="${iris.id}"></div>
            <button class="primary-action compact" type="submit">Publish as Iris</button>
          </form>`
        : ""
    }
    <div class="stat-grid iris-stat-grid">
      <div class="stat-box"><strong>${docs.length + irisPosts.length}</strong><span class="profile-muted">Posts</span></div>
      <div class="stat-box"><strong>${groupsWithIris.length}</strong><span class="profile-muted">Active groups</span></div>
      <div class="stat-box"><strong>${commandDocs.length}</strong><span class="profile-muted">Commands</span></div>
      <div class="stat-box"><strong>${iris.karma}</strong><span class="profile-muted">Karma</span></div>
      ${canManageBot ? `<div class="stat-box"><strong>Owner</strong><span class="profile-muted">Managed by you</span></div>` : ""}
    </div>
    ${
      irisPosts.length
        ? `<h3 class="profile-section-title">Iris feed posts</h3><div class="profile-grid iris-owned-post-grid">${irisPostGrid}</div>`
        : ""
    }
    <h3 class="profile-section-title">Iris posts</h3>
    <div class="iris-doc-posts">
      ${docs
        .map(
          (doc, index) => `
            <article class="post-card iris-doc-post">
              <div class="post-head">
                <button class="identity profile-link" data-profile-id="${iris.id}" type="button">
                  <div class="avatar">IB</div>
                  <div>
                    <strong>${escapeHtml(iris.fullName || "Iris Bot")}</strong>
                    <span>@${escapeHtml(iris.username)} - ${escapeHtml(doc.stats)}</span>
                  </div>
                </button>
                <div class="post-meta">${index === 0 ? "Pinned" : "Guide"}</div>
              </div>
              <div class="post-body">
                <h3>${escapeHtml(doc.title)}</h3>
                ${
                  doc.commands
                    ? `<div class="iris-command-list">${doc.commands
                        .map(([command, text]) => `<div><code>${escapeHtml(command)}</code><span>${escapeHtml(text)}</span></div>`)
                        .join("")}</div>`
                    : `<p>${escapeHtml(doc.body)}</p>`
                }
              </div>
              <div class="post-tags">
                ${doc.tags.map((tag) => tagButton(tag.slice(1))).join("")}
              </div>
              <div class="post-stats">
                <strong>${index === 0 ? "Featured" : "Docs"}</strong>
                <span>${doc.tags.length} tags</span>
                <span>Useful for group admins</span>
              </div>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function openConnectionsModal(mode) {
  profileConnectionMode = mode;
  connectionsModal.classList.remove("hidden");
  renderOpenConnectionsModal();
}

function closeConnectionsModal() {
  profileConnectionMode = "";
  connectionsModalContent.innerHTML = "";
  connectionsModal.classList.add("hidden");
  renderProfile();
}

function renderOpenConnectionsModal() {
  if (!profileConnectionMode || connectionsModal.classList.contains("hidden")) return;
  const profileUser = userById(state.viewedProfileId) || state.currentUser;
  connectionsModalContent.innerHTML = renderProfileConnections(profileUser, profileConnectionMode);
}

function openProfileEditor(userId) {
  const profileUser = userById(userId) || state.currentUser;
  if (!profileUser) return;
  const canEditUser = profileUser.id === state.currentUser.id;
  const canEditBot = profileUser.isBot && profileUser.botOwnerId === state.currentUser.id;
  if (!canEditUser && !canEditBot) return;

  profileEditorContent.innerHTML = canEditBot ? renderBotProfileEditor(profileUser) : renderUserProfileEditor(profileUser);
  profileEditorModal.classList.remove("hidden");
  profileEditorContent.querySelector("input, textarea, button")?.focus();
}

function closeProfileEditorModal() {
  profileEditorContent.innerHTML = "";
  profileEditorModal.classList.add("hidden");
}

function renderUserProfileEditor(user) {
  return `
    <form class="profile-edit modal-profile-edit" data-modal-user-edit-form>
      <label>
        <span>Full name</span>
        <input name="fullName" type="text" maxlength="70" value="${escapeAttribute(user.fullName)}" required />
      </label>
      <label>
        <span>Website</span>
        <input name="website" type="text" maxlength="80" value="${escapeAttribute(user.website || "")}" placeholder="Website or link" />
      </label>
      <label>
        <span>Bio</span>
        <textarea name="bio" maxlength="140" placeholder="Write a short bio...">${escapeHtml(user.bio || "")}</textarea>
      </label>
      <button class="primary-action compact" type="submit">Save profile</button>
    </form>
  `;
}

function renderBotProfileEditor(bot) {
  const features = bot.botFeatures || {};
  return `
    <form class="profile-edit modal-profile-edit bot-profile-editor" data-modal-bot-edit-form data-bot-id="${bot.id}">
      <label>
        <span>Community name</span>
        <input name="fullName" type="text" maxlength="60" value="${escapeAttribute(bot.fullName)}" required />
      </label>
      <label>
        <span>Description</span>
        <textarea name="bio" maxlength="140" placeholder="Write bot bio...">${escapeHtml(bot.bio || "")}</textarea>
      </label>
      <section class="bot-feature-store" aria-label="Bot feature activation">
        <strong>Activate bot features</strong>
        <div>
          <label><input name="irisCore" type="checkbox" ${features.irisCore ? "checked" : ""} /> Iris Core moderation</label>
          <label><input name="autoWelcome" type="checkbox" ${features.autoWelcome ? "checked" : ""} /> Welcome and rules posts</label>
          <label><input name="antiSpam" type="checkbox" ${features.antiSpam ? "checked" : ""} /> Anti-spam guard</label>
        </div>
      </section>
      <button class="primary-action compact" type="submit">Save community</button>
    </form>
  `;
}

function openPostPreview(postId) {
  state.previewPostId = postId;
  renderPostPreview(postId);
  postModal.classList.remove("hidden");
}

function closePostPreview() {
  state.previewPostId = null;
  postModalContent.innerHTML = "";
  postModal.classList.add("hidden");
}

function renderPostPreview(postId) {
  const post = state.posts.find((item) => item.id === postId);
  if (!post) {
    closePostPreview();
    return;
  }

  const author = post.author || userById(post.authorId);
  const liked = post.likes.includes(state.currentUser.id);
  const shared = post.shares.includes(state.currentUser.id);
  const saved = state.currentUser.savedPosts.includes(post.id);
  const mine = canManagePost(post, author);
  const tags = extractTags(post.body);

  postModalContent.innerHTML = `
    <article class="post-card post-preview-card">
      <div class="post-head">
        <button class="identity profile-link" data-profile-id="${author?.id || ""}" type="button">
          <div class="avatar">${initials(author?.fullName || "U")}</div>
          <div>
            <strong>${escapeHtml(author?.fullName || "Unknown")}</strong>
            <span>@${escapeHtml(author?.username || "user")}${modBadge(author)} - ${escapeHtml(karmaRank(author?.karma || 0))}</span>
          </div>
        </button>
        <div class="post-meta">${formatTime(post.createdAt)}</div>
      </div>
      ${post.imageData ? `<img class="post-image" src="${post.imageData}" alt="Post by ${escapeHtml(author?.username || "user")}" />` : ""}
      <div class="post-body">${renderTextWithMentions(post.body)}</div>
      ${
        tags.length
          ? `<div class="post-tags">${tags
              .slice(0, 6)
              .map((tag) => tagButton(tag))
              .join("")}</div>`
          : ""
      }
      <div class="post-stats">
        <strong>${post.likes.length} hearts</strong>
        <span>${post.shares.length} reposts</span>
        <span>${post.comments.length} comments</span>
      </div>
      <div class="post-actions">
        <button class="chip-btn ${liked ? "active" : ""}" data-action="like" data-post-id="${post.id}" type="button">Heart ${post.likes.length}</button>
        <button class="chip-btn ${shared ? "active" : ""}" data-action="share" data-post-id="${post.id}" type="button">Repost ${post.shares.length}</button>
        <button class="chip-btn ${saved ? "active save-active" : ""}" data-action="save" data-post-id="${post.id}" type="button">${saved ? "Saved" : "Save"}</button>
        ${mine ? `<button class="chip-btn danger delete-post-btn" data-action="delete" data-post-id="${post.id}" type="button">Delete</button>` : `<button class="chip-btn" data-action="report" data-post-id="${post.id}" type="button">Report</button>`}
      </div>
      <div class="comments post-preview-comments">
        ${post.comments
          .map((comment) => {
            const commenter = userById(comment.authorId);
            return `<p><button class="inline-profile-link" data-profile-id="${commenter?.id || ""}" type="button">${escapeHtml(commenter?.username || "user")}${modBadge(commenter)}</button> ${renderTextWithMentions(comment.body)}</p>`;
          })
          .join("") || `<p class="profile-muted">No comments yet.</p>`}
        <div class="comment-form">
          <input data-comment-input="${post.id}" type="text" maxlength="180" placeholder="Add a comment..." />
          <button class="text-action" data-action="comment" data-post-id="${post.id}" type="button">Post</button>
        </div>
      </div>
    </article>
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

async function adjustModeratorKarma(userId, direction) {
  const rawAmount = window.prompt("Moderator karma adjustment amount (1 to 10):", "10");
  if (rawAmount === null) return;

  const amount = Number(rawAmount);
  if (!Number.isInteger(amount) || amount < 1 || amount > 10) {
    window.alert("Enter a whole number from 1 to 10.");
    return;
  }

  await api(`/api/users/${userId}/karma/moderate`, {
    method: "POST",
    body: JSON.stringify({ amount: amount * direction }),
  });
  await refreshSocial();
}

function moderatorKarmaControls(userId) {
  return `
    <div class="mod-karma-tools">
      <span>Moderator karma</span>
      <button class="chip-btn" data-mod-karma="1" data-user-id="${userId}" type="button">+ up to 10</button>
      <button class="chip-btn danger" data-mod-karma="-1" data-user-id="${userId}" type="button">- up to 10</button>
    </div>
  `;
}

function karmaCooldownRemaining(userId) {
  if (state.currentUser?.isModerator) return 0;
  const lastVoteAt = Number(state.currentUser?.karmaVoteTimes?.[userId] || 0);
  if (!lastVoteAt) return 0;
  return Math.max(0, lastVoteAt + 24 * 60 * 60 * 1000 - Date.now());
}

function formatCooldown(ms) {
  const totalMinutes = Math.max(1, Math.ceil(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes}m`;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function reactionSummary(reactions) {
  const counts = new Map();
  Object.values(reactions || {}).forEach((reaction) => counts.set(reaction, (counts.get(reaction) || 0) + 1));
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
}

function showTaggedPosts(tag) {
  const normalized = normalizeTag(tag);
  if (!normalized) return;

  activeTag = normalized;
  feedFilter = "all";
  document.querySelectorAll(".feed-tab").forEach((item) => {
    item.classList.toggle("active", item.dataset.feedFilter === "all");
  });
  closePostPreview();
  showView("feed");
  renderTagFilterBar();
  renderPosts();
}

function clearTaggedPosts() {
  activeTag = "";
  renderTagFilterBar();
  renderPosts();
}

function profileSectionTitle(tab, user, own) {
  if (tab === "saved") return "Saved posts";
  if (tab === "liked") return own ? "Posts you liked" : `${escapeHtml(user.username)} liked`;
  return own ? "Your posts" : `${escapeHtml(user.username)}'s posts`;
}

function canManagePost(post, author = userById(post.authorId)) {
  return post.authorId === state.currentUser.id || (author?.isBot && author.botOwnerId === state.currentUser.id);
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
  chatInfoOpen = false;
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
      <section class="chat-info-card direct-info">
        <button class="identity profile-link" data-profile-id="${other?.id || ""}" type="button">
          <span class="chat-avatar">${initials(other?.fullName || "DM")}</span>
          <span><strong>${escapeHtml(other?.fullName || "Direct message")}${modBadge(other)}</strong><small>@${escapeHtml(other?.username || "user")}</small></span>
        </button>
        <div class="settings-pill-row">
          <span class="chat-badge">Direct</span>
          <span class="chat-badge">${chat.messages.length} messages</span>
        </div>
      </section>
    `;
    return;
  }

  const isAdmin = chat.creatorId === state.currentUser.id || chat.admins.includes(state.currentUser.id);
  const availableUsers = state.users.filter((user) => !chat.members.includes(user.id));
  const coreBots = chat.members.map(userById).filter((user) => user?.isBot && user.botFeatures?.irisCore);
  const activeBots = coreBots.filter((bot) => chat.admins.includes(bot.id));
  const featuredBot = activeBots[0] || coreBots[0] || state.users.find((user) => user.id === "user_iris_bot");
  chatSettings.innerHTML = `
    <section class="group-settings compact-settings">
      <div class="settings-head">
        <div>
          <span>Group info</span>
          <strong>${escapeHtml(chat.name)}</strong>
        </div>
        <div class="settings-pill-row">
          <span class="chat-badge">${chat.members.length} members</span>
          <span class="chat-badge">${chat.admins.length} admins</span>
          <span class="chat-badge">${activeBots.length ? `${escapeHtml(activeBots[0].fullName)} active` : coreBots.length ? "Bot needs admin" : "Iris Core off"}</span>
        </div>
      </div>
      <div class="bot-status ${activeBots.length ? "active" : ""}">
        <strong>${escapeHtml(featuredBot?.fullName || "Iris Core")}</strong>
        <span>${activeBots.length ? "Moderation commands are active." : coreBots.length ? "Make this bot an admin to enable commands." : "Add Iris Bot or your own Iris Core bot, then make it admin."}</span>
      </div>
      <div class="rules-card">
        <strong>Group rules</strong>
        <p>${chat.moderation?.rules ? renderTextWithMentions(chat.moderation.rules) : "No rules set. Admins can type /set rules <rules>."}</p>
      </div>
      ${
        isAdmin
          ? `<form data-rename-chat-form class="group-rename">
              <input name="name" value="${escapeAttribute(chat.name)}" maxlength="40" />
              <button class="chip-btn" type="submit">Rename</button>
            </form>
            <details class="add-members-box">
              <summary type="button">Add members</summary>
              <div class="group-add">
                <select data-add-member-select>
                  <option value="">Choose a user or bot...</option>
                  ${availableUsers
                    .map(
                      (user) =>
                        `<option value="${user.id}">${escapeHtml(user.fullName)} (@${escapeHtml(user.username)})${user.isModerator ? " - MOD" : ""}${user.isBot ? " - Bot" : ""}</option>`,
                    )
                    .join("")}
                </select>
                <button class="chip-btn" data-chat-action="add-member" type="button">Add to group</button>
              </div>
              <p class="profile-muted">Bots are added manually like users. Any bot with Iris Core moderates after an admin makes it admin.</p>
            </details>
            <div class="command-card">
              <strong>Bot commands</strong>
              <span>/help</span><span>/status</span><span>/set rules</span><span>/welcome</span><span>/lock</span><span>/unlock</span><span>/slowmode 30</span><span>/purge 10</span><span>/ban @user</span><span>/unban @user</span><span>/kick @user</span><span>/mute @user 10</span><span>/warn @user</span><span>/clear warnings</span>
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
                  <span><strong>${escapeHtml(member?.fullName || "User")}${modBadge(member)}</strong><small>@${escapeHtml(member?.username || "user")} - ${member?.isBot ? "Bot" : memberIsCreator ? "Creator" : memberIsAdmin ? "Admin" : "Member"}</small></span>
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
    </section>
  `;
}

function clearReply() {
  replyToMessageId = "";
  replyPreview.innerHTML = "";
  replyPreview.classList.add("hidden");
}

function renderMediaPicker(query = "") {
  const q = query.trim().toLowerCase();
  const emojis = EMOJI_ITEMS.filter(([emoji, label]) => !q || label.includes(q) || emoji.includes(q));
  const gifs = GIF_ITEMS.filter((item) => !q || item.toLowerCase().includes(q));
  const stickers = STICKER_ITEMS.filter((item) => !q || item.toLowerCase().includes(q));

  mediaPicker.innerHTML = `
    <input class="media-search" data-media-search type="search" value="${escapeAttribute(query)}" placeholder="Search emoji, GIFs, stickers..." />
    <div class="media-picker-section">
      <strong>Emoji</strong>
      <div class="media-grid emoji-grid">
        ${emojis.map(([emoji, label]) => `<button title="${escapeAttribute(label)}" data-insert-emoji="${escapeAttribute(emoji)}" type="button">${escapeHtml(emoji)}</button>`).join("") || `<span class="media-empty">No emoji found</span>`}
      </div>
    </div>
    <div class="media-picker-section">
      <strong>GIFs</strong>
      <div class="media-grid text-grid">
        ${gifs.map((item) => `<button data-send-gif="${escapeAttribute(item)}" type="button">${escapeHtml(item)}</button>`).join("") || `<span class="media-empty">No GIFs found</span>`}
      </div>
    </div>
    <div class="media-picker-section">
      <strong>Stickers</strong>
      <div class="media-grid text-grid">
        ${stickers.map((item) => `<button data-send-sticker="${escapeAttribute(item)}" type="button">${escapeHtml(item)}</button>`).join("") || `<span class="media-empty">No stickers found</span>`}
      </div>
    </div>
  `;
  mediaPicker.querySelector("[data-media-search]")?.focus();
}

async function sendChatMessage(body, options = {}) {
  if (!state.activeChatId || (!body && options.type !== "voice")) return;
  messageStatus.textContent = "";

  try {
    await api(`/api/chats/${state.activeChatId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        body,
        type: options.type || "text",
        mediaData: options.mediaData || "",
        replyTo: replyToMessageId,
      }),
    });

    messageForm.reset();
    autoResizeMessageInput();
    updateComposerMode();
    hideMentionSuggestions(chatMentionSuggestions);
    mediaPicker.classList.add("hidden");
    clearReply();
    sendTypingState(false);
    await refreshChats();
  } catch (error) {
    messageStatus.textContent = error.message;
  }
}

function renderMessageContent(message) {
  if (message.type === "voice" && message.mediaData) {
    return `<audio class="voice-player" controls src="${escapeAttribute(message.mediaData)}"></audio>`;
  }

  if (message.type === "gif") {
    return `<span class="gif-message"><b>GIF</b>${escapeHtml(mediaLabel(message.body, "gif"))}</span>`;
  }

  if (message.type === "sticker") {
    return `<span class="sticker-message">${escapeHtml(mediaLabel(message.body, "sticker"))}</span>`;
  }

  return renderTextWithMentions(message.body);
}

function mediaLabel(value, type) {
  return String(value || "").replace(new RegExp(`^\\[${type}:|\\]$`, "g"), "");
}

function readReceiptText(chat, message) {
  const ownMessages = chat.messages.filter((item) => item.authorId === state.currentUser.id && !item.system);
  const latestOwnMessage = ownMessages.at(-1);
  const readers = chat.members
    .filter((id) => {
      if (id === state.currentUser.id) return false;
      const readAt = Number(chat.readBy?.[id] || 0);
      if (readAt < message.createdAt) return false;
      const latestReadOwnMessage = ownMessages.filter((item) => item.createdAt <= readAt).at(-1);
      return latestReadOwnMessage?.id === message.id;
    })
    .map((id) => userById(id)?.username)
    .filter(Boolean);

  if (!readers.length) return latestOwnMessage?.id === message.id ? "Delivered" : "";
  if (chat.direct) return "Seen";
  return `Seen by ${readers.slice(0, 3).join(", ")}${readers.length > 3 ? ` +${readers.length - 3}` : ""}`;
}

function renderTypingIndicator(chat) {
  const typingUsers = Object.entries(state.typing[chat.id] || {})
    .filter(([id, until]) => id !== state.currentUser.id && until > Date.now())
    .map(([id]) => userById(id)?.username)
    .filter(Boolean);

  typingIndicator.textContent = typingUsers.length
    ? `${typingUsers.slice(0, 2).join(", ")} ${typingUsers.length === 1 ? "is" : "are"} typing...`
    : "";
  typingIndicator.classList.toggle("hidden", !typingUsers.length);
}

function handleTypingEvent(payload) {
  if (!payload.chatId || payload.actorId === state.currentUser?.id) return;
  state.typing[payload.chatId] = state.typing[payload.chatId] || {};
  if (payload.typing) {
    state.typing[payload.chatId][payload.actorId] = Date.now() + 2500;
  } else {
    delete state.typing[payload.chatId][payload.actorId];
  }
  renderTypingIndicator(activeChat() || {});
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => renderTypingIndicator(activeChat() || {}), 2600);
}

async function sendTypingState(typing) {
  if (!state.activeChatId) return;
  if (typing && Date.now() - lastTypingSent < 1200) return;
  lastTypingSent = typing ? Date.now() : 0;
  try {
    await api(`/api/chats/${state.activeChatId}/typing`, {
      method: "POST",
      body: JSON.stringify({ typing }),
    });
  } catch {
    // Typing indicators are best-effort.
  }
}

function insertAtCursor(input, value) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = `${input.value.slice(0, start)}${value}${input.value.slice(end)}`;
  input.setSelectionRange(start + value.length, start + value.length);
  input.dispatchEvent(new Event("input"));
}

async function toggleVoiceRecording() {
  if (mediaRecorder?.state === "recording") {
    mediaRecorder.stop();
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    messageStatus.textContent = "Voice recording is not supported in this browser.";
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    voiceChunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) voiceChunks.push(event.data);
    });
    mediaRecorder.addEventListener("stop", async () => {
      stream.getTracks().forEach((track) => track.stop());
      voiceMessageBtn.classList.remove("recording");
      const blob = new Blob(voiceChunks, { type: mediaRecorder.mimeType || "audio/webm" });
      const mediaData = await blobToDataUrl(blob);
      await sendChatMessage("Voice message", { type: "voice", mediaData });
    });
    mediaRecorder.start();
    voiceMessageBtn.classList.add("recording");
    messageStatus.textContent = "Recording... tap the mic again to send.";
  } catch {
    messageStatus.textContent = "Microphone permission was not allowed.";
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function autoResizeMessageInput() {
  messageInput.style.height = "auto";
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 150)}px`;
}

function updateComposerMode() {
  messageForm.classList.toggle("has-text", Boolean(messageInput.value.trim()));
}

function isMobileInputDevice() {
  return window.matchMedia("(max-width: 860px), (pointer: coarse)").matches;
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
          <span><strong>@${escapeHtml(user.username)}${modBadge(user)}</strong><small>${escapeHtml(user.fullName)}</small></span>
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
  return escapeHtml(value)
    .replace(
    /(^|[^a-zA-Z0-9_])@([a-zA-Z0-9_]{2,30})/g,
    (match, prefix, username) => {
      const user = state.users.find((item) => item.username.toLowerCase() === username.toLowerCase());
      if (!user) return `${prefix}<span class="mention">@${username}</span>`;
      return `${prefix}<button class="mention mention-link" data-mention-user="${user.id}" type="button">@${escapeHtml(user.username)}${modBadge(user)}</button>`;
    },
  )
    .replace(
      /(^|[^a-zA-Z0-9_])#([a-zA-Z0-9_]{2,40})/g,
      (match, prefix, tag) =>
        `${prefix}<button class="hashtag-link" data-tag-filter="${escapeAttribute(tag.toLowerCase())}" type="button">#${escapeHtml(tag.toLowerCase())}</button>`,
    );
}

function modBadge(user) {
  return user?.isModerator ? `<span class="mod-badge" title="Closebook Moderator">MOD</span>` : "";
}

function normalizeTag(tag) {
  return String(tag || "")
    .replace(/^#/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
}

function extractTags(value) {
  const found = String(value || "").match(/#[a-zA-Z0-9_]{2,40}/g) || [];
  return Array.from(new Set(found.map(normalizeTag).filter(Boolean)));
}

function postHasTag(post, tag) {
  return extractTags(post.body).includes(normalizeTag(tag));
}

function tagButton(tag) {
  const normalized = normalizeTag(tag);
  return `<button class="tag-chip ${activeTag === normalized ? "active" : ""}" data-tag-filter="${escapeAttribute(normalized)}" type="button">#${escapeHtml(normalized)}</button>`;
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

bootstrap();
