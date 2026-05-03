import axios from "axios";

const api = axios.create({ baseURL: "/api" });

api.interceptors.request.use((config) => {
  // Inject token from localStorage (Zustand persist)
  try {
    const stored = JSON.parse(localStorage.getItem("overterm-auth") || "{}");
    const token = stored?.state?.token;
    if (token) config.headers.Authorization = `Bearer ${token}`;
  } catch {}
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("overterm-auth");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export default api;
