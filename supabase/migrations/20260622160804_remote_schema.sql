SET check_function_bodies = false;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO service_role;
CREATE TYPE public.doccategory AS ENUM ('pyq', 'tutorial_sheet', 'notes', 'syllabus');
CREATE TYPE public.flag_reason AS ENUM ('incorrect', 'duplicate', 'low_quality', 'other');
CREATE TYPE public.flag_status AS ENUM ('pending', 'resolved', 'dismissed');
CREATE TYPE public.reviewstatus AS ENUM ('pending', 'approved', 'rejected');
CREATE SEQUENCE public.degrees_id_seq AS integer;
CREATE SEQUENCE public.documents_id_seq AS integer;
CREATE SEQUENCE public.modules_id_seq AS integer;
CREATE SEQUENCE public.semesters_id_seq AS integer;
CREATE SEQUENCE public.student_bookmarks_id_seq AS integer;
CREATE SEQUENCE public.student_history_id_seq AS integer;
CREATE SEQUENCE public.subjects_id_seq AS integer;
CREATE FUNCTION public.check_achievements_on_approval()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  approved_count integer;
BEGIN
  -- Only run this logic if the status JUST changed to 'approved'
  IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
    
    -- AWARD PIONEER BADGE (First Upload)
    IF NOT EXISTS (SELECT 1 FROM public.user_achievements WHERE user_id = NEW.uploaded_by::uuid AND badge_type = 'pioneer') THEN
      INSERT INTO public.user_achievements (user_id, badge_type) VALUES (NEW.uploaded_by::uuid, 'pioneer');
    END IF;

    -- AWARD TOP CONTRIBUTOR BADGE (e.g., 10 Approved Uploads)
    SELECT count(*) INTO approved_count FROM public.documents WHERE uploaded_by = NEW.uploaded_by AND status = 'approved';
    IF approved_count >= 10 AND NOT EXISTS (SELECT 1 FROM public.user_achievements WHERE user_id = NEW.uploaded_by::uuid AND badge_type = 'contributor') THEN
      INSERT INTO public.user_achievements (user_id, badge_type) VALUES (NEW.uploaded_by::uuid, 'contributor');
    END IF;

  END IF;
  
  RETURN NEW;
END;
$function$;
GRANT ALL ON FUNCTION public.check_achievements_on_approval() TO anon;
GRANT ALL ON FUNCTION public.check_achievements_on_approval() TO authenticated;
GRANT ALL ON FUNCTION public.check_achievements_on_approval() TO service_role;
CREATE FUNCTION public.check_streak_badge()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- If streak hits 7 and they don't have the badge
  IF NEW.current_streak >= 7 AND NOT EXISTS (SELECT 1 FROM public.user_achievements WHERE user_id = NEW.user_id AND badge_type = 'streak_7') THEN
    INSERT INTO public.user_achievements (user_id, badge_type) VALUES (NEW.user_id, 'streak_7');
  END IF;
  RETURN NEW;
END;
$function$;
GRANT ALL ON FUNCTION public.check_streak_badge() TO anon;
GRANT ALL ON FUNCTION public.check_streak_badge() TO authenticated;
GRANT ALL ON FUNCTION public.check_streak_badge() TO service_role;
CREATE FUNCTION public.get_subject_counts()
 RETURNS TABLE(subject text, count bigint)
 LANGUAGE sql
AS $function$
  SELECT subject, count(*) 
  FROM documents 
  WHERE status = 'approved' 
  GROUP BY subject;
