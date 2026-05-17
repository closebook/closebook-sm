const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "database.json");
const IRIS_BOT_ID = "user_iris_bot";
const IRIS_BOT_USERNAME = "irisbot";
const IRIS_OWNER_ID = "user_1777740146651_e496c9a55621";

const emptyDb = {
  users: [],
  posts: [],
  chats: [],
  notifications: [],
  sessions: [],
  adminSessions: [],
  reports: [],
  ipBans: [],
};

ensureDatabase();

const liveClients = new Map();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    serveStatic(req, res, url);
  } catch (error) {
    sendJson(res, 500, { error: "Server error." });
  }
});

server.listen(PORT, () => {
  console.log(`Closebook running at http://localhost:${PORT}`);
});

async function handleApi(req, res, url) {
  const db = readDb();
  const clientIp = getClientIp(req);
  const session = getSession(req, db);
  const currentUser = session ? db.users.find((user) => user.id === session.userId) : null;
  const adminSession = getAdminSession(req, db);

  if (url.pathname.startsWith("/api/admin")) {
    return handleAdminApi(req, res, url, db, adminSession, clientIp);
  }

  if (isIpBanned(db, clientIp)) {
    return sendJson(res, 403, { error: "This IP address is banned from using Closebook." });
  }

  if (req.method === "GET" && url.pathname === "/api/live") {
    const liveToken = clean(url.searchParams.get("token"));
    const liveSession = db.sessions.find((item) => item.token === liveToken);
    const liveUser = liveSession ? db.users.find((user) => user.id === liveSession.userId) : null;

    if (!liveUser) {
      return sendJson(res, 401, { error: "Please login first." });
    }

    return openLiveStream(req, res, liveUser.id);
  }

  if (req.method === "POST" && url.pathname === "/api/register") {
    const body = await readBody(req);
    const fullName = clean(body.fullName);
    const username = clean(body.username);
    const email = clean(body.email).toLowerCase();
    const password = String(body.password || "");
    const age = Number(body.age);

    if (!fullName || !username || !email || !password || !Number.isFinite(age)) {
      return sendJson(res, 400, { error: "Please fill in every field." });
    }

    if (age < 13) {
      return sendJson(res, 400, { error: "Users must be at least 13 years old." });
    }

    if (password.length < 6) {
      return sendJson(res, 400, { error: "Password must be at least 6 characters." });
    }

    if (db.users.some((user) => user.email === email)) {
      return sendJson(res, 409, { error: "An account with this email already exists." });
    }

    if (db.users.some((user) => user.username.toLowerCase() === username.toLowerCase())) {
      return sendJson(res, 409, { error: "That username is already taken." });
    }

    const user = {
      id: uid("user"),
      fullName,
      username,
      age,
      email,
      passwordHash: hashPassword(password),
      bio: "",
      website: "",
      karma: 0,
      votedUsers: {},
      karmaVoteTimes: {},
      following: [],
      followers: [],
      savedPosts: [],
      isModerator: false,
      moderation: defaultModeration(),
      registeredIp: clientIp,
      lastIp: clientIp,
      createdAt: Date.now(),
    };
    const token = crypto.randomBytes(32).toString("hex");

    db.users.push(user);
    db.sessions.push({ token, userId: user.id, createdAt: Date.now() });
    writeDb(db);
    broadcast("social", { actorId: user.id });

    return sendJson(res, 201, { token, user: publicUser(user) });
  }

  if (req.method === "POST" && url.pathname === "/api/login") {
    const body = await readBody(req);
    const email = clean(body.email).toLowerCase();
    const password = String(body.password || "");
    const user = db.users.find((item) => item.email === email);

    if (!user || user.passwordHash !== hashPassword(password)) {
      return sendJson(res, 401, { error: "Email or password is incorrect." });
    }
    if (isUserBlockedFromApp(user)) {
      return sendJson(res, 403, { error: moderationError(user, "This account is restricted from using Closebook.") });
    }

    const token = crypto.randomBytes(32).toString("hex");
    user.lastIp = clientIp;
    db.sessions.push({ token, userId: user.id, createdAt: Date.now() });
    writeDb(db);

    return sendJson(res, 200, { token, user: publicUser(user) });
  }

  if (req.method === "POST" && url.pathname === "/api/logout") {
    if (!requireUser(res, currentUser)) return;
    const authToken = getBearerToken(req);
    const nextSessions = db.sessions.filter((item) => item.token !== authToken);
    db.sessions = nextSessions;
    writeDb(db);
    return sendJson(res, 200, { ok: true });
  }

  if (!requireUser(res, currentUser)) return;
  if (isUserBlockedFromApp(currentUser) && url.pathname !== "/api/logout" && url.pathname !== "/api/me") {
    return sendJson(res, 403, { error: moderationError(currentUser, "This account is restricted from using Closebook.") });
  }

  if (req.method === "GET" && url.pathname === "/api/me") {
    return sendJson(res, 200, { user: publicUser(currentUser) });
  }

  if (req.method === "PATCH" && url.pathname === "/api/me") {
    const body = await readBody(req);
    const fullName = clean(body.fullName);
    const bio = clean(body.bio);
    const website = clean(body.website);

    if (!fullName) return sendJson(res, 400, { error: "Full name is required." });
    if (bio.length > 140) return sendJson(res, 400, { error: "Bio must be 140 characters or less." });
    if (website.length > 80) return sendJson(res, 400, { error: "Website must be 80 characters or less." });

    currentUser.fullName = fullName;
    currentUser.bio = bio;
    currentUser.website = website;
    writeDb(db);
    broadcast("social", { actorId: currentUser.id });

    return sendJson(res, 200, { user: publicUser(currentUser) });
  }

  if (req.method === "GET" && url.pathname === "/api/users") {
    return sendJson(res, 200, { users: db.users.map(publicUser) });
  }

  if (req.method === "GET" && url.pathname === "/api/posts") {
    const posts = db.posts
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((post) => ({
        ...post,
        author: publicUser(db.users.find((user) => user.id === post.authorId)),
      }));

    return sendJson(res, 200, { posts });
  }

  if (req.method === "GET" && url.pathname === "/api/notifications") {
    const notifications = db.notifications
      .filter((notification) => notification.userId === currentUser.id)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 40)
      .map((notification) => ({
        ...notification,
        actor: publicUser(db.users.find((user) => user.id === notification.actorId)),
      }));

    return sendJson(res, 200, { notifications });
  }

  if (req.method === "POST" && url.pathname === "/api/notifications/read") {
    db.notifications.forEach((notification) => {
      if (notification.userId === currentUser.id) notification.read = true;
    });
    writeDb(db);
    broadcast("social", { actorId: currentUser.id, members: [currentUser.id] });

    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "POST" && url.pathname === "/api/posts") {
    const body = await readBody(req);
    const text = clean(body.body);
    const imageData = clean(body.imageData);

    if (isMuted(currentUser)) return sendJson(res, 403, { error: moderationError(currentUser, "You cannot post at the moment.") });

    if (!text && !imageData) {
      return sendJson(res, 400, { error: "Add a photo or caption first." });
    }

    if (text.length > 280) {
      return sendJson(res, 400, { error: "Post must be 280 characters or less." });
    }

    if (imageData && !imageData.startsWith("data:image/")) {
      return sendJson(res, 400, { error: "Image data is invalid." });
    }

    if (imageData.length > 5_500_000) {
      return sendJson(res, 400, { error: "Image is too large." });
    }

    const post = {
      id: uid("post"),
      authorId: currentUser.id,
      body: text,
      imageData,
      likes: [],
      shares: [],
      comments: [],
      createdAt: Date.now(),
    };

    db.posts.push(post);
    notifyMentions(db, {
      text,
      actor: currentUser,
      type: "post-mention",
      message: `${currentUser.username} mentioned you in a post.`,
      postId: post.id,
    });
    writeDb(db);
    broadcast("social", { actorId: currentUser.id });

    return sendJson(res, 201, { ok: true });
  }

  if (req.method === "POST" && url.pathname === "/api/bots") {
    const body = await readBody(req);
    const fullName = clean(body.fullName).slice(0, 60);
    const username = clean(body.username).toLowerCase();
    const bio = clean(body.bio).slice(0, 140);

    if (!fullName || !username) return sendJson(res, 400, { error: "Bot name and username are required." });
    if (!/^[a-z0-9_]{3,24}$/.test(username)) return sendJson(res, 400, { error: "Bot username must be 3-24 letters, numbers, or underscores." });
    if (db.users.some((user) => user.username.toLowerCase() === username)) return sendJson(res, 409, { error: "That bot username is already taken." });

    const bot = {
      id: uid("bot"),
      fullName,
      username,
      age: 1,
      email: `${username}@bots.closebook.local`,
      passwordHash: "",
      bio: bio || "Community bot powered by Iris Core.",
      website: "",
      karma: 50,
      votedUsers: {},
      karmaVoteTimes: {},
      following: [],
      followers: [],
      savedPosts: [],
      isModerator: false,
      moderation: defaultModeration(),
      registeredIp: "bot-community",
      lastIp: "bot-community",
      isBot: true,
      botOwnerId: currentUser.id,
      botCommunity: true,
      botFeatures: defaultBotFeatures(),
      createdAt: Date.now(),
    };

    db.users.push(bot);
    addNotification(db, {
      userId: currentUser.id,
      actorId: bot.id,
      type: "bot-created",
      text: `${bot.fullName} is ready. Activate Iris Core to use moderation commands in groups.`,
    });
    writeDb(db);
    broadcast("social", { actorId: currentUser.id });

    return sendJson(res, 201, { bot: publicUser(bot) });
  }

  const botAction = url.pathname.match(/^\/api\/bots\/([^/]+)$/);
  if (req.method === "PATCH" && botAction) {
    const body = await readBody(req);
    const bot = db.users.find((user) => user.id === botAction[1] && user.isBot);
    if (!bot) return sendJson(res, 404, { error: "Bot not found." });
    if (bot.botOwnerId !== currentUser.id) return sendJson(res, 403, { error: "Only the bot owner can manage this bot." });

    const fullName = clean(body.fullName).slice(0, 60);
    const bio = clean(body.bio).slice(0, 140);
    if (fullName) bot.fullName = fullName;
    bot.bio = bio;
    bot.botFeatures = { ...defaultBotFeatures(), ...(bot.botFeatures || {}) };
    bot.botFeatures.irisCore = Boolean(body.irisCore);
    bot.botFeatures.autoWelcome = Boolean(body.autoWelcome);
    bot.botFeatures.antiSpam = Boolean(body.antiSpam);
    writeDb(db);
    broadcast("social", { actorId: currentUser.id, targetId: bot.id });

    return sendJson(res, 200, { bot: publicUser(bot) });
  }

  const botPostAction = url.pathname.match(/^\/api\/bots\/([^/]+)\/posts$/);
  if (req.method === "POST" && botPostAction) {
    const body = await readBody(req);
    const bot = db.users.find((user) => user.id === botPostAction[1] && user.isBot);
    const text = clean(body.body);
    const imageData = clean(body.imageData);

    if (!bot) return sendJson(res, 404, { error: "Bot not found." });
    if (bot.botOwnerId !== currentUser.id) return sendJson(res, 403, { error: "Only the bot owner can post through this bot." });
    if (!text && !imageData) return sendJson(res, 400, { error: "Write something for the bot to post." });
    if (text.length > 280) return sendJson(res, 400, { error: "Bot post must be 280 characters or less." });
    if (imageData && !imageData.startsWith("data:image/")) return sendJson(res, 400, { error: "Image data is invalid." });

    const post = {
      id: uid("post"),
      authorId: bot.id,
      body: text,
      imageData,
      likes: [],
      shares: [],
      comments: [],
      createdAt: Date.now(),
    };
    db.posts.push(post);
    notifyMentions(db, {
      text,
      actor: bot,
      type: "post-mention",
      message: `${bot.username} mentioned you in a bot post.`,
      postId: post.id,
    });
    writeDb(db);
    broadcast("social", { actorId: bot.id });

    return sendJson(res, 201, { ok: true });
  }

  const postAction = url.pathname.match(/^\/api\/posts\/([^/]+)\/(like|share)$/);
  if (req.method === "POST" && postAction) {
    const post = db.posts.find((item) => item.id === postAction[1]);
    if (!post) return sendJson(res, 404, { error: "Post not found." });

    const list = postAction[2] === "like" ? post.likes : post.shares;
    const hadAction = list.includes(currentUser.id);
    toggleId(list, currentUser.id);
    if (!hadAction && post.authorId !== currentUser.id) {
      addNotification(db, {
        userId: post.authorId,
        actorId: currentUser.id,
        type: postAction[2],
        text: `${currentUser.username} ${postAction[2] === "like" ? "hearted" : "reposted"} your post.`,
        postId: post.id,
      });
    }
    writeDb(db);
    broadcast("social", { actorId: currentUser.id });

    return sendJson(res, 200, { ok: true });
  }

  const deletePostAction = url.pathname.match(/^\/api\/posts\/([^/]+)$/);
  if (req.method === "DELETE" && deletePostAction) {
    const postIndex = db.posts.findIndex((item) => item.id === deletePostAction[1]);
    const post = db.posts[postIndex];

    if (!post) return sendJson(res, 404, { error: "Post not found." });
    const postAuthor = db.users.find((user) => user.id === post.authorId);
    const canDelete = post.authorId === currentUser.id || (postAuthor?.isBot && postAuthor.botOwnerId === currentUser.id);
    if (!canDelete) return sendJson(res, 403, { error: "You can only delete your own posts or your bot's posts." });

    db.posts.splice(postIndex, 1);
    db.users.forEach((user) => {
      user.savedPosts = (user.savedPosts || []).filter((postId) => postId !== post.id);
    });
    db.notifications = db.notifications.filter((notification) => notification.postId !== post.id);
    writeDb(db);
    broadcast("social", { actorId: currentUser.id });

    return sendJson(res, 200, { ok: true });
  }

  const saveAction = url.pathname.match(/^\/api\/posts\/([^/]+)\/save$/);
  if (req.method === "POST" && saveAction) {
    const post = db.posts.find((item) => item.id === saveAction[1]);
    if (!post) return sendJson(res, 404, { error: "Post not found." });

    toggleId(currentUser.savedPosts, post.id);
    writeDb(db);
    broadcast("social", { actorId: currentUser.id, members: [currentUser.id] });

    return sendJson(res, 200, { ok: true });
  }

  const commentAction = url.pathname.match(/^\/api\/posts\/([^/]+)\/comments$/);
  if (req.method === "POST" && commentAction) {
    const body = await readBody(req);
    const post = db.posts.find((item) => item.id === commentAction[1]);
    const text = clean(body.body);

    if (!post) return sendJson(res, 404, { error: "Post not found." });
    if (isMuted(currentUser)) return sendJson(res, 403, { error: moderationError(currentUser, "You cannot comment at the moment.") });
    if (!text) return sendJson(res, 400, { error: "Comment cannot be empty." });
    if (text.length > 180) return sendJson(res, 400, { error: "Comment must be 180 characters or less." });

    const comment = {
      id: uid("comment"),
      authorId: currentUser.id,
      body: text,
      createdAt: Date.now(),
    };
    post.comments.push(comment);
    notifyMentions(db, {
      text,
      actor: currentUser,
      type: "comment-mention",
      message: `${currentUser.username} mentioned you in a comment.`,
      postId: post.id,
      commentId: comment.id,
    });

    if (post.authorId !== currentUser.id) {
      addNotification(db, {
        userId: post.authorId,
        actorId: currentUser.id,
        type: "comment",
        text: `${currentUser.username} commented on your post.`,
        postId: post.id,
      });
    }

    writeDb(db);
    broadcast("social", { actorId: currentUser.id });

    return sendJson(res, 201, { comment });
  }

  const followAction = url.pathname.match(/^\/api\/users\/([^/]+)\/follow$/);
  if (req.method === "POST" && followAction) {
    const target = db.users.find((user) => user.id === followAction[1]);
    if (!target) return sendJson(res, 404, { error: "User not found." });
    if (target.id === currentUser.id) return sendJson(res, 400, { error: "You cannot follow yourself." });

    const wasFollowing = currentUser.following.includes(target.id);
    toggleId(currentUser.following, target.id);
    toggleId(target.followers, currentUser.id);

    if (!wasFollowing) {
      addNotification(db, {
        userId: target.id,
        actorId: currentUser.id,
        type: "follow",
        text: `${currentUser.username} started following you.`,
      });
    }

    writeDb(db);
    broadcast("social", { actorId: currentUser.id, targetId: target.id });

    return sendJson(res, 200, { ok: true });
  }

  const karmaAction = url.pathname.match(/^\/api\/users\/([^/]+)\/karma$/);
  if (req.method === "POST" && karmaAction) {
    const body = await readBody(req);
    const target = db.users.find((user) => user.id === karmaAction[1]);
    const vote = Number(body.vote);

    if (!target) return sendJson(res, 404, { error: "User not found." });
    if (target.id === currentUser.id) {
      return sendJson(res, 400, { error: "You cannot vote on your own karma." });
    }
    if (![1, -1].includes(vote)) {
      return sendJson(res, 400, { error: "Karma vote must be +1 or -1." });
    }

    const lastVoteAt = Number(currentUser.karmaVoteTimes?.[target.id] || 0);
    const cooldownMs = 24 * 60 * 60 * 1000;
    const cooldownRemaining = lastVoteAt + cooldownMs - Date.now();
    if (!currentUser.isModerator && cooldownRemaining > 0) {
      return sendJson(res, 429, { error: `You can vote on this user's karma again in ${formatDuration(cooldownRemaining)}.` });
    }

    target.karma += vote;
    currentUser.votedUsers[target.id] = vote;
    currentUser.karmaVoteTimes[target.id] = Date.now();
    addNotification(db, {
      userId: target.id,
      actorId: currentUser.id,
      type: "karma",
      text: `${currentUser.username} ${vote > 0 ? "raised" : "lowered"} your karma.`,
    });
    writeDb(db);
    broadcast("social", { actorId: currentUser.id, targetId: target.id });

    return sendJson(res, 200, { ok: true });
  }

  const moderatorKarmaAction = url.pathname.match(/^\/api\/users\/([^/]+)\/karma\/moderate$/);
  if (req.method === "POST" && moderatorKarmaAction) {
    const body = await readBody(req);
    const target = db.users.find((user) => user.id === moderatorKarmaAction[1]);
    const amount = Number(body.amount);

    if (!currentUser.isModerator) return sendJson(res, 403, { error: "Only moderators can adjust karma." });
    if (!target) return sendJson(res, 404, { error: "User not found." });
    if (target.id === currentUser.id) return sendJson(res, 400, { error: "Moderators cannot adjust their own karma." });
    if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 10) {
      return sendJson(res, 400, { error: "Moderator karma adjustment must be between -10 and 10." });
    }

    target.karma += amount;
    addNotification(db, {
      userId: target.id,
      actorId: currentUser.id,
      type: "karma",
      text: `${currentUser.username} ${amount > 0 ? "increased" : "decreased"} your karma by ${Math.abs(amount)} as a moderator.`,
    });
    writeDb(db);
    broadcast("social", { actorId: currentUser.id, targetId: target.id });

    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "GET" && url.pathname === "/api/chats") {
    const chats = db.chats
      .filter((chat) => chat.members.includes(currentUser.id))
      .sort((a, b) => lastActivity(b) - lastActivity(a));

    return sendJson(res, 200, { chats });
  }

  if (req.method === "POST" && url.pathname === "/api/chats/direct") {
    const body = await readBody(req);
    const target = db.users.find((user) => user.id === clean(body.userId));

    if (isChatRestricted(currentUser)) return sendJson(res, 403, { error: moderationError(currentUser, "You cannot start chats at the moment.") });
    if (!target) return sendJson(res, 404, { error: "User not found." });
    if (target.id === currentUser.id) return sendJson(res, 400, { error: "You cannot message yourself." });

    let chat = db.chats.find(
      (item) => item.direct && item.members.length === 2 && item.members.includes(currentUser.id) && item.members.includes(target.id),
    );

    if (!chat) {
      chat = {
          id: uid("chat"),
          name: "",
          direct: true,
          creatorId: currentUser.id,
          admins: [],
          members: [currentUser.id, target.id],
        messages: [],
        readBy: {},
        createdAt: Date.now(),
      };
      db.chats.push(chat);
      writeDb(db);
      broadcast("chat", { actorId: currentUser.id, chatId: chat.id, members: chat.members });
    }

    return sendJson(res, 200, { chat });
  }

  if (req.method === "POST" && url.pathname === "/api/chats") {
    const body = await readBody(req);
    const name = clean(body.name);
    const requestedMembers = Array.isArray(body.members) ? body.members : body.members ? [body.members] : [];
    const members = Array.from(new Set([currentUser.id, ...requestedMembers]));

    if (isChatRestricted(currentUser)) return sendJson(res, 403, { error: moderationError(currentUser, "You cannot start chats at the moment.") });

    if (members.length < 2) {
      return sendJson(res, 400, { error: "Pick at least one other member." });
    }
    if (members.some((id) => !db.users.some((user) => user.id === id))) {
      return sendJson(res, 400, { error: "One or more chat members are invalid." });
    }

    if (members.length === 2) {
      const targetId = members.find((id) => id !== currentUser.id);
      let chat = findDirectChat(db, currentUser.id, targetId);

      if (!chat) {
        chat = {
          id: uid("chat"),
          name: "",
          direct: true,
          creatorId: currentUser.id,
          admins: [],
          members,
          messages: [],
          readBy: {},
          createdAt: Date.now(),
        };
        db.chats.push(chat);
        writeDb(db);
        broadcast("chat", { actorId: currentUser.id, chatId: chat.id, members: chat.members });
      }

      return sendJson(res, 201, { chat });
    }

    if (!name) return sendJson(res, 400, { error: "Group chat name is required." });

    const chat = {
      id: uid("chat"),
      name,
      direct: false,
      creatorId: currentUser.id,
      admins: [currentUser.id],
      members,
      messages: [],
      readBy: {},
      createdAt: Date.now(),
    };

    db.chats.push(chat);
    writeDb(db);
    broadcast("chat", { actorId: currentUser.id, chatId: chat.id, members: chat.members });

    return sendJson(res, 201, { chat });
  }

  const renameChatAction = url.pathname.match(/^\/api\/chats\/([^/]+)$/);
  if (req.method === "PATCH" && renameChatAction) {
    const body = await readBody(req);
    const chat = db.chats.find((item) => item.id === renameChatAction[1]);
    const name = clean(body.name);

    if (!chat || !chat.members.includes(currentUser.id)) {
      return sendJson(res, 404, { error: "Chat not found." });
    }
    if (chat.direct) return sendJson(res, 400, { error: "Direct chats cannot be renamed." });
    if (!isChatAdmin(chat, currentUser.id)) return sendJson(res, 403, { error: "Only admins can rename this group." });
    if (!name) return sendJson(res, 400, { error: "Group chat name is required." });

    chat.name = name;
    writeDb(db);
    broadcast("chat", { actorId: currentUser.id, chatId: chat.id, members: chat.members });

    return sendJson(res, 200, { chat });
  }

  const memberAction = url.pathname.match(/^\/api\/chats\/([^/]+)\/members$/);
  if (req.method === "POST" && memberAction) {
    const body = await readBody(req);
    const chat = db.chats.find((item) => item.id === memberAction[1]);
    const userId = clean(body.userId);
    const user = db.users.find((item) => item.id === userId);

    if (!chat || !chat.members.includes(currentUser.id)) return sendJson(res, 404, { error: "Chat not found." });
    if (chat.direct) return sendJson(res, 400, { error: "Direct chats cannot add members." });
    if (!isChatAdmin(chat, currentUser.id)) return sendJson(res, 403, { error: "Only admins can add members." });
    if (!user) return sendJson(res, 404, { error: "User not found." });
    if ((chat.moderation?.bannedUserIds || []).includes(userId)) {
      return sendJson(res, 403, { error: "This user is banned from the group." });
    }
    if (!chat.members.includes(userId)) chat.members.push(userId);

    addSystemMessage(chat, `${currentUser.username} added ${user.username}.`);
    if (user.isBot) {
      addBotMessage(
        chat,
        `${user.fullName} joined. ${user.botFeatures?.irisCore ? "Make me an admin to enable Iris Core moderation commands. Type /help after promotion." : "Activate Iris Core from Communities if you want moderation commands."}`,
        user.id,
      );
    } else if (chat.moderation?.welcome || chat.moderation?.rules) {
      const bot = activeModerationBot(db, chat) || db.users.find((item) => item.id === IRIS_BOT_ID);
      addBotMessage(
        chat,
        `Welcome @${user.username}.${chat.moderation.welcome ? `\n${chat.moderation.welcome}` : ""}${
          chat.moderation.rules ? `\nGroup rules:\n${chat.moderation.rules}` : ""
        }`,
        bot?.id || IRIS_BOT_ID,
      );
    }
    writeDb(db);
    broadcast("chat", { actorId: currentUser.id, chatId: chat.id, members: chat.members });

    return sendJson(res, 200, { chat });
  }

  if (req.method === "DELETE" && memberAction) {
    const body = await readBody(req);
    const chat = db.chats.find((item) => item.id === memberAction[1]);
    const userId = clean(body.userId);
    const user = db.users.find((item) => item.id === userId);

    if (!chat || !chat.members.includes(currentUser.id)) return sendJson(res, 404, { error: "Chat not found." });
    if (chat.direct) return sendJson(res, 400, { error: "Direct chats cannot remove members." });
    if (!isChatAdmin(chat, currentUser.id) && userId !== currentUser.id) {
      return sendJson(res, 403, { error: "Only admins can remove members." });
    }
    if (userId === chat.creatorId && currentUser.id !== chat.creatorId) {
      return sendJson(res, 403, { error: "The creator can only remove themselves." });
    }

    chat.members = chat.members.filter((id) => id !== userId);
    chat.admins = chat.admins.filter((id) => id !== userId);
    addSystemMessage(chat, `${currentUser.username} removed ${user?.username || "a member"}.`);
    writeDb(db);
    broadcast("chat", { actorId: currentUser.id, chatId: chat.id, members: [...chat.members, userId] });

    return sendJson(res, 200, { chat });
  }

  const adminAction = url.pathname.match(/^\/api\/chats\/([^/]+)\/admins$/);
  if (req.method === "POST" && adminAction) {
    const body = await readBody(req);
    const chat = db.chats.find((item) => item.id === adminAction[1]);
    const userId = clean(body.userId);

    if (!chat || !chat.members.includes(currentUser.id)) return sendJson(res, 404, { error: "Chat not found." });
    if (chat.direct) return sendJson(res, 400, { error: "Direct chats do not have admins." });
    if (!isChatAdmin(chat, currentUser.id)) return sendJson(res, 403, { error: "Only admins can manage admins." });
    if (!chat.members.includes(userId)) return sendJson(res, 400, { error: "User is not in this group." });
    if (!chat.admins.includes(userId)) chat.admins.push(userId);
    addSystemMessage(chat, `${currentUser.username} made ${db.users.find((user) => user.id === userId)?.username || "a member"} an admin.`);
    writeDb(db);
    broadcast("chat", { actorId: currentUser.id, chatId: chat.id, members: chat.members });

    return sendJson(res, 200, { chat });
  }

  if (req.method === "DELETE" && adminAction) {
    const body = await readBody(req);
    const chat = db.chats.find((item) => item.id === adminAction[1]);
    const userId = clean(body.userId);

    if (!chat || !chat.members.includes(currentUser.id)) return sendJson(res, 404, { error: "Chat not found." });
    if (chat.direct) return sendJson(res, 400, { error: "Direct chats do not have admins." });
    if (!isChatAdmin(chat, currentUser.id)) return sendJson(res, 403, { error: "Only admins can manage admins." });
    if (userId === chat.creatorId) return sendJson(res, 403, { error: "The creator admin cannot be removed." });

    chat.admins = chat.admins.filter((id) => id !== userId);
    addSystemMessage(chat, `${currentUser.username} removed admin from ${db.users.find((user) => user.id === userId)?.username || "a member"}.`);
    writeDb(db);
    broadcast("chat", { actorId: currentUser.id, chatId: chat.id, members: chat.members });

    return sendJson(res, 200, { chat });
  }

  const messageAction = url.pathname.match(/^\/api\/chats\/([^/]+)\/messages$/);
  if (req.method === "POST" && messageAction) {
    const body = await readBody(req);
    const chat = db.chats.find((item) => item.id === messageAction[1]);
    const text = clean(body.body);
    const type = clean(body.type) || "text";
    const mediaData = String(body.mediaData || "");
    const replyTo = clean(body.replyTo);
    const allowedMessageTypes = ["text", "emoji", "gif", "sticker", "voice"];

    if (!chat || !chat.members.includes(currentUser.id)) {
      return sendJson(res, 404, { error: "Chat not found." });
    }
    if (isChatRestricted(currentUser)) return sendJson(res, 403, { error: moderationError(currentUser, "You cannot send messages at the moment.") });
    if (isGroupMuted(chat, currentUser.id)) return sendJson(res, 403, { error: "You are muted in this group right now." });
    if (!allowedMessageTypes.includes(type)) return sendJson(res, 400, { error: "Choose a valid message type." });
    if (!text && type !== "voice") return sendJson(res, 400, { error: "Message cannot be empty." });
    if (type === "voice" && !mediaData.startsWith("data:audio/")) return sendJson(res, 400, { error: "Voice message is missing audio." });
    if (mediaData.length > 2_500_000) return sendJson(res, 400, { error: "Media message is too large." });

    if (!chat.direct && text.startsWith("/")) {
      const commandHandled = handleIrisCommand(db, chat, currentUser, text);
      writeDb(db);
      broadcast("chat", { actorId: currentUser.id, chatId: chat.id, members: chat.members });
      return sendJson(res, 200, { ok: true, commandHandled });
    }

    if (!chat.direct && chat.moderation?.locked && !isChatAdmin(chat, currentUser.id)) {
      return sendJson(res, 403, { error: "This group is locked by Iris. Only admins can send messages right now." });
    }

    const slowModeSeconds = Number(chat.moderation?.slowModeSeconds || 0);
    if (!chat.direct && slowModeSeconds > 0 && !isChatAdmin(chat, currentUser.id)) {
      const lastAt = Number(chat.moderation?.lastMessageAt?.[currentUser.id] || 0);
      const remaining = lastAt + slowModeSeconds * 1000 - Date.now();
      if (remaining > 0) {
        return sendJson(res, 429, { error: `Slow mode is active. Try again in ${formatDuration(remaining)}.` });
      }
    }

    const message = {
      id: uid("message"),
      authorId: currentUser.id,
      body: text,
      type,
      mediaData: type === "voice" ? mediaData : "",
      replyTo: chat.messages.some((message) => message.id === replyTo) ? replyTo : "",
      reactions: {},
      createdAt: Date.now(),
    };
    chat.messages.push(message);
    if (!chat.direct) {
      chat.moderation.lastMessageAt = {
        ...(chat.moderation.lastMessageAt || {}),
        [currentUser.id]: Date.now(),
      };
    }
    notifyMentions(db, {
      text,
      actor: currentUser,
      type: "chat-mention",
      message: `${currentUser.username} mentioned you in ${chat.direct ? "a direct chat" : chat.name}.`,
      chatId: chat.id,
      messageId: message.id,
      allowedUserIds: chat.members,
    });
    chat.readBy = {
      ...(chat.readBy || {}),
      [currentUser.id]: Date.now(),
    };
    writeDb(db);
    broadcast("chat", { actorId: currentUser.id, chatId: chat.id, members: chat.members });

    return sendJson(res, 201, { ok: true });
  }

  const typingAction = url.pathname.match(/^\/api\/chats\/([^/]+)\/typing$/);
  if (req.method === "POST" && typingAction) {
    const body = await readBody(req);
    const chat = db.chats.find((item) => item.id === typingAction[1]);

    if (!chat || !chat.members.includes(currentUser.id)) {
      return sendJson(res, 404, { error: "Chat not found." });
    }

    broadcast("typing", {
      actorId: currentUser.id,
      chatId: chat.id,
      typing: Boolean(body.typing),
      members: chat.members,
    });

    return sendJson(res, 200, { ok: true });
  }

  const reactionAction = url.pathname.match(/^\/api\/chats\/([^/]+)\/messages\/([^/]+)\/reactions$/);
  if (req.method === "POST" && reactionAction) {
    const body = await readBody(req);
    const chat = db.chats.find((item) => item.id === reactionAction[1]);
    const reaction = clean(body.reaction);
    const allowedReactions = ["👍", "❤️", "😂", "🔥", "Like", "Wow", "Boost", "Agree"];

    if (!chat || !chat.members.includes(currentUser.id)) {
      return sendJson(res, 404, { error: "Chat not found." });
    }
    if (isChatRestricted(currentUser)) return sendJson(res, 403, { error: moderationError(currentUser, "You cannot react to messages at the moment.") });

    const message = chat.messages.find((item) => item.id === reactionAction[2]);
    if (!message || message.system) return sendJson(res, 404, { error: "Message not found." });
    if (!allowedReactions.includes(reaction)) return sendJson(res, 400, { error: "Choose a valid reaction." });

    message.reactions = message.reactions || {};
    if (message.reactions[currentUser.id] === reaction) {
      delete message.reactions[currentUser.id];
    } else {
      message.reactions[currentUser.id] = reaction;
    }

    writeDb(db);
    broadcast("chat", { actorId: currentUser.id, chatId: chat.id, members: chat.members });

    return sendJson(res, 200, { message });
  }

  if (req.method === "POST" && url.pathname === "/api/reports") {
    const body = await readBody(req);
    const targetType = clean(body.targetType);
    const targetId = clean(body.targetId);
    const reason = clean(body.reason);
    const details = clean(body.details);
    const allowedTypes = ["user", "post", "message", "chat"];

    if (!allowedTypes.includes(targetType)) return sendJson(res, 400, { error: "Choose a valid report type." });
    if (!targetId) return sendJson(res, 400, { error: "Report target is required." });
    if (!reason) return sendJson(res, 400, { error: "Please add a reason for the report." });
    if (reason.length > 120 || details.length > 500) return sendJson(res, 400, { error: "Report is too long." });

    const reportTarget = findReportTarget(db, targetType, targetId);
    if (!reportTarget.exists) return sendJson(res, 404, { error: "Report target not found." });

    db.reports.push({
      id: uid("report"),
      reporterId: currentUser.id,
      targetType,
      targetId,
      targetUserId: reportTarget.userId || "",
      reason,
      details,
      status: "open",
      reporterIp: clientIp,
      createdAt: Date.now(),
      reviewedAt: 0,
      reviewedBy: "",
    });
    writeDb(db);

    return sendJson(res, 201, { ok: true });
  }

  const readAction = url.pathname.match(/^\/api\/chats\/([^/]+)\/read$/);
  if (req.method === "POST" && readAction) {
    const chat = db.chats.find((item) => item.id === readAction[1]);

    if (!chat || !chat.members.includes(currentUser.id)) {
      return sendJson(res, 404, { error: "Chat not found." });
    }

    chat.readBy = {
      ...(chat.readBy || {}),
      [currentUser.id]: Date.now(),
    };
    writeDb(db);
    broadcast("chat", { actorId: currentUser.id, chatId: chat.id, members: chat.members });

    return sendJson(res, 200, { ok: true });
  }

  sendJson(res, 404, { error: "Route not found." });
}

