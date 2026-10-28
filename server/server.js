const crypto = require("crypto");
const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === "production";
const sessionCookieName = "decideless_session";
const sessionDurationMs = 7 * 24 * 60 * 60 * 1000;
const jwtSecret = process.env.JWT_SECRET || (isProduction ? "" : crypto.randomBytes(32).toString("hex"));

if (!jwtSecret) {
  throw new Error("JWT_SECRET must be set in the environment when NODE_ENV=production");
}

if (!process.env.JWT_SECRET) {
  console.warn("JWT_SECRET is temporary; existing sign-ins will expire when the server restarts.");
}

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false }
  },
  { timestamps: true }
);

const taskSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    priority: { type: String, enum: ["High", "Medium", "Low"], default: "Medium" },
    completed: { type: Boolean, default: false }
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);
const Task = mongoose.model("Task", taskSchema);

app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "../client/dist")));

function cookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/"
  };
}

function createSession(res, user) {
  const token = jwt.sign({ sub: user._id.toString() }, jwtSecret, { expiresIn: "7d" });
  res.cookie(sessionCookieName, token, { ...cookieOptions(), maxAge: sessionDurationMs });
}

function publicUser(user) {
  return { id: user._id, name: user.name, email: user.email };
}

function databaseRequired(req, res, next) {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      success: false,
      message: "Database unavailable. Start MongoDB and try again."
    });
  }
  next();
}

async function requireAuth(req, res, next) {
  const token = req.cookies[sessionCookieName];
  if (!token) {
    return res.status(401).json({ success: false, message: "Please sign in to continue." });
  }

  try {
    const payload = jwt.verify(token, jwtSecret);
    if (typeof payload !== "object" || typeof payload.sub !== "string") {
      throw new Error("Invalid session");
    }

    const user = await User.findById(payload.sub).select("_id name email");
    if (!user) {
      res.clearCookie(sessionCookieName, cookieOptions());
      return res.status(401).json({ success: false, message: "Please sign in to continue." });
    }
    req.user = user;
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError" || error.name === "CastError") {
      res.clearCookie(sessionCookieName, cookieOptions());
      return res.status(401).json({ success: false, message: "Your session has expired. Please sign in again." });
    }
    next(error);
  }
}

app.get("/api/health", (req, res) => {
  res.json({ success: true, database: mongoose.connection.readyState === 1 ? "connected" : "disconnected" });
});

app.post("/api/auth/register", databaseRequired, async (req, res) => {
  const { name, email, password } = req.body;
  const cleanName = typeof name === "string" ? name.trim() : "";
  const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

  if (!cleanName || cleanName.length > 60) {
    return res.status(400).json({ success: false, message: "Name is required and must be 60 characters or fewer." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || cleanEmail.length > 254) {
    return res.status(400).json({ success: false, message: "Enter a valid email address." });
  }
  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    return res.status(400).json({ success: false, message: "Password must be between 8 and 128 characters." });
  }

  try {
    const user = await User.create({
      name: cleanName,
      email: cleanEmail,
      passwordHash: await bcrypt.hash(password, 12)
    });
    createSession(res, user);
    res.status(201).json({ success: true, data: publicUser(user) });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: "An account with that email already exists." });
    }
    console.error("Could not register account:", error.message);
    res.status(500).json({ success: false, message: "Could not create your account. Please try again." });
  }
});

app.post("/api/auth/login", databaseRequired, async (req, res) => {
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body.password === "string" ? req.body.password : "";

  try {
    const user = await User.findOne({ email }).select("+passwordHash");
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ success: false, message: "Email or password is incorrect." });
    }
    createSession(res, user);
    res.json({ success: true, data: publicUser(user) });
  } catch (error) {
    console.error("Could not sign in:", error.message);
    res.status(500).json({ success: false, message: "Could not sign in. Please try again." });
  }
});

app.get("/api/auth/me", databaseRequired, requireAuth, (req, res) => {
  res.json({ success: true, data: publicUser(req.user) });
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie(sessionCookieName, cookieOptions());
  res.json({ success: true });
});

app.use("/api/tasks", databaseRequired, requireAuth);

app.get("/api/tasks", async (req, res) => {
  try {
    const tasks = await Task.find({ owner: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, data: tasks });
  } catch (error) {
    console.error("Could not load tasks:", error.message);
    res.status(500).json({ success: false, message: "Could not load tasks." });
  }
});

app.post("/api/tasks", async (req, res) => {
  const { title, priority } = req.body;
  if (typeof title !== "string" || !title.trim() || title.trim().length > 120) {
    return res.status(400).json({ success: false, message: "Task title is required and must be 120 characters or fewer." });
  }
  if (priority !== undefined && !["High", "Medium", "Low"].includes(priority)) {
    return res.status(400).json({ success: false, message: "Invalid priority." });
  }

  try {
    const task = await Task.create({
      owner: req.user._id,
      title: title.trim(),
      priority: priority || "Medium"
    });
    res.status(201).json({ success: true, data: task });
  } catch (error) {
    console.error("Could not add task:", error.message);
    res.status(500).json({ success: false, message: "Could not add task." });
  }
});

app.patch("/api/tasks/:id", async (req, res) => {
  const updates = {};
  const { title, priority, completed } = req.body;
  if (title !== undefined) {
    if (typeof title !== "string" || !title.trim() || title.trim().length > 120) {
      return res.status(400).json({ success: false, message: "Enter a valid task title." });
    }
    updates.title = title.trim();
  }
  if (priority !== undefined) {
    if (!["High", "Medium", "Low"].includes(priority)) {
      return res.status(400).json({ success: false, message: "Invalid priority." });
    }
    updates.priority = priority;
  }
  if (completed !== undefined) {
    if (typeof completed !== "boolean") {
      return res.status(400).json({ success: false, message: "Completed must be true or false." });
    }
    updates.completed = completed;
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ success: false, message: "No valid updates provided." });
  }

  try {
    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, owner: req.user._id },
      updates,
      { new: true, runValidators: true }
    );
    if (!task) {
      return res.status(404).json({ success: false, message: "Task not found." });
    }
    res.json({ success: true, data: task });
  } catch (error) {
    res.status(error.name === "CastError" ? 400 : 500).json({
      success: false,
      message: error.name === "CastError" ? "Invalid task ID." : "Could not update task."
    });
  }
});

app.delete("/api/tasks/:id", async (req, res) => {
  try {
    const task = await Task.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
    if (!task) {
      return res.status(404).json({ success: false, message: "Task not found." });
    }
    res.json({ success: true, message: "Task deleted." });
  } catch (error) {
    res.status(error.name === "CastError" ? 400 : 500).json({
      success: false,
      message: error.name === "CastError" ? "Invalid task ID." : "Could not delete task."
    });
  }
});

app.listen(PORT, () => {
  console.log(`DecideLess server running at http://localhost:${PORT}`);
  if (!process.env.MONGODB_URI) {
    console.error("Task storage unavailable: MONGODB_URI is missing from the .env file.");
    return;
  }
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log("MongoDB connected successfully"))
    .catch((error) => console.error("Task storage unavailable:", error.message));
});