$function$;
GRANT ALL ON FUNCTION public.get_subject_counts() TO anon;
GRANT ALL ON FUNCTION public.get_subject_counts() TO authenticated;
GRANT ALL ON FUNCTION public.get_subject_counts() TO service_role;
CREATE FUNCTION public.increment_doc_stat(doc_id bigint, stat_type text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF stat_type = 'view' THEN
    INSERT INTO document_analytics (document_id, view_count, download_count, last_accessed)
    VALUES (doc_id, 1, 0, now())
    ON CONFLICT (document_id)
    DO UPDATE SET 
      view_count = COALESCE(document_analytics.view_count, 0) + 1, 
      last_accessed = now();
      
  ELSIF stat_type = 'download' THEN
    INSERT INTO document_analytics (document_id, view_count, download_count, last_accessed)
    VALUES (doc_id, 0, 1, now())
    ON CONFLICT (document_id)
    DO UPDATE SET 
      download_count = COALESCE(document_analytics.download_count, 0) + 1, 
      last_accessed = now();
  END IF;
END;
$function$;
GRANT ALL ON FUNCTION public.increment_doc_stat(bigint, text) TO anon;
GRANT ALL ON FUNCTION public.increment_doc_stat(bigint, text) TO authenticated;
GRANT ALL ON FUNCTION public.increment_doc_stat(bigint, text) TO service_role;
CREATE FUNCTION public.prevent_self_rating()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Check if the user making the rating is the same user who uploaded the document
    -- (We cast to text because auth.uid() is UUID and your uploaded_by might be stored as text/string)
    IF EXISTS (
        SELECT 1 FROM documents 
        WHERE id = NEW.document_id AND uploaded_by = NEW.user_id::text
    ) THEN
        RAISE EXCEPTION 'Security Policy: You cannot rate your own document.';
    END IF;
    
    RETURN NEW;
END;
$function$;
GRANT ALL ON FUNCTION public.prevent_self_rating() TO anon;
GRANT ALL ON FUNCTION public.prevent_self_rating() TO authenticated;
GRANT ALL ON FUNCTION public.prevent_self_rating() TO service_role;
CREATE FUNCTION public.sync_document_metadata()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    storage_size BIGINT;
BEGIN
    -- Extract the file size from the Supabase storage.objects table
    -- We match the exact filename from the end of your file_url
    SELECT (metadata->>'size')::BIGINT INTO storage_size
    FROM storage.objects
    WHERE bucket_id = 'documents' 
      AND name = split_part(NEW.file_url, '/', -1)
    LIMIT 1;

    -- If the file is found in storage, convert bytes to Megabytes (MB)
    IF storage_size IS NOT NULL THEN
        NEW.file_size := ROUND((storage_size::NUMERIC / 1048576.0), 2);
    END IF;

    -- Ensure the upload date is set automatically
    IF NEW.created_at IS NULL THEN
        NEW.created_at := NOW();
    END IF;

    RETURN NEW;
END;
$function$;
GRANT ALL ON FUNCTION public.sync_document_metadata() TO anon;
GRANT ALL ON FUNCTION public.sync_document_metadata() TO authenticated;
GRANT ALL ON FUNCTION public.sync_document_metadata() TO service_role;
CREATE FUNCTION public.update_document_rating_counts()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_useful THEN
      UPDATE document_analytics SET upvotes = upvotes + 1 WHERE document_id = NEW.document_id;
    ELSE
      UPDATE document_analytics SET downvotes = downvotes + 1 WHERE document_id = NEW.document_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.is_useful != NEW.is_useful THEN
    IF NEW.is_useful THEN
      UPDATE document_analytics SET upvotes = upvotes + 1, downvotes = downvotes - 1 WHERE document_id = NEW.document_id;
    ELSE
      UPDATE document_analytics SET upvotes = upvotes - 1, downvotes = downvotes + 1 WHERE document_id = NEW.document_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.is_useful THEN
      UPDATE document_analytics SET upvotes = upvotes - 1 WHERE document_id = OLD.document_id;
    ELSE
      UPDATE document_analytics SET downvotes = downvotes - 1 WHERE document_id = OLD.document_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$function$;
GRANT ALL ON FUNCTION public.update_document_rating_counts() TO anon;
GRANT ALL ON FUNCTION public.update_document_rating_counts() TO authenticated;
GRANT ALL ON FUNCTION public.update_document_rating_counts() TO service_role;
CREATE FUNCTION public.update_study_streak(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_today date := current_date;
  v_streak record;
BEGIN
  -- Check if user already has a streak record
  SELECT * INTO v_streak FROM public.study_streaks WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    -- First time studying! Start streak at 1.
    INSERT INTO public.study_streaks (user_id, current_streak, longest_streak, last_active_date)
    VALUES (p_user_id, 1, 1, v_today);
  ELSE
    -- If already studied today, do nothing.
    IF v_streak.last_active_date = v_today THEN
      RETURN;
    END IF;

    -- If studied yesterday, increment streak
    IF v_streak.last_active_date = v_today - interval '1 day' THEN
      UPDATE public.study_streaks
      SET 
        current_streak = current_streak + 1,
        longest_streak = GREATEST(longest_streak, current_streak + 1),
        last_active_date = v_today
      WHERE user_id = p_user_id;
    ELSE
      -- Gap of more than 1 day -> Reset streak to 1
      UPDATE public.study_streaks
      SET 
        current_streak = 1,
        last_active_date = v_today
      WHERE user_id = p_user_id;
    END IF;
  END IF;
END;
$function$;
GRANT ALL ON FUNCTION public.update_study_streak(uuid) TO anon;
GRANT ALL ON FUNCTION public.update_study_streak(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.update_study_streak(uuid) TO service_role;
CREATE TABLE public.admins (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, email text NOT NULL, created_at timestamp with time zone DEFAULT now());
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins ADD CONSTRAINT admins_pkey PRIMARY KEY (id);
ALTER TABLE public.admins ADD CONSTRAINT admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
GRANT ALL ON public.admins TO anon;
GRANT ALL ON public.admins TO authenticated;
GRANT ALL ON public.admins TO service_role;
CREATE POLICY "Allow users to verify their admin status" ON public.admins FOR SELECT USING ((auth.uid() = user_id));
CREATE TABLE public.degrees (id integer DEFAULT nextval('public.degrees_id_seq'::regclass) NOT NULL, name character varying(100) NOT NULL, created_at timestamp without time zone DEFAULT now());
ALTER SEQUENCE public.degrees_id_seq OWNED BY public.degrees.id;
GRANT ALL ON SEQUENCE public.degrees_id_seq TO anon;
GRANT ALL ON SEQUENCE public.degrees_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.degrees_id_seq TO service_role;
ALTER TABLE public.degrees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.degrees ADD CONSTRAINT degrees_name_key UNIQUE (name);
ALTER TABLE public.degrees ADD CONSTRAINT degrees_pkey PRIMARY KEY (id);
GRANT ALL ON public.degrees TO anon;
GRANT ALL ON public.degrees TO authenticated;
GRANT ALL ON public.degrees TO service_role;
CREATE INDEX ix_degrees_id ON public.degrees (id);
CREATE TABLE public.document_analytics (document_id integer NOT NULL, view_count integer DEFAULT 0, download_count integer DEFAULT 0, last_accessed timestamp with time zone DEFAULT timezone('utc'::text, now()), upvotes integer DEFAULT 0, downvotes integer DEFAULT 0);
ALTER TABLE public.document_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_analytics ADD CONSTRAINT document_analytics_pkey PRIMARY KEY (document_id);
GRANT ALL ON public.document_analytics TO anon;
GRANT ALL ON public.document_analytics TO authenticated;
GRANT ALL ON public.document_analytics TO service_role;
CREATE POLICY "Allow public read access to analytics" ON public.document_analytics FOR SELECT USING (true);
CREATE POLICY "Anyone can read analytics" ON public.document_analytics FOR SELECT USING (true);
CREATE TABLE public.document_flags (id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL, document_id integer, user_id uuid, reason public.flag_reason NOT NULL, description text, status public.flag_status DEFAULT 'pending'::public.flag_status, created_at timestamp with time zone DEFAULT timezone('utc'::text, now()));
ALTER TABLE public.document_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_flags ADD CONSTRAINT document_flags_document_id_user_id_reason_key UNIQUE (document_id, user_id, reason);
ALTER TABLE public.document_flags ADD CONSTRAINT document_flags_pkey PRIMARY KEY (id);
ALTER TABLE public.document_flags ADD CONSTRAINT document_flags_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
GRANT ALL ON public.document_flags TO anon;
GRANT ALL ON public.document_flags TO authenticated;
GRANT ALL ON public.document_flags TO service_role;
CREATE POLICY "Admins have full access to flags" ON public.document_flags USING ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE (admins.user_id = auth.uid()))));
CREATE POLICY "Users can insert their own flags" ON public.document_flags FOR INSERT WITH CHECK ((auth.uid() = user_id));
CREATE TABLE public.document_ratings (id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL, document_id integer, user_id uuid, is_useful boolean NOT NULL, created_at timestamp with time zone DEFAULT timezone('utc'::text, now()));
ALTER TABLE public.document_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_ratings ADD CONSTRAINT document_ratings_document_id_user_id_key UNIQUE (document_id, user_id);
ALTER TABLE public.document_ratings ADD CONSTRAINT document_ratings_pkey PRIMARY KEY (id);
ALTER TABLE public.document_ratings ADD CONSTRAINT document_ratings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
GRANT ALL ON public.document_ratings TO anon;
GRANT ALL ON public.document_ratings TO authenticated;
GRANT ALL ON public.document_ratings TO service_role;
CREATE TRIGGER check_self_rating_trigger BEFORE INSERT OR UPDATE ON public.document_ratings FOR EACH ROW EXECUTE FUNCTION public.prevent_self_rating();
CREATE TRIGGER on_rating_change AFTER INSERT OR DELETE OR UPDATE ON public.document_ratings FOR EACH ROW EXECUTE FUNCTION public.update_document_rating_counts();
CREATE POLICY "Users can manage their own ratings" ON public.document_ratings USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can view their own ratings" ON public.document_ratings FOR SELECT USING ((auth.uid() = user_id));
CREATE TABLE public.documents (id integer DEFAULT nextval('public.documents_id_seq'::regclass) NOT NULL, title text NOT NULL, category text NOT NULL, file_url text NOT NULL, uploaded_by text DEFAULT 'Admin'::text NOT NULL, created_at timestamp with time zone DEFAULT timezone('utc'::text, now()), module_id integer, subject text NOT NULL, status text DEFAULT 'pending'::text, file_size double precision, page_count integer, thumbnail_url text, uploader_name text, fts tsvector GENERATED ALWAYS AS ((((setweight(to_tsvector('english'::regconfig, COALESCE(title, ''::text)), 'A'::"char") || setweight(to_tsvector('english'::regconfig, COALESCE(subject, ''::text)), 'B'::"char")) || setweight(to_tsvector('english'::regconfig, COALESCE(category, ''::text)), 'C'::"char")) || setweight(to_tsvector('english'::regconfig, COALESCE(('module '::text || (module_id)::text), ''::text)), 'C'::"char"))) STORED, moderated_by uuid, rejection_reason text, updated_at timestamp with time zone DEFAULT now(), resubmission_count integer DEFAULT 0);
ALTER SEQUENCE public.documents_id_seq OWNED BY public.documents.id;
GRANT ALL ON SEQUENCE public.documents_id_seq TO anon;
GRANT ALL ON SEQUENCE public.documents_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.documents_id_seq TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ADD CONSTRAINT documents_moderated_by_fkey FOREIGN KEY (moderated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.documents ADD CONSTRAINT documents_pkey PRIMARY KEY (id);
ALTER TABLE public.document_analytics ADD CONSTRAINT document_analytics_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;
ALTER TABLE public.document_flags ADD CONSTRAINT document_flags_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;
ALTER TABLE public.document_ratings ADD CONSTRAINT document_ratings_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;
ALTER TABLE public.documents ADD CONSTRAINT documents_status_check CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]));
GRANT ALL ON public.documents TO anon;
GRANT ALL ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
CREATE INDEX documents_created_at_idx ON public.documents (created_at DESC);
CREATE INDEX documents_status_idx ON public.documents (status);
CREATE INDEX documents_fts_idx ON public.documents USING gin (fts);
CREATE TRIGGER trg_sync_document_metadata BEFORE INSERT ON public.documents FOR EACH ROW EXECUTE FUNCTION public.sync_document_metadata();
CREATE TRIGGER trigger_achievements_on_approval AFTER UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.check_achievements_on_approval();
CREATE POLICY "Allow public read access for approved documents" ON public.documents FOR SELECT USING ((status = 'approved'::text));
CREATE POLICY "Allow uploaders to view their own documents" ON public.documents FOR SELECT USING ((uploaded_by = (auth.uid())::text));
CREATE POLICY "Anyone can view approved documents" ON public.documents FOR SELECT USING ((status = 'approved'::text));
CREATE POLICY "Only MFA-verified admins can delete documents" ON public.documents FOR DELETE USING (((auth.uid() IN ( SELECT admins.user_id
   FROM public.admins)) AND ((auth.jwt() ->> 'aal'::text) = 'aal2'::text)));