async function handleAdminApi(req, res, url, db, adminSession, clientIp) {
  if (req.method === "POST" && url.pathname === "/api/admin/login") {
    const body = await readBody(req);
    if (String(body.password || "") !== "admin123") {
      return sendJson(res, 401, { error: "Admin password is incorrect." });
    }

    const token = crypto.randomBytes(32).toString("hex");
    db.adminSessions.push({ token, createdAt: Date.now(), ip: clientIp });
    writeDb(db);
    return sendJson(res, 200, { token });
  }

  if (!adminSession) return sendJson(res, 401, { error: "Admin login required." });

  if (req.method === "POST" && url.pathname === "/api/admin/logout") {
    const authToken = getBearerToken(req);
    db.adminSessions = db.adminSessions.filter((session) => session.token !== authToken);
    writeDb(db);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "GET" && url.pathname === "/api/admin/overview") {
    const reports = db.reports
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((report) => ({
        ...report,
        reporter: adminUser(db.users.find((user) => user.id === report.reporterId)),
        targetUser: adminUser(db.users.find((user) => user.id === report.targetUserId)),
        targetPreview: reportPreview(db, report),
      }));

    return sendJson(res, 200, {
      users: db.users.map(adminUser),
      reports,
      ipBans: db.ipBans,
      stats: {
        users: db.users.length,
        reports: db.reports.length,
        openReports: db.reports.filter((report) => report.status === "open").length,
        ipBans: db.ipBans.length,
      },
    });
  }

  const moderationAction = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/moderation$/);
  if (req.method === "PATCH" && moderationAction) {
    const body = await readBody(req);
    const user = db.users.find((item) => item.id === moderationAction[1]);
    if (!user) return sendJson(res, 404, { error: "User not found." });
    const previousModeration = { ...defaultModeration(), ...(user.moderation || {}) };

    user.moderation = {
      ...defaultModeration(),
      ...(user.moderation || {}),
      banned: Boolean(body.banned),
      muted: Boolean(body.muted),
      chatRestricted: Boolean(body.chatRestricted),
      appRestricted: Boolean(body.appRestricted),
      reason: clean(body.reason).slice(0, 180),
      updatedAt: Date.now(),
    };
    user.isModerator = Boolean(body.isModerator);
    user.moderation.strikes = Array.isArray(previousModeration.strikes) ? previousModeration.strikes : [];

    const strikeText = moderationNotificationText(user.moderation, previousModeration);
    if (strikeText) {
      const strike = {
        id: uid("strike"),
        text: strikeText,
        reason: user.moderation.reason,
        createdAt: Date.now(),
      };
      user.moderation.strikes.push(strike);
      addNotification(db, {
        userId: user.id,
        actorId: "admin",
        type: "admin-strike",
        text: strikeText,
      });
    }

    if (body.ipBanned && user.lastIp) {
      addIpBan(db, user.lastIp, user.moderation.reason || `IP ban for @${user.username}`, "admin");
    } else if (user.lastIp) {
      db.ipBans = db.ipBans.filter((ban) => ban.ip !== user.lastIp);
    }

    if (user.moderation.banned || user.moderation.appRestricted) {
      db.sessions = db.sessions.filter((session) => session.userId !== user.id);
    }

    writeDb(db);
    broadcast("social", { actorId: user.id });
    broadcast("chat", { actorId: user.id });

    return sendJson(res, 200, { user: adminUser(user) });
  }

  const adminKarmaAction = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/karma$/);
  if (req.method === "PATCH" && adminKarmaAction) {
    const body = await readBody(req);
    const user = db.users.find((item) => item.id === adminKarmaAction[1]);
    const amount = Number(body.amount);

    if (!user) return sendJson(res, 404, { error: "User not found." });
    if (!Number.isInteger(amount) || amount === 0) {
      return sendJson(res, 400, { error: "Enter a whole karma amount other than 0." });
    }

    user.karma += amount;
    addNotification(db, {
      userId: user.id,
      actorId: "admin",
      type: "karma",
      text: `Closebook Admin ${amount > 0 ? "increased" : "decreased"} your karma by ${Math.abs(amount)}.`,
    });
    writeDb(db);
    broadcast("social", { actorId: user.id });

    return sendJson(res, 200, { user: adminUser(user) });
  }

  const reportAction = url.pathname.match(/^\/api\/admin\/reports\/([^/]+)$/);
  if (req.method === "PATCH" && reportAction) {
    const body = await readBody(req);
    const report = db.reports.find((item) => item.id === reportAction[1]);
    const status = clean(body.status);
    if (!report) return sendJson(res, 404, { error: "Report not found." });
    if (!["open", "reviewing", "resolved", "dismissed"].includes(status)) {
      return sendJson(res, 400, { error: "Choose a valid report status." });
    }

    report.status = status;
    report.reviewedAt = Date.now();
    report.reviewedBy = adminSession.token.slice(0, 8);
    writeDb(db);

    return sendJson(res, 200, { report });
  }

  const ipBanAction = url.pathname.match(/^\/api\/admin\/ip-bans\/(.+)$/);
  if (req.method === "DELETE" && ipBanAction) {
    const ip = decodeURIComponent(ipBanAction[1]);
    db.ipBans = db.ipBans.filter((ban) => ban.ip !== ip);
    writeDb(db);
    return sendJson(res, 200, { ok: true });
  }

  sendJson(res, 404, { error: "Admin route not found." });
}

