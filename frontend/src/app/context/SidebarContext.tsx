"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/app/lib/api/core";
import { searchDocuments } from "@/app/lib/api/documents";
import { dispatchToast as showToast } from "@/app/lib/toast";
import { DocumentWithAnalytics } from "@/app/lib/document-types";

interface SidebarContextType {
  pathname: string;
  isOffline: boolean;
  sidebarCollapsed: boolean;
  showMobileMenu: boolean;
  sidebarLoading: boolean;
  pendingCount: number;
  searchQuery: string;
  globalSearchResults: DocumentWithAnalytics[];
  isSearching: boolean;

  setSidebarCollapsed: (v: boolean) => void;
  setShowMobileMenu: (v: boolean) => void;
  setSearchQuery: (v: string) => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isOffline, setIsOffline] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [sidebarLoading, setSidebarLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  const [searchQuery, setSearchQuery] = useState("");
  const [globalSearchResults, setGlobalSearchResults] = useState<DocumentWithAnalytics[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const refreshSidebarData = useCallback(async () => {
    const { count } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    if (count !== null) setPendingCount(count);
  }, []);


  useEffect(() => {
    setIsOffline(!navigator.onLine);
    const handleOnline = () => { setIsOffline(false); showToast("Connection Restored", "You are back online.", "success"); };
    const handleOffline = () => { setIsOffline(true); showToast("Connection Lost", "You are operating offline. You can still access saved bookmarks.", "error"); };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => { window.removeEventListener("online", handleOnline); window.removeEventListener("offline", handleOffline); };
  }, []);

  useEffect(() => {
    const initializeData = async () => {
      await refreshSidebarData();
      setSidebarLoading(false);
    };
    initializeData();
  }, [refreshSidebarData]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }: any) => {
      setSidebarCollapsed(!session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: any, session: any) => {
      refreshSidebarData();
      if (event === 'SIGNED_IN') {
        setSidebarCollapsed(false);
      } else if (event === 'SIGNED_OUT') {
        setSidebarCollapsed(true);
      }
    });
    return () => subscription.unsubscribe();
  }, [refreshSidebarData]);

  useEffect(() => {
    const fetchSearchResults = async () => {
      if (!searchQuery.trim()) { setGlobalSearchResults([]); return; }
      setIsSearching(true);
      const response = await searchDocuments({ query: searchQuery, limit: 8 });
      setGlobalSearchResults(response.data);
      setIsSearching(false);
    };
    const debounceTimer = setTimeout(fetchSearchResults, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchQuery]);

  return (
    <SidebarContext.Provider value={{
      pathname, isOffline, sidebarCollapsed, showMobileMenu, sidebarLoading, pendingCount, searchQuery, globalSearchResults, isSearching,
      setSidebarCollapsed, setShowMobileMenu, setSearchQuery
    }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (context === undefined) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
}
