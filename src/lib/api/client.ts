import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from "axios";

/**
 * TaskFlow API client.
 *
 * Frontend-only build: an axios instance with a custom adapter that
 * persists data in localStorage and mimics a real REST backend. Swap
 * the adapter (or change the baseURL) to point at your Express/MySQL
 * server later — the call sites do not need to change.
 *
 * Endpoints implemented:
 *   POST   /auth/register
 *   POST   /auth/login
 *   GET    /auth/me
 *   PATCH  /auth/me
 *   GET    /tasks
 *   POST   /tasks
 *   GET    /tasks/:id
 *   PATCH  /tasks/:id
 *   DELETE /tasks/:id
 *   GET    /dashboard/stats
 */

export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high";

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface Task {
  id: string;
  userId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardStats {
  total: number;
  todo: number;
  inProgress: number;
  done: number;
  overdue: number;
  completionRate: number;
}

const TOKEN_KEY = "taskflow_token";
const USERS_KEY = "taskflow_users";
const TASKS_KEY = "taskflow_tasks";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

interface StoredUser extends User {
  passwordHash: string;
}

// Tiny non-cryptographic hash to *simulate* bcrypt for the demo.
// Replace with real bcrypt when wiring the Express backend.
function pseudoHash(pw: string) {
  let h = 5381;
  for (let i = 0; i < pw.length; i++) h = (h * 33) ^ pw.charCodeAt(i);
  return `mock$${(h >>> 0).toString(16)}`;
}

function makeToken(userId: string) {
  // Mock JWT: header.payload.signature — payload is just base64 userId.
  const payload = btoa(JSON.stringify({ sub: userId, iat: Date.now() }));
  return `mock.${payload}.sig`;
}
function readToken(token: string): string | null {
  try {
    const [, payload] = token.split(".");
    return JSON.parse(atob(payload)).sub as string;
  } catch {
    return null;
  }
}

function uid() {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 9)
  );
}

function ok(data: unknown, status = 200) {
  return {
    data,
    status,
    statusText: "OK",
    headers: {},
    config: {} as InternalAxiosRequestConfig,
  };
}
function err(status: number, message: string) {
  const e = new Error(message) as Error & { response?: unknown };
  e.response = { status, data: { message } };
  throw e;
}

function requireUser(config: InternalAxiosRequestConfig): string {
  const auth = (config.headers?.Authorization as string | undefined) ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const userId = token ? readToken(token) : null;
  if (!userId) err(401, "Unauthorized");
  return userId!;
}