function serveStatic(req, res, url) {
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(ROOT, requested));

  if (!filePath.startsWith(ROOT) || filePath.includes(`${path.sep}data${path.sep}`)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    res.writeHead(200, { "Content-Type": contentType(filePath) });
    res.end(content);
  });
}

function openLiveStream(req, res, userId) {
  const clientId = uid("live");

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("retry: 2000\n\n");
  res.write(`event: ready\ndata: ${JSON.stringify({ userId })}\n\n`);

  const heartbeat = setInterval(() => {
    res.write(`event: ping\ndata: ${JSON.stringify({ time: Date.now() })}\n\n`);
  }, 25000);

  liveClients.set(clientId, { res, userId, heartbeat });

  req.on("close", () => {
    clearInterval(heartbeat);
    liveClients.delete(clientId);
  });
}

function broadcast(type, payload = {}) {
  const event = `event: ${type}\ndata: ${JSON.stringify({ ...payload, time: Date.now() })}\n\n`;

  for (const [clientId, client] of liveClients.entries()) {
    if (Array.isArray(payload.members) && !payload.members.includes(client.userId)) {
      continue;
    }

    try {
      client.res.write(event);
    } catch {
      clearInterval(client.heartbeat);
      liveClients.delete(clientId);
    }
  }
}

