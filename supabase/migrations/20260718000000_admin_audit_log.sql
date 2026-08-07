CREATE TABLE IF NOT EXISTS public.admin_audit_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    action TEXT NOT NULL CHECK (action IN ('approve', 'reject', 'delete', 'dismiss_flags')),
    target_id BIGINT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Admins can view audit logs
CREATE POLICY "Admins can view audit logs"
    ON public.admin_audit_log
    FOR SELECT
    USING (
        auth.uid() IN (SELECT user_id FROM public.admins)
    );

-- Backend API can insert logs
CREATE POLICY "Admins can insert audit logs"
    ON public.admin_audit_log
    FOR INSERT
    WITH CHECK (
        auth.uid() IN (SELECT user_id FROM public.admins)
        AND auth.uid() = admin_id
    );
