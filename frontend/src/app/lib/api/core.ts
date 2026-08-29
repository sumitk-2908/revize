import axios from 'axios';
import { createClient } from '../../../utils/supabase/client';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Missing Supabase environment variables");
}

const API_URL = process.env.NEXT_PUBLIC_API_URL;
export const supabase = createClient();

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

let pendingSlowRequests = 0;

const notifyWarmupState = (isWarming: boolean) => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("portal_backend_warming", { detail: { isWarming } })
    );
  }
};

api.interceptors.request.use(async (config) => {
  // Track slow requests (cold starts take >2.5s)
  if (typeof window !== "undefined") {
    const timer = setTimeout(() => {
      pendingSlowRequests++;
      notifyWarmupState(true);
    }, 2500);

    (config as any).__warmupTimer = timer;
    (config as any).__warmupTriggered = false;
  }

  let { data: { session } } = await supabase.auth.getSession();
  
  if (session?.expires_at && (session.expires_at * 1000) - Date.now() < 60000) {
    const { data } = await supabase.auth.refreshSession();
    session = data.session;
  }
  
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    if (typeof window !== "undefined") {
      const timer = (response.config as any)?.__warmupTimer;
      if (timer) {
        clearTimeout(timer);
      }
      if (pendingSlowRequests > 0) {
        pendingSlowRequests = Math.max(0, pendingSlowRequests - 1);
        if (pendingSlowRequests === 0) {
          notifyWarmupState(false);
        }
      }
    }
    return response;
  },
  (error) => {
    if (typeof window !== "undefined") {
      const timer = (error.config as any)?.__warmupTimer;
      if (timer) {
        clearTimeout(timer);
      }
      if (pendingSlowRequests > 0) {
        pendingSlowRequests = Math.max(0, pendingSlowRequests - 1);
        if (pendingSlowRequests === 0) {
          notifyWarmupState(false);
        }
      }
    }
    return Promise.reject(error);
  }
);