function ensureDatabase() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) writeDb(emptyDb);
}

function readDb() {
  try {
    return normalizeDb({ ...emptyDb, ...JSON.parse(fs.readFileSync(DB_FILE, "utf8")) });
  } catch {
    return normalizeDb({ ...emptyDb });
  }
}

function writeDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function ensureIrisBot(db) {
  let bot = db.users.find((user) => user.id === IRIS_BOT_ID || user.username === IRIS_BOT_USERNAME);
  if (!bot) {
    bot = {
      id: IRIS_BOT_ID,
      fullName: "Iris Bot",
      username: IRIS_BOT_USERNAME,
      age: 1,
      email: "irisbot@closebook.local",
      passwordHash: "",
      bio: "Default Closebook group moderation bot.",
      website: "",
      karma: 100,
      votedUsers: {},
      karmaVoteTimes: {},
      following: [],
      followers: [],
      savedPosts: [],
      isModerator: false,
      moderation: defaultModeration(),
      registeredIp: "system",
      lastIp: "system",
      isBot: true,
      botOwnerId: IRIS_OWNER_ID,
      botCommunity: true,
      botFeatures: { irisCore: true, autoWelcome: true, antiSpam: true },
      createdAt: Date.now(),
    };
    db.users.push(bot);
  } else {
    bot.id = IRIS_BOT_ID;
    bot.fullName = bot.fullName || "Iris Bot";
    bot.username = IRIS_BOT_USERNAME;
    bot.email = bot.email || "irisbot@closebook.local";
    bot.bio = bot.bio || "Default Closebook group moderation bot.";
  }

  bot.isBot = true;
  bot.isModerator = false;
  bot.botOwnerId = IRIS_OWNER_ID;
  bot.botCommunity = true;
  bot.botFeatures = { ...defaultBotFeatures(), ...(bot.botFeatures || {}), irisCore: true, autoWelcome: true, antiSpam: true };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 6_000_000) {
        req.destroy();
        reject(new Error("Request body too large."));
      }
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

