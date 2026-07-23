import { create } from "zustand";
import { persist } from "zustand/middleware";
import api from "../api/client";
import i18n from "../i18n";

const useAuth = create(
  persist(
    (set, get) => ({
      loggedIn: false,
      user: null,

      login: async (username, password) => {
        const res = await api.post("/auth/login", { username, password });
        if (res.data.requires_totp) return res.data;
        set({ loggedIn: true });
        const me = await api.get("/auth/me");
        set({ user: me.data });
        i18n.changeLanguage(me.data.language ?? "de");
        return res.data;
      },

      verifyTotp: async (partialToken, code) => {
        await api.post("/auth/totp/verify", { partial_token: partialToken, code });
        set({ loggedIn: true });
        const me = await api.get("/auth/me");
        set({ user: me.data });
        i18n.changeLanguage(me.data.language ?? "de");
      },

      logout: async () => {
        try {
          await api.post("/auth/logout");
        } catch {}
        set({ loggedIn: false, user: null });
      },

      refreshUser: async () => {
        try {
          const me = await api.get("/auth/me");
          set({ loggedIn: true, user: me.data });
          i18n.changeLanguage(me.data.language ?? "de");
        } catch {
          set({ loggedIn: false, user: null });
        }
      },
    }),
    { name: "overterm-auth", partialize: (s) => ({ loggedIn: s.loggedIn }) }
  )
);

export default useAuth;
