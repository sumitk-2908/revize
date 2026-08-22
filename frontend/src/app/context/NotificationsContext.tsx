"use client";

import { createContext, useContext, useEffect, useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/app/lib/api/core";
import { getAchievements } from "@/app/lib/api/profile";
import { Tables } from "@/app/lib/database.types";
import { dispatchToast } from "@/app/lib/toast";

interface NotificationsContextType {
  notifications: Tables<'notifications'>[];
  unreadCount: number;
  showNotifications: boolean;
  activeToast: {title: string, description: string} | null;
  globalToast: { open: boolean, title: string, message: string, type: "default" | "error" | "success" };

  setNotifications: React.Dispatch<React.SetStateAction<Tables<'notifications'>[]>>;
  setShowNotifications: (v: boolean) => void;
  setActiveToast: (toast: {title: string, description: string} | null) => void;
  setGlobalToast: (toast: any) => void;
  handleMarkAsRead: (id: string, isRead: boolean) => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Tables<'notifications'>[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [activeToast, setActiveToast] = useState<{title: string, description: string} | null>(null);
  const [globalToast, setGlobalToast] = useState({ open: false, title: "", message: "", type: "default" as "default" | "error" | "success" });
  
  const earnedBadgesRef = useRef<Set<string>>(new Set());
  const queryClient = useQueryClient();

  useEffect(() => {
    const handlePortalToast = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail) {
        setGlobalToast({ open: true, title: detail.title, message: detail.message, type: detail.type });
      }
    };

    window.addEventListener("portal_toast", handlePortalToast);
    return () => window.removeEventListener("portal_toast", handlePortalToast);
  }, []);

  useEffect(() => {
    let achieveChannel: any;
    let notifChannel: any;
    let notifUpdateChannel: any;

    const setupDataAndListeners = async (userId: string) => {
      const initialBadges = await getAchievements(userId);
      earnedBadgesRef.current = new Set(initialBadges.map((b: any) => b.badge_type));

      const { data: notifs } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (notifs) {
        setNotifications(notifs);
        setUnreadCount(notifs.filter((n: any) => !n.is_read).length);
      }

      achieveChannel = supabase
        .channel(`achievements-${userId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'user_achievements', filter: `user_id=eq.${userId}` }, (payload: any) => {
            // The column is badge_type. Reading badge_id gave undefined, and
            // since the initial Set was then a Set of undefined, has() returned
            // true for any user holding at least one badge — suppressing the
            // toast entirely. Users with no badges got the generic fallback text
            // because none of the lookup keys below matched a real badge id.
            const newBadgeId = payload.new.badge_type;
            if (newBadgeId && !earnedBadgesRef.current.has(newBadgeId)) {
              earnedBadgesRef.current.add(newBadgeId);
              // Keys must match the badge_type values awarded by the triggers in
              // supabase/migrations/20260822000002_achievements_rework.sql and
              // the tiles in components/profile/AchievementsList.tsx.
              const badgeLookup: Record<string, {title: string, desc: string}> = {
                "explorer": { title: "Explorer", desc: "You opened 3 documents." },
                "curator": { title: "Curator", desc: "You bookmarked 3 resources." },
                "streak_3": { title: "3 Day Streak", desc: "3 day study streak!" },
                "pioneer": { title: "Pioneer", desc: "You uploaded your first resource." },
                "scholar": { title: "Scholar", desc: "You opened 15 different documents." },
                "contributor": { title: "Top Contributor", desc: "You got 3 uploads approved." },
                "downloads_10": { title: "Impact Maker", desc: "Your uploads reached 10 downloads." },
                "streak_7": { title: "7 Day Streak", desc: "7 day study streak!" }
              };
              const badgeInfo = badgeLookup[newBadgeId] || { title: "New Badge", desc: "You earned a new achievement!" };
              setActiveToast({ title: badgeInfo.title, description: badgeInfo.desc });
              // Keep the profile's Achievements tab in step with the toast.
              queryClient.invalidateQueries({ queryKey: ['profile', 'achievements', userId] });
            }
          })
        .subscribe();

      notifChannel = supabase
        .channel(`notifications-${userId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, (payload: any) => {
            setNotifications(prev => [payload.new as Tables<'notifications'>, ...prev]);
            setUnreadCount(prev => prev + 1);
            setActiveToast({ title: payload.new.title, description: payload.new.message });
          })
        .subscribe();

      notifUpdateChannel = supabase
        .channel(`notifications-update-${userId}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, (payload: any) => {
            setNotifications(prev => {
              const updatedList = prev.map(n => n.id === payload.new.id ? payload.new as Tables<'notifications'> : n);
              setUnreadCount(updatedList.filter(n => !n.is_read).length);
              return updatedList;
            });
          })
        .subscribe();
    };

    const cleanupListeners = () => {
      if (achieveChannel) supabase.removeChannel(achieveChannel);
      if (notifChannel) supabase.removeChannel(notifChannel);
      if (notifUpdateChannel) supabase.removeChannel(notifUpdateChannel);
    };

    let currentUserId: string | null = null;

    const setup = (userId: string | null) => {
      if (currentUserId === userId) return;
      cleanupListeners();
      currentUserId = userId;

      if (userId) {
        setupDataAndListeners(userId);
      } else {
        setNotifications([]);
        setUnreadCount(0);
        earnedBadgesRef.current.clear();
      }
    };

    const handleSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setup(session?.user?.id || null);
    };

    handleSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
      setup(session?.user?.id || null);
    });

    return () => {
      cleanupListeners();
      subscription.unsubscribe();
    };
  }, [queryClient]);

  const handleMarkAsRead = async (id: string, isRead: boolean) => {
    if (isRead) return;
    
    const snapshotNotifications = [...notifications];
    const snapshotUnreadCount = unreadCount;

    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));

    try {
      const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id);
      if (error) throw error;
    } catch (error) {
      console.error("Failed to mark as read, rolling back:", error);
      setNotifications(snapshotNotifications);
      setUnreadCount(snapshotUnreadCount);
      dispatchToast("Error", "Failed to mark notification as read", "error");
    }
  };

  return (
    <NotificationsContext.Provider value={{
      notifications, unreadCount, showNotifications, activeToast, globalToast,
      setNotifications, setShowNotifications, setActiveToast, setGlobalToast, handleMarkAsRead
    }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (context === undefined) {
    throw new Error("useNotifications must be used within a NotificationsProvider");
  }
  return context;
}