function requireUser(res, user) {
  if (user) return true;
  sendJson(res, 401, { error: "Please login first." });
  return false;
}

function getSession(req, db) {
  const authToken = getBearerToken(req);
  if (!authToken) return null;
  return db.sessions.find((session) => session.token === authToken) || null;
}

function getAdminSession(req, db) {
  const authToken = getBearerToken(req);
  if (!authToken) return null;
  return db.adminSessions.find((session) => session.token === authToken) || null;
}

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

function publicUser(user) {
  if (!user) return null;

  return {
    id: user.id,
    fullName: user.fullName,
    username: user.username,
    bio: user.bio || "",
    website: user.website || "",
    karma: user.karma,
    votedUsers: user.votedUsers || {},
    karmaVoteTimes: user.karmaVoteTimes || {},
    following: user.following || [],
    followers: user.followers || [],
    savedPosts: user.savedPosts || [],
    isBot: Boolean(user.isBot),
    botOwnerId: user.botOwnerId || "",
    botCommunity: Boolean(user.botCommunity),
    botFeatures: { ...defaultBotFeatures(), ...(user.botFeatures || {}) },
    isModerator: Boolean(user.isModerator),
    createdAt: user.createdAt,
  };
}

function adminUser(user) {
  if (!user) return null;

  return {
    ...publicUser(user),
    age: user.age,
    email: user.email,
    registeredIp: user.registeredIp || "",
    lastIp: user.lastIp || "",
    moderation: user.moderation || defaultModeration(),
    passwordHash: undefined,
  };
}