const mockAdapter = async (config: InternalAxiosRequestConfig) => {
  const url = (config.url || "").replace(/^\/+/, "");
  const method = (config.method || "get").toLowerCase();
  const body =
    typeof config.data === "string" ? JSON.parse(config.data) : config.data ?? {};

  // simulate latency
  await new Promise((r) => setTimeout(r, 120));

  // ----- AUTH -----
  if (url === "auth/register" && method === "post") {
    const { name, email, password } = body as {
      name: string;
      email: string;
      password: string;
    };
    if (!name || !email || !password) err(400, "Missing fields");
    const users = read<StoredUser[]>(USERS_KEY, []);
    if (users.some((u) => u.email.toLowerCase() === email.toLowerCase()))
      err(409, "Email already registered");
    const user: StoredUser = {
      id: uid(),
      name,
      email,
      passwordHash: pseudoHash(password),
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    write(USERS_KEY, users);
    const token = makeToken(user.id);
    const { passwordHash: _ph, ...safe } = user;
    return ok({ token, user: safe }, 201);
  }

  if (url === "auth/login" && method === "post") {
    const { email, password } = body as { email: string; password: string };
    const users = read<StoredUser[]>(USERS_KEY, []);
    const user = users.find(
      (u) => u.email.toLowerCase() === email.toLowerCase(),
    );
    if (!user || user.passwordHash !== pseudoHash(password))
      err(401, "Invalid email or password");
    const token = makeToken(user!.id);
    const { passwordHash: _ph, ...safe } = user!;
    return ok({ token, user: safe });
  }

  if (url === "auth/me" && method === "get") {
    const userId = requireUser(config);
    const users = read<StoredUser[]>(USERS_KEY, []);
    const user = users.find((u) => u.id === userId);
    if (!user) err(404, "User not found");
    const { passwordHash: _ph, ...safe } = user!;
    return ok(safe);
  }

  if (url === "auth/me" && method === "patch") {
    const userId = requireUser(config);
    const users = read<StoredUser[]>(USERS_KEY, []);
    const idx = users.findIndex((u) => u.id === userId);
    if (idx < 0) err(404, "User not found");
    const updates = body as Partial<Pick<User, "name" | "email">> & {
      password?: string;
    };
    if (updates.email) users[idx].email = updates.email;
    if (updates.name) users[idx].name = updates.name;
    if (updates.password) users[idx].passwordHash = pseudoHash(updates.password);
    write(USERS_KEY, users);
    const { passwordHash: _ph, ...safe } = users[idx];
    return ok(safe);
  }

  // ----- TASKS -----
  if (url === "tasks" && method === "get") {
    const userId = requireUser(config);
    const tasks = read<Task[]>(TASKS_KEY, []).filter((t) => t.userId === userId);
    return ok(tasks);
  }

  if (url === "tasks" && method === "post") {
    const userId = requireUser(config);
    const tasks = read<Task[]>(TASKS_KEY, []);
    const now = new Date().toISOString();
    const task: Task = {
      id: uid(),
      userId,
      title: body.title,
      description: body.description ?? "",
      status: (body.status as TaskStatus) ?? "todo",
      priority: (body.priority as TaskPriority) ?? "medium",
      dueDate: body.dueDate ?? null,
      createdAt: now,
      updatedAt: now,
    };
    tasks.push(task);
    write(TASKS_KEY, tasks);
    return ok(task, 201);
  }

  const taskMatch = url.match(/^tasks\/([^/]+)$/);
  if (taskMatch) {
    const userId = requireUser(config);
    const id = taskMatch[1];
    const tasks = read<Task[]>(TASKS_KEY, []);
    const idx = tasks.findIndex((t) => t.id === id && t.userId === userId);
    if (idx < 0) err(404, "Task not found");

    if (method === "get") return ok(tasks[idx]);
    if (method === "patch") {
      tasks[idx] = {
        ...tasks[idx],
        ...body,
        id: tasks[idx].id,
        userId: tasks[idx].userId,
        updatedAt: new Date().toISOString(),
      };
      write(TASKS_KEY, tasks);
      return ok(tasks[idx]);
    }
    if (method === "delete") {
      const removed = tasks.splice(idx, 1)[0];
      write(TASKS_KEY, tasks);
      return ok(removed);
    }
  }

  // ----- DASHBOARD -----
  if (url === "dashboard/stats" && method === "get") {
    const userId = requireUser(config);
    const tasks = read<Task[]>(TASKS_KEY, []).filter((t) => t.userId === userId);
    const total = tasks.length;
    const todo = tasks.filter((t) => t.status === "todo").length;
    const inProgress = tasks.filter((t) => t.status === "in_progress").length;
    const done = tasks.filter((t) => t.status === "done").length;
    const now = Date.now();
    const overdue = tasks.filter(
      (t) => t.status !== "done" && t.dueDate && new Date(t.dueDate).getTime() < now,
    ).length;
    const completionRate = total === 0 ? 0 : Math.round((done / total) * 100);
    const stats: DashboardStats = { total, todo, inProgress, done, overdue, completionRate };
    return ok(stats);
  }

  err(404, `Mock endpoint not found: ${method.toUpperCase()} /${url}`);
  return ok(null); // unreachable
};

export const api: AxiosInstance = axios.create({
  baseURL: "/api",
  adapter: mockAdapter as unknown as AxiosInstance["defaults"]["adapter"],
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const tokenStorage = {
  get: () => (typeof window === "undefined" ? null : localStorage.getItem(TOKEN_KEY)),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

// ----- High-level helpers used by the UI -----
export const AuthAPI = {
  register: (input: { name: string; email: string; password: string }) =>
    api.post<{ token: string; user: User }>("/auth/register", input).then((r) => r.data),
  login: (input: { email: string; password: string }) =>
    api.post<{ token: string; user: User }>("/auth/login", input).then((r) => r.data),
  me: () => api.get<User>("/auth/me").then((r) => r.data),
  updateMe: (input: Partial<{ name: string; email: string; password: string }>) =>
    api.patch<User>("/auth/me", input).then((r) => r.data),
};

export const TasksAPI = {
  list: () => api.get<Task[]>("/tasks").then((r) => r.data),
  create: (input: {
    title: string;
    description?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    dueDate?: string | null;
  }) => api.post<Task>("/tasks", input).then((r) => r.data),
  update: (id: string, input: Partial<Task>) =>
    api.patch<Task>(`/tasks/${id}`, input).then((r) => r.data),
  remove: (id: string) => api.delete<Task>(`/tasks/${id}`).then((r) => r.data),
};

export const DashboardAPI = {
  stats: () => api.get<DashboardStats>("/dashboard/stats").then((r) => r.data),
};
