"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/app/lib/api/core";
import type { AuthPromptFeature } from "@/app/lib/auth-prompts";
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { dispatchToast as showToast } from "@/app/lib/toast";

export interface UserProfile {
  full_name: string | null;
  preferred_branch: string | null;
  favorite_subjects: string[] | null;
  academic_year: string | null;
  branch_id: number | null;
  year_of_study: number | null;
}

interface AuthContextType {
  isAdmin: boolean;
  isStudent: boolean;
  emailConfirmed: boolean;
  currentUserEmail: string;
  showAuthModal: boolean;
  authPromptContext: AuthPromptFeature | null;
  authMode: "signin" | "signup" | "forgot";
  authEmail: string;
  authPassword: string;
  authLoading: boolean;
  googleLoading: boolean;
  userProfile: UserProfile;
  showOnboardingModal: boolean;
  showProfileGate: boolean;
  uploadedBy: string;

  setShowAuthModal: (v: boolean) => void;
  setAuthMode: (v: "signin" | "signup" | "forgot") => void;
  setAuthEmail: (v: string) => void;
  setAuthPassword: (v: string) => void;
  setShowOnboardingModal: (v: boolean) => void;
  setShowProfileGate: (v: boolean) => void;
  openAuthPrompt: (feature: AuthPromptFeature) => void;
  handleAuthModalOpenChange: (open: boolean) => void;
  updateUserProfile: (profile: Partial<UserProfile>) => void;
  handleGoogleLogin: () => Promise<void>;
  handleAuthSubmit: (e: React.FormEvent) => Promise<void>;
  handleLogout: () => Promise<void>;
  sendVerificationEmail: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [isAdmin, setIsAdmin] = useState(false);
  const [isStudent, setIsStudent] = useState(false);
  const [emailConfirmed, setEmailConfirmed] = useState(true);
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authPromptContext, setAuthPromptContext] = useState<AuthPromptFeature | null>(null);
  const [authMode, setAuthMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const [userProfile, setUserProfile] = useState<UserProfile>({ full_name: null, preferred_branch: null, favorite_subjects: null, academic_year: null, branch_id: null, year_of_study: null });
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [showProfileGate, setShowProfileGate] = useState(false);
  const [uploadedBy, setUploadedBy] = useState("");


  const openAuthPrompt = useCallback((feature: AuthPromptFeature) => {
    setAuthPromptContext(feature);
    setAuthMode("signin");
    setShowAuthModal(true);
  }, []);

  const handleAuthModalOpenChange = useCallback((open: boolean) => {
    setShowAuthModal(open);
    if (!open) setAuthPromptContext(null);
  }, []);

  const syncUserFromSession = useCallback(async (session: Session | null) => {
    if (session?.user) {
      setEmailConfirmed(!!session.user.email_confirmed_at);
      setCurrentUserEmail(session.user.email || "");
      const { data: roleData } = await supabase.from('user_roles').select('role').eq('user_id', session.user.id).single();
      const isDbAdmin = roleData?.role === 'admin';
      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      const isPortalAdminFlow = aalData?.currentLevel === 'aal2';

      if (isDbAdmin && isPortalAdminFlow) {
        setIsAdmin(true); setIsStudent(false);
      } else {
        setIsAdmin(false); setIsStudent(true);
        const { data: profileData } = await supabase.from('profiles').select('full_name, preferred_branch, favorite_subjects, academic_year, branch_id, year_of_study').eq('id', session.user.id).single();
        if (profileData) {
          setUserProfile({ full_name: profileData.full_name, preferred_branch: profileData.preferred_branch, favorite_subjects: profileData.favorite_subjects, academic_year: profileData.academic_year, branch_id: profileData.branch_id, year_of_study: profileData.year_of_study });
          setUploadedBy(profileData.full_name || "Student");
          if (!profileData.full_name && !sessionStorage.getItem(`skipped_onboarding_${session.user.id}`)) {
            setShowOnboardingModal(true);
          }
        } else {
          setUploadedBy("Student");
          if (!sessionStorage.getItem(`skipped_onboarding_${session.user.id}`)) {
            setShowOnboardingModal(true);
          }
        }
      }
    } else {
      setIsAdmin(false); setIsStudent(false);
      setUserProfile({ full_name: null, preferred_branch: null, favorite_subjects: null, academic_year: null, branch_id: null, year_of_study: null });
      setUploadedBy("");
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const syncSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (mounted) await syncUserFromSession(session);
    };

    void syncSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      void syncUserFromSession(session);
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "TOKEN_REFRESHED") {
        router.refresh();
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router, syncUserFromSession]);

  useEffect(() => {
    const handleAuthPrompt = (event: Event) => {
      const feature = (event as CustomEvent<AuthPromptFeature>).detail;
      if (feature) openAuthPrompt(feature);
    };

    window.addEventListener("portal_auth_prompt", handleAuthPrompt);
    return () => window.removeEventListener("portal_auth_prompt", handleAuthPrompt);
  }, [openAuthPrompt]);

  useEffect(() => {
    const handleProfileUpdate = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail) updateUserProfile(detail);
    };
    window.addEventListener("portal_profile_update", handleProfileUpdate);
    return () => window.removeEventListener("portal_profile_update", handleProfileUpdate);
  }, []);

  const updateUserProfile = (profile: Partial<UserProfile>) => {
    setUserProfile(prev => ({ ...prev, ...profile }));
    if (profile.full_name) setUploadedBy(profile.full_name);
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/`, queryParams: { access_type: 'offline', prompt: 'consent' } } });
      if (error) throw error;
    } catch (err: any) {
      showToast("Sign-In Error", err.message, "error");
      setGoogleLoading(false);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    sessionStorage.removeItem("admin_portal_auth");

    try {
      if (authMode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(authEmail, { redirectTo: `${window.location.origin}/reset-password` });
        if (error) throw error;
        showToast("Check Inbox", "Password reset email sent!", "success");
        setAuthMode("signin");
        handleAuthModalOpenChange(false);
      } else if (authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email: authEmail, password: authPassword, options: { emailRedirectTo: window.location.origin } });
        if (error) throw error;
        await router.refresh();
        if (data.session) {
          await syncUserFromSession(data.session);
          setAuthPassword("");
          handleAuthModalOpenChange(false);
          queryClient.invalidateQueries();
        } else {
          showToast("Registration Complete", "Please verify your email.", "success");
          setAuthMode("signin");
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
        if (error) throw error;
        await syncUserFromSession(data.session);
        setAuthPassword("");
        handleAuthModalOpenChange(false);
        queryClient.invalidateQueries();
        await router.refresh();
      }
    } catch (err: any) { showToast("Authentication Error", err.message, "error"); }
    finally { setAuthLoading(false); }
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      showToast("Sign-Out Error", error.message, "error");
      return;
    }
    sessionStorage.removeItem("admin_portal_auth");
    localStorage.removeItem("portal_bookmarks");
    localStorage.removeItem("portal_study_history");
    setIsAdmin(false); setIsStudent(false);
    await router.refresh();
    router.push('/');
  };

  const sendVerificationEmail = async () => {
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: currentUserEmail, options: { emailRedirectTo: window.location.origin } });
      if (error) throw error;
      showToast("Email Sent", "Verification email sent! Please check your inbox.", "success");
    } catch (err: any) { showToast("Authentication Error", err.message, "error"); }
  };

  return (
    <AuthContext.Provider value={{
      isAdmin, isStudent, emailConfirmed, currentUserEmail, showAuthModal, authPromptContext, authMode, authEmail, authPassword, authLoading, googleLoading, userProfile, showOnboardingModal, showProfileGate, uploadedBy,
      setShowAuthModal, setAuthMode, setAuthEmail, setAuthPassword, setShowOnboardingModal, setShowProfileGate, openAuthPrompt, handleAuthModalOpenChange, updateUserProfile, handleGoogleLogin, handleAuthSubmit, handleLogout, sendVerificationEmail
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