function findDirectChat(db, firstUserId, secondUserId) {
  return db.chats.find(
    (chat) =>
      chat.direct &&
      chat.members.length === 2 &&
      chat.members.includes(firstUserId) &&
      chat.members.includes(secondUserId),
  );
}

function isChatAdmin(chat, userId) {
  return chat.creatorId === userId || (chat.admins || []).includes(userId);
}

function defaultModeration() {
  return {
    banned: false,
    muted: false,
    chatRestricted: false,
    appRestricted: false,
    reason: "",
    updatedAt: 0,
    strikes: [],
  };
}

function isUserBlockedFromApp(user) {
  return Boolean(user?.moderation?.banned || user?.moderation?.appRestricted);
}

function isMuted(user) {
  return Boolean(user?.moderation?.muted || isUserBlockedFromApp(user));
}

function isChatRestricted(user) {
  return Boolean(user?.moderation?.chatRestricted || isUserBlockedFromApp(user));
}

function moderationError(user, fallback) {
  const reason = clean(user?.moderation?.reason);
  return reason ? `${fallback} Reason: ${reason}` : fallback;
}

function moderationNotificationText(current, previous) {
  const actions = [];
  if (current.banned && !previous.banned) actions.push("your account was banned");
  if (current.appRestricted && !previous.appRestricted) actions.push("your whole app access was restricted");
  if (current.muted && !previous.muted) actions.push("you were muted from posting and commenting");
  if (current.chatRestricted && !previous.chatRestricted) actions.push("you were restricted from messaging");

  const lifted = [];
  if (!current.banned && previous.banned) lifted.push("account ban removed");
  if (!current.appRestricted && previous.appRestricted) lifted.push("app restriction removed");
  if (!current.muted && previous.muted) lifted.push("posting mute removed");
  if (!current.chatRestricted && previous.chatRestricted) lifted.push("chat restriction removed");

  if (!actions.length && !lifted.length) return "";

  const actionText = actions.length ? `Admin strike: ${actions.join(", ")}.` : `Admin update: ${lifted.join(", ")}.`;
  return current.reason ? `${actionText} Reason: ${current.reason}` : actionText;
}

function addSystemMessage(chat, body) {
  chat.messages.push({
    id: uid("message"),
    authorId: "system",
    body,
    replyTo: "",
    reactions: {},
    system: true,
    createdAt: Date.now(),
  });
}

function addBotMessage(chat, body, botId = IRIS_BOT_ID) {
  chat.messages.push({
    id: uid("message"),
    authorId: botId,
    body,
    replyTo: "",
    reactions: {},
    system: false,
    createdAt: Date.now(),
  });
}

function defaultChatModeration() {
  return {
    rules: "",
    welcome: "",
    locked: false,
    slowModeSeconds: 0,
    lastMessageAt: {},
    bannedUserIds: [],
    mutedUntil: {},
    warnings: {},
  };
}

function defaultBotFeatures() {
  return {
    irisCore: false,
    autoWelcome: false,
    antiSpam: false,
  };
}

function activeModerationBot(db, chat) {
  return db.users.find(
    (user) =>
      user.isBot &&
      user.botFeatures?.irisCore &&
      chat.members.includes(user.id) &&
      isChatAdmin(chat, user.id),
  );
}

