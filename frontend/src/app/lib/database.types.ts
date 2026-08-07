export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admins: {
        Row: {
          created_at: string | null
          email: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      degrees: {
        Row: {
          created_at: string | null
          id: number
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: number
          name: string
        }
        Update: {
          created_at?: string | null
          id?: number
          name?: string
        }
        Relationships: []
      }
      document_analytics: {
        Row: {
          document_id: number
          download_count: number | null
          downvotes: number | null
          last_accessed: string | null
          upvotes: number | null
          view_count: number | null
        }
        Insert: {
          document_id: number
          download_count?: number | null
          downvotes?: number | null
          last_accessed?: string | null
          upvotes?: number | null
          view_count?: number | null
        }
        Update: {
          document_id?: number
          download_count?: number | null
          downvotes?: number | null
          last_accessed?: string | null
          upvotes?: number | null
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "document_analytics_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: true
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_flags: {
        Row: {
          created_at: string | null
          description: string | null
          document_id: number | null
          id: string
          reason: Database["public"]["Enums"]["flag_reason"]
          status: Database["public"]["Enums"]["flag_status"] | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          document_id?: number | null
          id?: string
          reason: Database["public"]["Enums"]["flag_reason"]
          status?: Database["public"]["Enums"]["flag_status"] | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          document_id?: number | null
          id?: string
          reason?: Database["public"]["Enums"]["flag_reason"]
          status?: Database["public"]["Enums"]["flag_status"] | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_flags_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_ratings: {
        Row: {
          created_at: string | null
          document_id: number | null
          id: string
          is_useful: boolean
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          document_id?: number | null
          id?: string
          is_useful: boolean
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          document_id?: number | null
          id?: string
          is_useful?: boolean
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_ratings_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_comments: {
        Row: {
          created_at: string | null
          deleted_by_admin: boolean | null
          deleted_reason: string | null
          document_id: number
          id: string
          is_deleted: boolean | null
          is_pinned: boolean | null
          parent_id: string | null
          updated_at: string | null
          user_id: string
          content: string
        }
        Insert: {
          created_at?: string | null
          deleted_by_admin?: boolean | null
          deleted_reason?: string | null
          document_id: number
          id?: string
          is_deleted?: boolean | null
          is_pinned?: boolean | null
          parent_id?: string | null
          updated_at?: string | null
          user_id: string
          content: string
        }
        Update: {
          created_at?: string | null
          deleted_by_admin?: boolean | null
          deleted_reason?: string | null
          document_id?: number
          id?: string
          is_deleted?: boolean | null
          is_pinned?: boolean | null
          parent_id?: string | null
          updated_at?: string | null
          user_id?: string
          content?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_comments_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "document_comments"
            referencedColumns: ["id"]
          }
        ]
      }
      comment_flags: {
        Row: {
          comment_id: string
          created_at: string | null
          description: string | null
          id: string
          reason: Database["public"]["Enums"]["flag_reason"]
          status: Database["public"]["Enums"]["flag_status"] | null
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          reason: Database["public"]["Enums"]["flag_reason"]
          status?: Database["public"]["Enums"]["flag_status"] | null
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          reason?: Database["public"]["Enums"]["flag_reason"]
          status?: Database["public"]["Enums"]["flag_status"] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_flags_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "document_comments"
            referencedColumns: ["id"]
          }
        ]
      }
      documents: {
        Row: {
          category: string
          created_at: string | null
          file_size: number | null
          file_url: string
          fts: unknown
          id: number
          moderated_by: string | null
          module_id: number | null
          page_count: number | null
          status: string | null
          subject: string
          thumbnail_url: string | null
          title: string
          uploaded_by: string
          uploader_name: string | null
          rejection_reason: string | null
          updated_at: string | null
          resubmission_count: number
        }
        Insert: {
          category: string
          created_at?: string | null
          file_size?: number | null
          file_url: string
          fts?: unknown
          id?: number
          moderated_by?: string | null
          module_id?: number | null
          page_count?: number | null
          status?: string | null
          subject: string
          thumbnail_url?: string | null
          title: string
          uploaded_by?: string
          uploader_name?: string | null
          rejection_reason: string | null
          updated_at: string | null
          resubmission_count: number
        }
        Update: {
          category?: string
          created_at?: string | null
          file_size?: number | null
          file_url?: string
          fts?: unknown
          id?: number
          moderated_by?: string | null
          module_id?: number | null
          page_count?: number | null
          status?: string | null
          subject?: string
          thumbnail_url?: string | null
          title?: string
          uploaded_by?: string
          uploader_name?: string | null
          rejection_reason: string | null
          updated_at: string | null
          resubmission_count: number
        }
        Relationships: []
      }
      documents_title_backup: {
        Row: {
          id: number | null
          title: string | null
          uploader_name: string | null
        }
        Insert: {
          id?: number | null
          title?: string | null
          uploader_name?: string | null
        }
        Update: {
          id?: number | null
          title?: string | null
          uploader_name?: string | null
        }
        Relationships: []
      }
      modules: {
        Row: {
          created_at: string | null
          id: number
          module_number: number
          name: string | null
          subject_id: number | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          module_number: number
          name?: string | null
          subject_id?: number | null
        }
        Update: {
          created_at?: string | null
          id?: number
          module_number?: number
          name?: string | null
          subject_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "modules_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string
          related_entity_id: number | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          related_entity_id?: number | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          related_entity_id?: number | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          favorite_subjects: string[] | null
          id: string
          preferred_branch: string | null
          full_name: string | null
          academic_year: string | null
        }
        Insert: {
          favorite_subjects?: string[] | null
          id: string
          preferred_branch?: string | null
          full_name?: string | null
          academic_year?: string | null
        }
        Update: {
          favorite_subjects?: string[] | null
          id?: string
          preferred_branch?: string | null
          full_name?: string | null
          academic_year?: string | null
        }
        Relationships: []
      }
      semesters: {
        Row: {
          degree_id: number | null
          id: number
          semester_number: number
        }
        Insert: {
          degree_id?: number | null
          id?: number
          semester_number: number
        }
        Update: {
          degree_id?: number | null
          id?: number
          semester_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "semesters_degree_id_fkey"
            columns: ["degree_id"]
            isOneToOne: false
            referencedRelation: "degrees"
            referencedColumns: ["id"]
          },
        ]
      }
      student_bookmarks: {
        Row: {
          created_at: string | null
          document_id: number
          id: number
          user_id: string
        }
        Insert: {
          created_at?: string | null
          document_id: number
          id?: number
          user_id: string
        }
        Update: {
          created_at?: string | null
          document_id?: number
          id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_bookmarks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      student_history: {
        Row: {
          document_id: number
          id: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          document_id: number
          id?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          document_id?: number
          id?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_history_doc"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      study_history: {
        Row: {
          accessed_at: string
          document_id: number
          id: number
          user_id: string
        }
        Insert: {
          accessed_at?: string
          document_id: number
          id?: number
          user_id: string
        }
        Update: {
          accessed_at?: string
          document_id?: number
          id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_history_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      study_streaks: {
        Row: {
          current_streak: number | null
          last_active_date: string | null
          longest_streak: number | null
          user_id: string
        }
        Insert: {
          current_streak?: number | null
          last_active_date?: string | null
          longest_streak?: number | null
          user_id: string
        }
        Update: {
          current_streak?: number | null
          last_active_date?: string | null
          longest_streak?: number | null
          user_id?: string
        }
        Relationships: []
      }
      subjects: {
        Row: {
          created_at: string | null
          id: number
          is_non_module: boolean | null
          name: string
          slug: string
        }
        Insert: {
          created_at?: string | null
          id?: number
          is_non_module?: boolean | null
          name: string
          slug: string
        }
        Update: {
          created_at?: string | null
          id?: number
          is_non_module?: boolean | null
          name?: string
          slug?: string
        }
        Relationships: []
      }
      user_achievements: {
        Row: {
          badge_type: string
          earned_at: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          badge_type: string
          earned_at?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          badge_type?: string
          earned_at?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          role: string
          user_id: string
        }
        Insert: {
          role?: string
          user_id: string
        }
        Update: {
          role?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      weekly_trending_documents: {
        Row: {
          id: number
          title: string
          category: string
          file_url: string
          uploaded_by: string
          created_at: string | null
          module_id: number | null
          subject: string
          status: string | null
          file_size: number | null
          page_count: number | null
          thumbnail_url: string | null
          uploader_name: string | null
          fts: unknown | null
          moderated_by: string | null
          rejection_reason: string | null
          updated_at: string | null
          resubmission_count: number | null
          weekly_views: number | null
          all_time_view_count: number | null
          upvotes: number | null
          downvotes: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_admin_analytics_stats: {
        Args: Record<PropertyKey, never>
        Returns: {
          totalDocs: number
          approvedDocs: number
          pendingDocs: number
          rejectedDocs: number
          totalDownloads: number
          totalViews: number
          totalFlags: number
        }
      }
      get_subject_counts: {
        Args: never
        Returns: {
          count: number
          subject: string
        }[]
      }
      get_module_counts: {
        Args: { p_subject: string }
        Returns: {
          count: number
          module_id: number
        }[]
      }
      increment_doc_stat: {
        Args: { doc_id: number; stat_type: string }
        Returns: undefined
      }
      update_study_streak: { Args: { p_user_id: string }; Returns: undefined }
      toggle_upvote: { Args: { p_document_id: number; p_user_id: string }; Returns: boolean }
    }
    Enums: {
      doccategory: "pyq" | "tutorial_sheet" | "notes" | "syllabus"
      flag_reason: "incorrect" | "duplicate" | "low_quality" | "other"
      flag_status: "pending" | "resolved" | "dismissed"
      reviewstatus: "pending" | "approved" | "rejected"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      doccategory: ["pyq", "tutorial_sheet", "notes", "syllabus"],
      flag_reason: ["incorrect", "duplicate", "low_quality", "other"],
      flag_status: ["pending", "resolved", "dismissed"],
      reviewstatus: ["pending", "approved", "rejected"],
    },
  },
} as const
