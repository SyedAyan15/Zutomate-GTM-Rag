-- SUPABASE RLS PERFORMANCE & CLEANUP SCRIPT
-- This script resolves 57 "auth_rls_initplan" warnings and redundant policy issues.

-- ==========================================
-- 1. CLEAN UP REDUNDANT POLICIES (Table: chats)
-- ==========================================
-- Drop all identified duplicate/messy policies
DROP POLICY IF EXISTS "Users can update own chats" ON public.chats;
DROP POLICY IF EXISTS "Users can view own chats" ON public.chats;
DROP POLICY IF EXISTS "Users can create own chats" ON public.chats;
DROP POLICY IF EXISTS "Users can delete own chats" ON public.chats;
DROP POLICY IF EXISTS "Chat Access" ON public.chats;
DROP POLICY IF EXISTS "Users can view their own chats" ON public.chats;
DROP POLICY IF EXISTS "Users can create their own chats" ON public.chats;
DROP POLICY IF EXISTS "Users can update their own chats" ON public.chats;
DROP POLICY IF EXISTS "Users can delete their own chats" ON public.chats;

-- Re-enable RLS
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;

-- Create single optimized, high-performance policies
-- Rule: Wrapping auth.uid() in (select auth.uid()) avoids re-evaluation for every row.

CREATE POLICY "chats_select" ON public.chats
FOR SELECT TO authenticated
USING ( (select auth.uid()) = user_id );

CREATE POLICY "chats_insert" ON public.chats
FOR INSERT TO authenticated
WITH CHECK ( (select auth.uid()) = user_id );

CREATE POLICY "chats_update" ON public.chats
FOR UPDATE TO authenticated
USING ( (select auth.uid()) = user_id );

CREATE POLICY "chats_delete" ON public.chats
FOR DELETE TO authenticated
USING ( (select auth.uid()) = user_id );


-- ==========================================
-- 2. CLEAN UP REDUNDANT POLICIES (Table: messages)
-- ==========================================
DROP POLICY IF EXISTS "Users can view own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can create messages in own chats" ON public.messages;
DROP POLICY IF EXISTS "Users can view messages in own chats" ON public.messages;
DROP POLICY IF EXISTS "Users can insert messages in own chats" ON public.messages;
DROP POLICY IF EXISTS "Message Access" ON public.messages;
DROP POLICY IF EXISTS "Users can view messages in their chats" ON public.messages;
DROP POLICY IF EXISTS "Users can create messages in their chats" ON public.messages;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Optimized policies for messages
CREATE POLICY "messages_select" ON public.messages
FOR SELECT TO authenticated
USING ( (select auth.uid()) = user_id );

CREATE POLICY "messages_insert" ON public.messages
FOR INSERT TO authenticated
WITH CHECK ( (select auth.uid()) = user_id );


-- ==========================================
-- 3. CLEAN UP REDUNDANT POLICIES (Table: profiles)
-- ==========================================
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Enable insert for service role" ON public.profiles;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Optimized policies for profiles
CREATE POLICY "profiles_select" ON public.profiles
FOR SELECT TO authenticated
USING ( (select auth.uid()) = id );

CREATE POLICY "profiles_insert" ON public.profiles
FOR INSERT TO authenticated
WITH CHECK ( (select auth.uid()) = id );

CREATE POLICY "profiles_update" ON public.profiles
FOR UPDATE TO authenticated
USING ( (select auth.uid()) = id );


-- ==========================================
-- 4. OPTIMIZE ADMIN POLICIES (uploaded_files & system_settings)
-- ==========================================
DROP POLICY IF EXISTS "Admins can view all files" ON public.uploaded_files;
DROP POLICY IF EXISTS "Admins can insert files" ON public.uploaded_files;
DROP POLICY IF EXISTS "Admins can delete files" ON public.uploaded_files;
DROP POLICY IF EXISTS "Admins can manage settings" ON public.system_settings;

ALTER TABLE public.uploaded_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Optimized Admin Check using subquery for better performance
CREATE POLICY "admins_view_files" ON public.uploaded_files
FOR SELECT TO authenticated
USING ( 
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = (select auth.uid()) AND role = 'admin'
  )
);

CREATE POLICY "admins_insert_files" ON public.uploaded_files
FOR INSERT TO authenticated
WITH CHECK ( 
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = (select auth.uid()) AND role = 'admin'
  )
);

CREATE POLICY "admins_delete_files" ON public.uploaded_files
FOR DELETE TO authenticated
USING ( 
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = (select auth.uid()) AND role = 'admin'
  )
);

CREATE POLICY "admins_manage_settings" ON public.system_settings
FOR ALL TO authenticated
USING ( 
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = (select auth.uid()) AND role = 'admin'
  )
);

-- ==========================================
-- 5. SECURITY HARDENING (Functions)
-- ==========================================
-- This resolves "function_search_path_mutable" warnings.
-- PostgreSQL functions should have an explicit search_path for security.

ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.handle_updated_at() SET search_path = public;