CREATE POLICY "Public Read Approved" ON public.documents FOR SELECT USING ((status = 'approved'::text));
CREATE POLICY "Student Insert Pending" ON public.documents FOR INSERT WITH CHECK (((auth.role() = 'authenticated'::text) AND (status = 'pending'::text)));
CREATE TABLE public.documents_title_backup (id integer, title text, uploader_name text);
ALTER TABLE public.documents_title_backup ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.documents_title_backup TO anon;
GRANT ALL ON public.documents_title_backup TO authenticated;
GRANT ALL ON public.documents_title_backup TO service_role;
CREATE TABLE public.modules (id integer DEFAULT nextval('public.modules_id_seq'::regclass) NOT NULL, subject_id integer, module_number integer NOT NULL, name text, created_at timestamp with time zone DEFAULT timezone('utc'::text, now()));
ALTER SEQUENCE public.modules_id_seq OWNED BY public.modules.id;
GRANT ALL ON SEQUENCE public.modules_id_seq TO anon;
GRANT ALL ON SEQUENCE public.modules_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.modules_id_seq TO service_role;
ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modules ADD CONSTRAINT modules_pkey PRIMARY KEY (id);
ALTER TABLE public.modules ADD CONSTRAINT modules_subject_id_module_number_key UNIQUE (subject_id, module_number);
GRANT ALL ON public.modules TO anon;
GRANT ALL ON public.modules TO authenticated;
GRANT ALL ON public.modules TO service_role;
CREATE POLICY "Allow public read access on modules" ON public.modules FOR SELECT USING (true);
CREATE TABLE public.notifications (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, title text NOT NULL, message text NOT NULL, type text NOT NULL, is_read boolean DEFAULT false, related_entity_id bigint, created_at timestamp with time zone DEFAULT now());
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
GRANT ALL ON public.notifications TO anon;
GRANT ALL ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
CREATE POLICY "Users can delete own notifications" ON public.notifications FOR DELETE USING ((auth.uid() = user_id));
CREATE POLICY "Users can update their own notifications" ON public.notifications FOR UPDATE USING ((auth.uid() = user_id));
CREATE POLICY "Users can view their own notifications" ON public.notifications FOR SELECT USING ((auth.uid() = user_id));
CREATE TABLE public.profiles (id uuid NOT NULL, favorite_subjects text[] DEFAULT '{}'::text[], preferred_branch text);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
GRANT ALL ON public.profiles TO anon;
GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = id));
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING ((auth.uid() = id));
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING ((auth.uid() = id));
CREATE TABLE public.semesters (id integer DEFAULT nextval('public.semesters_id_seq'::regclass) NOT NULL, degree_id integer, semester_number integer NOT NULL);
ALTER SEQUENCE public.semesters_id_seq OWNED BY public.semesters.id;
GRANT ALL ON SEQUENCE public.semesters_id_seq TO anon;
GRANT ALL ON SEQUENCE public.semesters_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.semesters_id_seq TO service_role;
ALTER TABLE public.semesters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.semesters ADD CONSTRAINT semesters_degree_id_fkey FOREIGN KEY (degree_id) REFERENCES public.degrees(id) ON DELETE CASCADE;
ALTER TABLE public.semesters ADD CONSTRAINT semesters_pkey PRIMARY KEY (id);
GRANT ALL ON public.semesters TO anon;
GRANT ALL ON public.semesters TO authenticated;
GRANT ALL ON public.semesters TO service_role;
CREATE INDEX ix_semesters_id ON public.semesters (id);
CREATE TABLE public.student_bookmarks (id integer DEFAULT nextval('public.student_bookmarks_id_seq'::regclass) NOT NULL, user_id uuid NOT NULL, document_id integer NOT NULL, created_at timestamp with time zone DEFAULT timezone('utc'::text, now()));
ALTER SEQUENCE public.student_bookmarks_id_seq OWNED BY public.student_bookmarks.id;
GRANT ALL ON SEQUENCE public.student_bookmarks_id_seq TO anon;
GRANT ALL ON SEQUENCE public.student_bookmarks_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.student_bookmarks_id_seq TO service_role;
ALTER TABLE public.student_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_bookmarks ADD CONSTRAINT student_bookmarks_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;
ALTER TABLE public.student_bookmarks ADD CONSTRAINT student_bookmarks_pkey PRIMARY KEY (id);
ALTER TABLE public.student_bookmarks ADD CONSTRAINT student_bookmarks_user_id_document_id_key UNIQUE (user_id, document_id);
ALTER TABLE public.student_bookmarks ADD CONSTRAINT student_bookmarks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
GRANT ALL ON public.student_bookmarks TO anon;
GRANT ALL ON public.student_bookmarks TO authenticated;
GRANT ALL ON public.student_bookmarks TO service_role;
CREATE POLICY "Users can delete their own bookmarks" ON public.student_bookmarks FOR DELETE USING ((auth.uid() = user_id));
CREATE POLICY "Users can insert their own bookmarks" ON public.student_bookmarks FOR INSERT WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can manage their own bookmarks" ON public.student_bookmarks USING ((auth.uid() = user_id));
CREATE POLICY "Users can view their own bookmarks" ON public.student_bookmarks FOR SELECT USING ((auth.uid() = user_id));
CREATE TABLE public.student_history (id integer DEFAULT nextval('public.student_history_id_seq'::regclass) NOT NULL, user_id uuid NOT NULL, document_id integer NOT NULL, updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()));
ALTER SEQUENCE public.student_history_id_seq OWNED BY public.student_history.id;
GRANT ALL ON SEQUENCE public.student_history_id_seq TO anon;
GRANT ALL ON SEQUENCE public.student_history_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.student_history_id_seq TO service_role;
ALTER TABLE public.student_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_history ADD CONSTRAINT fk_history_doc FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;
ALTER TABLE public.student_history ADD CONSTRAINT student_history_pkey PRIMARY KEY (id);
ALTER TABLE public.student_history ADD CONSTRAINT student_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.student_history ADD CONSTRAINT student_history_user_id_key UNIQUE (user_id);
GRANT ALL ON public.student_history TO anon;
GRANT ALL ON public.student_history TO authenticated;
GRANT ALL ON public.student_history TO service_role;
CREATE POLICY "Users can manage their own history" ON public.student_history USING ((auth.uid() = user_id));
CREATE TABLE public.study_history (id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL, user_id uuid NOT NULL, document_id bigint NOT NULL, accessed_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL);
ALTER TABLE public.study_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_history ADD CONSTRAINT study_history_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;
ALTER TABLE public.study_history ADD CONSTRAINT study_history_pkey PRIMARY KEY (id);
ALTER TABLE public.study_history ADD CONSTRAINT study_history_user_id_document_id_key UNIQUE (user_id, document_id);
ALTER TABLE public.study_history ADD CONSTRAINT study_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
GRANT ALL ON public.study_history TO anon;
GRANT ALL ON public.study_history TO authenticated;
GRANT ALL ON public.study_history TO service_role;
CREATE POLICY "Users can insert their own study history" ON public.study_history FOR INSERT WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can update their own study history" ON public.study_history FOR UPDATE USING ((auth.uid() = user_id));
CREATE POLICY "Users can view their own study history" ON public.study_history FOR SELECT USING ((auth.uid() = user_id));
CREATE POLICY "Users manage their own history" ON public.study_history USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE TABLE public.study_streaks (user_id uuid NOT NULL, current_streak integer DEFAULT 0, longest_streak integer DEFAULT 0, last_active_date date);
ALTER TABLE public.study_streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_streaks ADD CONSTRAINT study_streaks_pkey PRIMARY KEY (user_id);
ALTER TABLE public.study_streaks ADD CONSTRAINT study_streaks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
GRANT ALL ON public.study_streaks TO anon;
GRANT ALL ON public.study_streaks TO authenticated;
GRANT ALL ON public.study_streaks TO service_role;
CREATE TRIGGER trigger_streak_badge AFTER UPDATE ON public.study_streaks FOR EACH ROW EXECUTE FUNCTION public.check_streak_badge();
CREATE POLICY "Users can view own streak" ON public.study_streaks FOR SELECT USING ((auth.uid() = user_id));
CREATE TABLE public.subjects (id integer DEFAULT nextval('public.subjects_id_seq'::regclass) NOT NULL, name text NOT NULL, slug text NOT NULL, is_non_module boolean DEFAULT false, created_at timestamp with time zone DEFAULT timezone('utc'::text, now()));
ALTER SEQUENCE public.subjects_id_seq OWNED BY public.subjects.id;
GRANT ALL ON SEQUENCE public.subjects_id_seq TO anon;
GRANT ALL ON SEQUENCE public.subjects_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.subjects_id_seq TO service_role;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ADD CONSTRAINT subjects_name_key UNIQUE (name);
ALTER TABLE public.subjects ADD CONSTRAINT subjects_pkey PRIMARY KEY (id);
ALTER TABLE public.modules ADD CONSTRAINT modules_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE CASCADE;
ALTER TABLE public.subjects ADD CONSTRAINT subjects_slug_key UNIQUE (slug);
GRANT ALL ON public.subjects TO anon;
GRANT ALL ON public.subjects TO authenticated;
GRANT ALL ON public.subjects TO service_role;
CREATE POLICY "Allow public read access on subjects" ON public.subjects FOR SELECT USING (true);
CREATE TABLE public.user_achievements (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid, badge_type text NOT NULL, earned_at timestamp with time zone DEFAULT now());
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications, TABLE public.user_achievements;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ADD CONSTRAINT user_achievements_pkey PRIMARY KEY (id);
ALTER TABLE public.user_achievements ADD CONSTRAINT user_achievements_user_id_badge_type_key UNIQUE (user_id, badge_type);
ALTER TABLE public.user_achievements ADD CONSTRAINT user_achievements_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
GRANT ALL ON public.user_achievements TO anon;
GRANT ALL ON public.user_achievements TO authenticated;
GRANT ALL ON public.user_achievements TO service_role;
CREATE POLICY "Users can view own achievements" ON public.user_achievements FOR SELECT USING ((auth.uid() = user_id));
CREATE TABLE public.user_roles (user_id uuid NOT NULL, role text DEFAULT 'student'::text NOT NULL);
CREATE POLICY "Admin All Operations" ON public.documents USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::text)))));
CREATE POLICY "Allow admins full access to documents" ON public.documents USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::text)))));
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_pkey PRIMARY KEY (user_id);
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_role_check CHECK (role = ANY (ARRAY['admin'::text, 'student'::text]));
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
GRANT ALL ON public.user_roles TO anon;
GRANT ALL ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
CREATE POLICY "Users can read own role" ON public.user_roles FOR SELECT USING ((auth.uid() = user_id));
CREATE POLICY "Users can read their own role" ON public.user_roles FOR SELECT USING ((auth.uid() = user_id));
CREATE POLICY "Users read own role" ON public.user_roles FOR SELECT USING ((auth.uid() = user_id));