function visibleBotInChat(db, chat) {
  return (
    activeModerationBot(db, chat) ||
    db.users.find((user) => user.isBot && user.botFeatures?.irisCore && chat.members.includes(user.id)) ||
    db.users.find((user) => user.id === IRIS_BOT_ID)
  );
}

function isGroupMuted(chat, userId) {
  const mutedUntil = Number(chat.moderation?.mutedUntil?.[userId] || 0);
  if (!mutedUntil) return false;
  if (mutedUntil > Date.now()) return true;
  delete chat.moderation.mutedUntil[userId];
  return false;
}

function handleIrisCommand(db, chat, actor, text) {
  const bot = activeModerationBot(db, chat);
  const visibleBot = visibleBotInChat(db, chat);
  const botId = bot?.id || visibleBot?.id || IRIS_BOT_ID;
  const botName = bot?.fullName || visibleBot?.fullName || "Iris Bot";

  if (!bot) {
    addBotMessage(chat, `${botName} is not active yet. Add a bot with Iris Core to this group and make it admin first.`, botId);
    return true;
  }

  const [commandRaw, ...restParts] = text.split(/\s+/);
  const command = commandRaw.toLowerCase();
  const rest = text.slice(commandRaw.length).trim();
  const actorIsAdmin = isChatAdmin(chat, actor.id);
  const target = findMentionedUser(db, rest);

  if (command === "/help") {
    addBotMessage(
      chat,
      `${botName} commands: /help, /status, /rules, /set rules <rules>, /welcome <message>, /welcome off, /lock, /unlock, /slowmode <seconds|off>, /ban @user, /unban @user, /kick @user, /mute @user <minutes>, /warn @user, /warnings @user, /clear warnings @user, /clear all warnings, /purge <1-50>.`,
      bot.id,
    );
    return true;
  }

  if (command === "/status") {
    addBotMessage(
      chat,
      `${botName} status:\nLock: ${chat.moderation.locked ? "on" : "off"}\nSlow mode: ${
        chat.moderation.slowModeSeconds ? `${chat.moderation.slowModeSeconds}s` : "off"
      }\nRules: ${chat.moderation.rules ? "set" : "not set"}\nWelcome: ${chat.moderation.welcome ? "set" : "off"}`,
      bot.id,
    );
    return true;
  }

  if (command === "/rules") {
    addBotMessage(chat, chat.moderation.rules ? `Group rules:\n${chat.moderation.rules}` : "No group rules have been set yet.", bot.id);
    return true;
  }

  if (!actorIsAdmin) {
    addBotMessage(chat, "Only group admins can use moderation commands.", bot.id);
    return true;
  }

  if (command === "/set") {
    const rules = text.replace(/^\/set\s+rules\s*/i, "").trim();
    if (!/^\/set\s+rules\b/i.test(text) || !rules) {
      addBotMessage(chat, "Use: /set rules <rules>. Rules can be multiple lines.", bot.id);
      return true;
    }
    chat.moderation.rules = rules;
    addBotMessage(chat, `Group rules updated:\n${rules}`, bot.id);
    return true;
  }

  if (command === "/welcome") {
    if (!rest || rest.toLowerCase() === "off") {
      chat.moderation.welcome = "";
      addBotMessage(chat, "Welcome message disabled.", bot.id);
      return true;
    }
    chat.moderation.welcome = rest.slice(0, 600);
    addBotMessage(chat, `Welcome message updated:\n${chat.moderation.welcome}`, bot.id);
    return true;
  }

  if (command === "/lock") {
    chat.moderation.locked = true;
    addBotMessage(chat, "Group locked. Only admins can send messages.", bot.id);
    return true;
  }

  if (command === "/unlock") {
    chat.moderation.locked = false;
    addBotMessage(chat, "Group unlocked. Members can send messages again.", bot.id);
    return true;
  }

  if (command === "/slowmode") {
    if (!rest || rest.toLowerCase() === "off" || rest === "0") {
      chat.moderation.slowModeSeconds = 0;
      addBotMessage(chat, "Slow mode disabled.", bot.id);
      return true;
    }
    const seconds = Math.min(3600, Math.max(5, Number.parseInt(rest, 10) || 0));
    chat.moderation.slowModeSeconds = seconds;
    addBotMessage(chat, `Slow mode set to ${seconds} seconds for non-admins.`, bot.id);
    return true;
  }

  if (command === "/purge") {
    const count = Math.min(50, Math.max(1, Number.parseInt(rest, 10) || 0));
    if (!count) {
      addBotMessage(chat, "Use: /purge <1-50>.", bot.id);
      return true;
    }
    let removed = 0;
    for (let index = chat.messages.length - 1; index >= 0 && removed < count; index -= 1) {
      const message = chat.messages[index];
      if (message.authorId === bot.id || message.system) continue;
      chat.messages.splice(index, 1);
      removed += 1;
    }
    addBotMessage(chat, `Purged ${removed} recent member message${removed === 1 ? "" : "s"}.`, bot.id);
    return true;
  }

  if (command === "/clear") {
    if (/^all\s+warnings$/i.test(rest)) {
      chat.moderation.warnings = {};
      addBotMessage(chat, "All warnings cleared.", bot.id);
      return true;
    }
    if (/^warnings\b/i.test(rest) && target) {
      chat.moderation.warnings[target.id] = 0;
      addBotMessage(chat, `Warnings cleared for @${target.username}.`, bot.id);
      return true;
    }
    addBotMessage(chat, "Use: /clear warnings @user or /clear all warnings.", bot.id);
    return true;
  }

  if (!["/ban", "/unban", "/kick", "/mute", "/warn", "/warnings"].includes(command)) {
    addBotMessage(chat, "Unknown command. Type /help to see bot commands.", bot.id);
    return true;
  }

  if (!target) {
    addBotMessage(chat, "Mention a valid user with @username.", bot.id);
    return true;
  }

  if (target.id === bot.id) {
    addBotMessage(chat, "I cannot moderate myself.", bot.id);
    return true;
  }

  if (target.id === chat.creatorId && command !== "/warnings") {
    addBotMessage(chat, "I cannot moderate the group creator.", bot.id);
    return true;
  }

  if (isChatAdmin(chat, target.id) && !["/warnings", "/unban"].includes(command)) {
    addBotMessage(chat, "I cannot moderate another admin. Remove their admin role first.", bot.id);
    return true;
  }

  if (!chat.members.includes(target.id) && !["/ban", "/unban", "/warnings"].includes(command)) {
    addBotMessage(chat, `@${target.username} is not currently in this group.`, bot.id);
    return true;
  }

  if (command === "/warnings") {
    addBotMessage(chat, `@${target.username} has ${chat.moderation.warnings[target.id] || 0}/3 warnings.`, bot.id);
    return true;
  }

  if (command === "/unban") {
    chat.moderation.bannedUserIds = chat.moderation.bannedUserIds.filter((id) => id !== target.id);
    chat.moderation.warnings[target.id] = 0;
    addBotMessage(chat, `@${target.username} has been unbanned.`, bot.id);
    return true;
  }

  if (command === "/ban") {
    if (!chat.moderation.bannedUserIds.includes(target.id)) chat.moderation.bannedUserIds.push(target.id);
    removeChatMember(chat, target.id);
    addBotMessage(chat, `@${target.username} has been banned and removed from the group.`, bot.id);
    return true;
  }

  if (command === "/kick") {
    removeChatMember(chat, target.id);
    addBotMessage(chat, `@${target.username} has been kicked from the group.`, bot.id);
    return true;
  }

  if (command === "/mute") {
    const minutes = Math.max(1, Math.min(1440, Number(restParts.at(-1)) || 10));
    chat.moderation.mutedUntil[target.id] = Date.now() + minutes * 60_000;
    addBotMessage(chat, `@${target.username} has been muted for ${minutes} minute${minutes === 1 ? "" : "s"}.`, bot.id);
    return true;
  }

  if (command === "/warn") {
    const warnings = (chat.moderation.warnings[target.id] || 0) + 1;
    chat.moderation.warnings[target.id] = warnings;
    if (warnings >= 3) {
      removeChatMember(chat, target.id);
      chat.moderation.warnings[target.id] = 0;
      addBotMessage(chat, `@${target.username} reached 3 warnings and was kicked from the group.`, bot.id);
    } else {
      addBotMessage(chat, `@${target.username} has been warned (${warnings}/3).`, bot.id);
    }
    return true;
  }

  return true;
}

