const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "database.json");

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
      following: [],
      followers: [],
      savedPosts: [],
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
    if (post.authorId !== currentUser.id) return sendJson(res, 403, { error: "You can only delete your own posts." });

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

    const previousVote = currentUser.votedUsers[target.id] || 0;
    target.karma += vote - previousVote;
    currentUser.votedUsers[target.id] = vote;
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
    if (!chat.members.includes(userId)) chat.members.push(userId);

    addSystemMessage(chat, `${currentUser.username} added ${user.username}.`);
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
    const replyTo = clean(body.replyTo);

    if (!chat || !chat.members.includes(currentUser.id)) {
      return sendJson(res, 404, { error: "Chat not found." });
    }
    if (isChatRestricted(currentUser)) return sendJson(res, 403, { error: moderationError(currentUser, "You cannot send messages at the moment.") });
    if (!text) return sendJson(res, 400, { error: "Message cannot be empty." });

    const message = {
      id: uid("message"),
      authorId: currentUser.id,
      body: text,
      replyTo: chat.messages.some((message) => message.id === replyTo) ? replyTo : "",
      reactions: {},
      createdAt: Date.now(),
    };
    chat.messages.push(message);
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

  const reactionAction = url.pathname.match(/^\/api\/chats\/([^/]+)\/messages\/([^/]+)\/reactions$/);
  if (req.method === "POST" && reactionAction) {
    const body = await readBody(req);
    const chat = db.chats.find((item) => item.id === reactionAction[1]);
    const reaction = clean(body.reaction);
    const allowedReactions = ["Like", "Wow", "Boost", "Agree"];

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
    broadcast("chat", { actorId: currentUser.id, chatId: chat.id, members: [currentUser.id] });

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
    broadcast("social", { actorId: user.id, members: [user.id] });
    broadcast("chat", { actorId: user.id, members: [user.id] });

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
    age: user.age,
    email: user.email,
    bio: user.bio || "",
    website: user.website || "",
    karma: user.karma,
    votedUsers: user.votedUsers || {},
    following: user.following || [],
    followers: user.followers || [],
    savedPosts: user.savedPosts || [],
    createdAt: user.createdAt,
  };
}

function adminUser(user) {
  if (!user) return null;

  return {
    ...publicUser(user),
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

function normalizeDb(db) {
  db.users = Array.isArray(db.users) ? db.users : [];
  db.posts = Array.isArray(db.posts) ? db.posts : [];
  db.chats = Array.isArray(db.chats) ? db.chats : [];
  db.notifications = Array.isArray(db.notifications) ? db.notifications : [];
  db.sessions = Array.isArray(db.sessions) ? db.sessions : [];
  db.adminSessions = Array.isArray(db.adminSessions) ? db.adminSessions : [];
  db.reports = Array.isArray(db.reports) ? db.reports : [];
  db.ipBans = Array.isArray(db.ipBans) ? db.ipBans : [];

  db.users.forEach((user) => {
    user.karma = Number(user.karma || 0);
    user.bio = user.bio || "";
    user.website = user.website || "";
    user.votedUsers = user.votedUsers || {};
    user.following = Array.isArray(user.following) ? user.following : [];
    user.followers = Array.isArray(user.followers) ? user.followers : [];
    user.savedPosts = Array.isArray(user.savedPosts) ? user.savedPosts : [];
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
    chat.messages = Array.isArray(chat.messages) ? chat.messages : [];
    chat.messages.forEach((message) => {
      message.replyTo = message.replyTo || "";
      message.reactions = message.reactions && typeof message.reactions === "object" ? message.reactions : {};
      message.system = Boolean(message.system);
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
