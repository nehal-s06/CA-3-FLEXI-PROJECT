import React, { useEffect, useMemo, useState } from "react";

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers
    }
  });
  const result = await response.json();

  if (!response.ok || !result.success) {
    const error = new Error(result.message || "Something went wrong. Please try again.");
    error.status = response.status;
    throw error;
  }
  return result;
}

function AuthPage({ onSignedIn, notice }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState(notice);
  const [busy, setBusy] = useState(false);
  const isRegister = mode === "register";

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    setBusy(true);
    try {
      const result = await request(`/api/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify({ name, email, password })
      });
      onSignedIn(result.data);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  function changeMode(nextMode) {
    setMode(nextMode);
    setMessage("");
  }

  return (
    <main className="auth-layout">
      <section className="welcome-panel">
        <a className="wordmark wordmark-light" href="/" aria-label="DecideLess home"><span className="brand-mark">D</span> DECIDELESS</a>
        <div className="welcome-copy">
          <p className="eyebrow eyebrow-light">Your journey begins here</p>
          <h1>Every day<br />is a new quest.</h1>
          <p>Choose your next objective, build your streak, and make progress one mission at a time.</p>
        </div>
        <div className="welcome-footer"><span className="status-dot" /> QUEST SYSTEM <span>•</span> READY</div>
      </section>

      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="auth-card">
          <div className="mobile-mark"><a className="wordmark" href="/"><span className="brand-mark">D</span><span className="brand-name">DECIDELESS</span></a></div>
          <p className="eyebrow">{isRegister ? "Create your player profile" : "Identity verified"}</p>
          <h2 id="auth-title">{isRegister ? "Begin your journey" : "Welcome back, player"}</h2>
          <p className="auth-subtitle">
            {isRegister ? "Set up your profile and start your first quest." : "Your next objective is waiting."}
          </p>

          <form className="auth-form" onSubmit={handleSubmit}>
            {isRegister && (
              <label>
                Your name
                <input
                  autoComplete="name"
                  maxLength="60"
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Taylor Morgan"
                  required
                  value={name}
                />
              </label>
            )}
            <label>
              Email address
              <input
                autoComplete="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
                type="email"
                value={email}
              />
            </label>
            <label>
              Password
              <input
                autoComplete={isRegister ? "new-password" : "current-password"}
                minLength="8"
                maxLength="128"
                onChange={(event) => setPassword(event.target.value)}
                placeholder={isRegister ? "At least 8 characters" : "Enter your password"}
                required
                type="password"
                value={password}
              />
            </label>
            {message && <p className="form-message" role="alert">{message}</p>}
            <button className="primary-button auth-submit" disabled={busy} type="submit">
              {busy ? "Please wait..." : isRegister ? "Create profile" : "Enter the system"}
              {!busy && <span aria-hidden="true">→</span>}
            </button>
          </form>

          <p className="auth-switch">
            {isRegister ? "Already have an account?" : "New to DecideLess?"}{" "}
            <button type="button" onClick={() => changeMode(isRegister ? "login" : "register")}>
              {isRegister ? "Sign in" : "Create an account"}
            </button>
          </p>
          <p className="privacy-note">Your progress is saved to your private account.</p>
        </div>
      </section>
    </main>
  );
}

function TaskApp({ user, onSignOut, notice }) {
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [activeFilter, setActiveFilter] = useState("all");
  const [message, setMessage] = useState("Loading your tasks...");
  const [hasError, setHasError] = useState(false);
  const [busy, setBusy] = useState(false);
  const today = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(new Date());

  useEffect(() => {
    request("/api/tasks")
      .then((result) => {
        setTasks(result.data);
        setMessage("");
      })
      .catch((error) => {
        setMessage(error.message);
        setHasError(true);
      });
  }, []);

  const visibleTasks = useMemo(() => {
    if (activeFilter === "open") return tasks.filter((task) => !task.completed);
    if (activeFilter === "completed") return tasks.filter((task) => task.completed);
    return tasks;
  }, [activeFilter, tasks]);
  const remaining = tasks.filter((task) => !task.completed).length;
  const completed = tasks.length - remaining;
  const xpEarned = completed * 25;
  const rank = xpEarned >= 500 ? "S" : xpEarned >= 300 ? "A" : xpEarned >= 175 ? "B" : xpEarned >= 75 ? "C" : xpEarned >= 25 ? "D" : "E";
  const nextRankXp = xpEarned >= 300 ? 500 : xpEarned >= 175 ? 300 : xpEarned >= 75 ? 175 : xpEarned >= 25 ? 75 : 25;
  const rankFloorXp = xpEarned >= 500 ? 500 : xpEarned >= 300 ? 300 : xpEarned >= 175 ? 175 : xpEarned >= 75 ? 75 : xpEarned >= 25 ? 25 : 0;
  const rankProgress = xpEarned >= 500
    ? 100
    : Math.round(((xpEarned - rankFloorXp) / (nextRankXp - rankFloorXp)) * 100);

  async function addTask(event) {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    setBusy(true);
    try {
      const result = await request("/api/tasks", {
        method: "POST",
        body: JSON.stringify({ title: cleanTitle, priority })
      });
      setTasks((current) => [result.data, ...current]);
      setTitle("");
      setActiveFilter("all");
      setMessage("");
      setHasError(false);
    } catch (error) {
      setMessage(error.message);
      setHasError(true);
    } finally {
      setBusy(false);
    }
  }

  async function updateTask(task, updates) {
    try {
      const result = await request(`/api/tasks/${task._id}`, {
        method: "PATCH",
        body: JSON.stringify(updates)
      });
      setTasks((current) => current.map((item) => item._id === task._id ? result.data : item));
      setMessage("");
      setHasError(false);
    } catch (error) {
      setMessage(error.message);
      setHasError(true);
    }
  }

  async function deleteTask(task) {
    try {
      await request(`/api/tasks/${task._id}`, { method: "DELETE" });
      setTasks((current) => current.filter((item) => item._id !== task._id));
      setMessage("");
      setHasError(false);
    } catch (error) {
      setMessage(error.message);
      setHasError(true);
    }
  }

  return (
    <main className="app-shell">
      <header className="app-topbar">
        <a className="wordmark" href="/" aria-label="DecideLess home"><span className="brand-mark">D</span><span className="brand-name">DECIDELESS</span></a>
        <div className="system-status"><span className="status-dot" /> SYSTEM ONLINE</div>
        <div className="account-menu">
          <span className="account-greeting">{user.name}</span>
          <span className="account-avatar" aria-hidden="true">{user.name.charAt(0).toUpperCase()}</span>
          <button className="signout-button" onClick={onSignOut} type="button">Exit</button>
        </div>
      </header>

      <section className="app-intro">
        <div className="intro-heading">
          <p className="today">{today}</p>
          <p className="eyebrow">Daily mission log</p>
          <h1>Quest board<span className="title-period">.</span></h1>
          <p className="intro-copy">Pick your next objective. Every completed quest moves you forward.</p>
        </div>
        <div className="companion-stage">
          <div className="companion-aura" aria-hidden="true" />
          <img
            className="companion-art"
            src="/quest-companion.svg"
            alt="A cheerful blue-haired anime adventurer ready to help with your quests"
            onError={(event) => {
              event.currentTarget.hidden = true;
              const fallback = event.currentTarget.nextElementSibling;
              if (fallback) fallback.hidden = false;
            }}
          />
          <p className="companion-fallback" hidden role="status">Companion artwork is unavailable.</p>
        </div>
        <div className="rank-emblem" aria-label={`Current rank ${rank}`}>
          <span className="rank-label">CURRENT RANK</span>
          <span className="rank-letter">{rank}</span>
          <span className="rank-caption">ADVENTURER</span>
        </div>
      </section>

      <section className="stats-grid" aria-label="Your progress">
        <article className="stat-card">
          <span className="stat-icon">◇</span>
          <span className="stat-label">ACTIVE QUESTS</span>
          <strong>{remaining}</strong>
          <span className="stat-detail">Objectives to conquer</span>
        </article>
        <article className="stat-card">
          <span className="stat-icon">✓</span>
          <span className="stat-label">QUESTS CLEARED</span>
          <strong>{completed}</strong>
          <span className="stat-detail">Victories earned</span>
        </article>
        <article className="stat-card xp-stat">
          <span className="stat-icon">✦</span>
          <span className="stat-label">EXPERIENCE</span>
          <strong>{xpEarned}<small> XP</small></strong>
          <span className="xp-track"><span style={{ width: `${rankProgress}%` }} /></span>
          <span className="stat-detail">{Math.max(0, nextRankXp - xpEarned)} XP to next rank</span>
        </article>
      </section>

      <section className="task-panel" aria-label="Your tasks">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Your objectives</p>
            <h2>Quest log <span className="count-badge">{remaining}</span></h2>
          </div>
          <span className="quest-counter">{completed} / {tasks.length} CLEARED</span>
        </div>
        <form className="task-form" onSubmit={addTask}>
          <label className="visually-hidden" htmlFor="task-title">Task name</label>
          <input
            id="task-title"
            maxLength="120"
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Name your next quest..."
            required
            value={title}
          />
          <label className="visually-hidden" htmlFor="task-priority">Priority</label>
          <select id="task-priority" onChange={(event) => setPriority(event.target.value)} value={priority}>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
            <option value="Low">Low</option>
          </select>
          <button className="primary-button add-button" disabled={busy} type="submit">Accept quest <span aria-hidden="true">+</span></button>
        </form>

        <div className="list-heading">
          <div>
            <p className="eyebrow">Mission selection</p>
            <h3>All objectives</h3>
          </div>
          <div className="filters" role="group" aria-label="Filter tasks">
            {[
              ["all", "All"],
              ["open", "Open"],
              ["completed", "Done"]
            ].map(([filter, label]) => (
              <button
                aria-pressed={activeFilter === filter}
                className={`filter-button${activeFilter === filter ? " is-active" : ""}`}
                key={filter}
                onClick={() => setActiveFilter(filter)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {message && <p className={`status${hasError ? " is-error" : ""}`} role="status">{message}</p>}
        {!message && notice && <p className="status is-error" role="alert">{notice}</p>}
        <ul className="task-list">
          {!message && visibleTasks.length === 0 && (
            <li className="empty-state">{tasks.length === 0 ? "No active quests. Add an objective above to begin your journey." : "No quests in this category."}</li>
          )}
          {visibleTasks.map((task) => (
            <li className={`task-item${task.completed ? " is-completed" : ""}`} key={task._id}>
              <label className="quest-check">
                <input
                  aria-label={`Mark ${task.title} ${task.completed ? "open" : "complete"}`}
                  checked={task.completed}
                  onChange={(event) => updateTask(task, { completed: event.target.checked })}
                  type="checkbox"
                />
                <span aria-hidden="true">{task.completed ? "✓" : ""}</span>
              </label>
              <span className="quest-glyph" aria-hidden="true">{task.completed ? "✦" : "◇"}</span>
              <span className="task-title">{task.title}</span>
              <span className={`priority priority-${task.priority.toLowerCase()}`}>{task.priority} priority</span>
              <span className="quest-reward">+25 XP</span>
              <button className="delete-button" onClick={() => deleteTask(task)} type="button" aria-label={`Delete ${task.title}`}>×</button>
            </li>
          ))}
        </ul>
      </section>
      <footer className="page-footer">THE SYSTEM REWARDS PROGRESS. KEEP MOVING FORWARD.</footer>
    </main>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authNotice, setAuthNotice] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    request("/api/auth/me")
      .then((result) => setUser(result.data))
      .catch((error) => {
        setUser(null);
        if (error.status !== 401) setAuthNotice(error.message);
      })
      .finally(() => setCheckingSession(false));
  }, []);

  function signedIn(nextUser) {
    setAuthNotice("");
    setUser(nextUser);
  }

  async function signOut() {
    try {
      await request("/api/auth/logout", { method: "POST" });
      setAuthNotice("");
      setUser(null);
    } catch (error) {
      console.error("Could not sign out:", error);
      setAuthNotice(error.message);
    }
  }

  if (checkingSession) {
    return <main className="loading-screen" role="status">Getting your space ready...</main>;
  }
  return user
    ? <TaskApp user={user} notice={authNotice} onSignOut={signOut} />
    : <AuthPage notice={authNotice} onSignedIn={signedIn} />;
}