function removeChatMember(chat, userId) {
  chat.members = chat.members.filter((id) => id !== userId);
  chat.admins = chat.admins.filter((id) => id !== userId);
}

function findMentionedUser(db, text) {
  const match = String(text || "").match(/@([a-zA-Z0-9_]{2,30})/);
  if (!match) return null;
  return db.users.find((user) => user.username.toLowerCase() === match[1].toLowerCase()) || null;
}

function normalizeDb(db) {
  db.users = Array.isArray(db.users) ? db.users : [];
  db.posts = Array.isArray(db.posts) ? db.posts : [];
  db.chats = Array.isArray(db.chats) ? db.chats : [];
  db.notifications = Array.isArray(db.notifications) ? db.notifications : [];
  db.sessions = Array.isArray(db.sessions) ? db.sessions : [];
  db.adminSessions = Array.isArray(db.adminSessions) ? db.adminSessions : [];
  db.reports = Array.isArray(db.reports) ? db.reports : [];
  db.ipBans = Array.isArray(db.ipBans) ? db.ipBans : [];
  ensureIrisBot(db);

  db.users.forEach((user) => {
    user.karma = Number(user.karma || 0);
    user.bio = user.bio || "";
    user.website = user.website || "";
    user.votedUsers = user.votedUsers || {};
    user.karmaVoteTimes = user.karmaVoteTimes || {};
    user.following = Array.isArray(user.following) ? user.following : [];
    user.followers = Array.isArray(user.followers) ? user.followers : [];
    user.savedPosts = Array.isArray(user.savedPosts) ? user.savedPosts : [];
    user.isBot = Boolean(user.isBot);
    user.botOwnerId = user.botOwnerId || "";
    user.botCommunity = Boolean(user.botCommunity || user.isBot);
    user.botFeatures = { ...defaultBotFeatures(), ...(user.botFeatures || {}) };
    user.isModerator = Boolean(user.isModerator);
    user.moderation = { ...defaultModeration(), ...(user.moderation || {}) };
    user.moderation.strikes = Array.isArray(user.moderation.strikes) ? user.moderation.strikes : [];
    user.registeredIp = user.registeredIp || "";
    user.lastIp = user.lastIp || user.registeredIp || "";
  });

  db.posts.forEach((post) => {
    post.likes = Array.isArray(post.likes) ? post.likes : [];
    post.shares = Array.isArray(post.shares) ? post.shares : [];
    post.comments = Array.isArray(post.comments) ? post.comments : [];
    post.imageData = post.imageData || "";
  });

  db.chats.forEach((chat) => {
    chat.direct = Boolean(chat.direct);
    chat.creatorId = chat.creatorId || chat.members?.[0] || "";
    chat.admins = Array.isArray(chat.admins) ? chat.admins : chat.direct ? [] : [chat.creatorId].filter(Boolean);
    chat.members = Array.isArray(chat.members) ? chat.members : [];
    chat.moderation = { ...defaultChatModeration(), ...(chat.moderation || {}) };
    chat.moderation.bannedUserIds = Array.isArray(chat.moderation.bannedUserIds) ? chat.moderation.bannedUserIds : [];
    chat.moderation.mutedUntil = chat.moderation.mutedUntil && typeof chat.moderation.mutedUntil === "object" ? chat.moderation.mutedUntil : {};
    chat.moderation.warnings = chat.moderation.warnings && typeof chat.moderation.warnings === "object" ? chat.moderation.warnings : {};
    chat.moderation.lastMessageAt = chat.moderation.lastMessageAt && typeof chat.moderation.lastMessageAt === "object" ? chat.moderation.lastMessageAt : {};
    chat.moderation.locked = Boolean(chat.moderation.locked);
    chat.moderation.slowModeSeconds = Math.max(0, Number(chat.moderation.slowModeSeconds || 0));
    chat.moderation.welcome = chat.moderation.welcome || "";
    chat.messages = Array.isArray(chat.messages) ? chat.messages : [];
    chat.messages.forEach((message) => {
      message.replyTo = message.replyTo || "";
      message.reactions = message.reactions && typeof message.reactions === "object" ? message.reactions : {};
      message.system = Boolean(message.system);
      message.type = message.type || "text";
      message.mediaData = message.mediaData || "";
    });
    chat.readBy = chat.readBy || {};
  });

  return db;
}

function getClientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.socket.remoteAddress || "unknown";
}

function isIpBanned(db, ip) {
  return Boolean(ip && db.ipBans.some((ban) => ban.ip === ip));
}

function addIpBan(db, ip, reason, createdBy) {
  if (!ip || isIpBanned(db, ip)) return;
  db.ipBans.push({
    ip,
    reason,
    createdBy,
    createdAt: Date.now(),
  });
}

function findReportTarget(db, targetType, targetId) {
  if (targetType === "user") {
    const user = db.users.find((item) => item.id === targetId);
    return { exists: Boolean(user), userId: user?.id || "" };
  }

  if (targetType === "post") {
    const post = db.posts.find((item) => item.id === targetId);
    return { exists: Boolean(post), userId: post?.authorId || "" };
  }

  if (targetType === "chat") {
    const chat = db.chats.find((item) => item.id === targetId);
    return { exists: Boolean(chat), userId: chat?.creatorId || "" };
  }

  for (const chat of db.chats) {
    const message = chat.messages.find((item) => item.id === targetId);
    if (message) return { exists: true, userId: message.authorId === "system" ? "" : message.authorId };
  }

  return { exists: false, userId: "" };
}

function reportPreview(db, report) {
  if (report.targetType === "user") {
    const user = db.users.find((item) => item.id === report.targetId);
    return user ? `@${user.username} - ${user.fullName}` : "Deleted user";
  }

  if (report.targetType === "post") {
    const post = db.posts.find((item) => item.id === report.targetId);
    return post ? post.body || "Photo post" : "Deleted post";
  }

  if (report.targetType === "chat") {
    const chat = db.chats.find((item) => item.id === report.targetId);
    return chat ? chat.name || "Direct chat" : "Deleted chat";
  }

  for (const chat of db.chats) {
    const message = chat.messages.find((item) => item.id === report.targetId);
    if (message) return message.body;
  }

  return "Deleted message";
}

function notifyMentions(db, options) {
  const mentionedUsers = extractMentionedUsers(db, options.text, options.allowedUserIds);

  mentionedUsers.forEach((user) => {
    addNotification(db, {
      userId: user.id,
      actorId: options.actor.id,
      type: options.type,
      text: options.message,
      postId: options.postId,
      commentId: options.commentId,
      chatId: options.chatId,
      messageId: options.messageId,
    });
  });
}

function extractMentionedUsers(db, text, allowedUserIds = null) {
  const allowed = Array.isArray(allowedUserIds) ? new Set(allowedUserIds) : null;
  const usernames = new Set(
    Array.from(String(text || "").matchAll(/(^|[^a-zA-Z0-9_])@([a-zA-Z0-9_]{2,30})/g)).map((match) =>
      match[2].toLowerCase(),
    ),
  );

  if (!usernames.size) return [];

  return db.users.filter((user) => usernames.has(user.username.toLowerCase()) && (!allowed || allowed.has(user.id)));
}

function formatDuration(ms) {
  const totalMinutes = Math.max(1, Math.ceil(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  if (!minutes) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${hours} hour${hours === 1 ? "" : "s"} ${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function addNotification(db, notification) {
  if (!notification.userId || notification.userId === notification.actorId) return;

  db.notifications.push({
    id: uid("notification"),
    read: false,
    createdAt: Date.now(),
    ...notification,
  });
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function uid(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
}

function clean(value) {
  return String(value || "").trim();
}

function toggleId(list, id) {
  const index = list.indexOf(id);
  if (index >= 0) {
    list.splice(index, 1);
  } else {
    list.push(id);
  }
}

function lastActivity(chat) {
  return chat.messages.at(-1)?.createdAt || chat.createdAt;
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

function contentType(filePath) {
  const extension = path.extname(filePath);
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
  };

  return types[extension] || "application/octet-stream";
}
