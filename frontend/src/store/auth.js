import { create } from "zustand";
import { persist } from "zustand/middleware";
import api from "../api/client";
import i18n from "../i18n";

const useAuth = create(
  persist(
    (set, get) => ({
      token: null,
      user: null,

      login: async (username, password) => {
        const res = await api.post("/auth/login", { username, password });
        if (res.data.requires_totp) return res.data;
        const token = res.data.access_token;
        set({ token });
        const me = await api.get("/auth/me", { headers: { Authorization: `Bearer ${token}` } });
        set({ user: me.data });
        i18n.changeLanguage(me.data.language ?? "de");
        return res.data;
      },

      verifyTotp: async (partialToken, code) => {
        const res = await api.post("/auth/totp/verify", { partial_token: partialToken, code });
        const token = res.data.access_token;
        set({ token });
        const me = await api.get("/auth/me", { headers: { Authorization: `Bearer ${token}` } });
        set({ user: me.data });
        i18n.changeLanguage(me.data.language ?? "de");
      },

      logout: () => set({ token: null, user: null }),

      refreshUser: async () => {
        try {
          const me = await api.get("/auth/me");
          set({ user: me.data });
          i18n.changeLanguage(me.data.language ?? "de");
        } catch {
          set({ token: null, user: null });
        }
      },
    }),
    { name: "overterm-auth", partialize: (s) => ({ token: s.token }) }
  )
);

export default useAuth;
