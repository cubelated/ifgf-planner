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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      assignments: {
        Row: {
          created_at: string
          id: string
          is_locked: boolean
          occurrence_id: string
          organization_id: string
          section_id: string
          status: string
          updated_at: string
          volunteer_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_locked?: boolean
          occurrence_id: string
          organization_id: string
          section_id: string
          status?: string
          updated_at?: string
          volunteer_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_locked?: boolean
          occurrence_id?: string
          organization_id?: string
          section_id?: string
          status?: string
          updated_at?: string
          volunteer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "event_occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "service_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_volunteer_id_fkey"
            columns: ["volunteer_id"]
            isOneToOne: false
            referencedRelation: "volunteers"
            referencedColumns: ["id"]
          },
        ]
      }
      event_group_volunteers: {
        Row: {
          created_at: string
          event_group_id: string
          volunteer_id: string
        }
        Insert: {
          created_at?: string
          event_group_id: string
          volunteer_id: string
        }
        Update: {
          created_at?: string
          event_group_id?: string
          volunteer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_group_volunteers_event_group_id_fkey"
            columns: ["event_group_id"]
            isOneToOne: false
            referencedRelation: "event_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_group_volunteers_volunteer_id_fkey"
            columns: ["volunteer_id"]
            isOneToOne: false
            referencedRelation: "volunteers"
            referencedColumns: ["id"]
          },
        ]
      }
      event_groups: {
        Row: {
          created_at: string
          duration_minutes: number
          id: string
          is_active: boolean
          name: string
          organization_id: string
          recurrence_pattern: string
          start_time: string
          updated_at: string
          week_occurrences: number[]
          weekday: number
        }
        Insert: {
          created_at?: string
          duration_minutes?: number
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          recurrence_pattern?: string
          start_time: string
          updated_at?: string
          week_occurrences?: number[]
          weekday: number
        }
        Update: {
          created_at?: string
          duration_minutes?: number
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          recurrence_pattern?: string
          start_time?: string
          updated_at?: string
          week_occurrences?: number[]
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_groups_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      event_occurrences: {
        Row: {
          created_at: string
          ends_at: string
          event_group_id: string
          id: string
          organization_id: string
          starts_at: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_at: string
          event_group_id: string
          id?: string
          organization_id: string
          starts_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          event_group_id?: string
          id?: string
          organization_id?: string
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_occurrences_event_group_id_fkey"
            columns: ["event_group_id"]
            isOneToOne: false
            referencedRelation: "event_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_occurrences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      line_event_reminder_settings: {
        Row: {
          arrival_minutes_before: number
          created_at: string
          custom_message: string | null
          enabled: boolean
          event_id: string
          reminder_minutes_before: number
          require_published_schedule: boolean
          updated_at: string
        }
        Insert: {
          arrival_minutes_before?: number
          created_at?: string
          custom_message?: string | null
          enabled?: boolean
          event_id: string
          reminder_minutes_before?: number
          require_published_schedule?: boolean
          updated_at?: string
        }
        Update: {
          arrival_minutes_before?: number
          created_at?: string
          custom_message?: string | null
          enabled?: boolean
          event_id?: string
          reminder_minutes_before?: number
          require_published_schedule?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "line_event_reminder_settings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "event_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      line_group_connections: {
        Row: {
          connected_at: string
          event_id: string
          group_name: string | null
          id: string
          line_group_id: string
          status: string
        }
        Insert: {
          connected_at?: string
          event_id: string
          group_name?: string | null
          id?: string
          line_group_id: string
          status?: string
        }
        Update: {
          connected_at?: string
          event_id?: string
          group_name?: string | null
          id?: string
          line_group_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "line_group_connections_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      line_unavailability_broadcasts: {
        Row: {
          announce_at: string
          announced_at: string | null
          created_at: string
          created_by: string
          event_id: string
          id: string
          reminder_at: string | null
          reminder_sent_at: string | null
          request_id: string
          share_url: string
          status: string
          updated_at: string
        }
        Insert: {
          announce_at: string
          announced_at?: string | null
          created_at?: string
          created_by?: string
          event_id: string
          id?: string
          reminder_at?: string | null
          reminder_sent_at?: string | null
          request_id: string
          share_url: string
          status?: string
          updated_at?: string
        }
        Update: {
          announce_at?: string
          announced_at?: string | null
          created_at?: string
          created_by?: string
          event_id?: string
          id?: string
          reminder_at?: string | null
          reminder_sent_at?: string | null
          request_id?: string
          share_url?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "line_unavailability_broadcasts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "line_unavailability_broadcasts_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "unavailability_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          organization_id: string
          role: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          organization_id: string
          role: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          organization_id?: string
          role?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      schedule_shares: {
        Row: {
          created_at: string
          event_group_id: string
          id: string
          organization_id: string
          share_month: string
          token_hash: string
        }
        Insert: {
          created_at?: string
          event_group_id: string
          id?: string
          organization_id: string
          share_month: string
          token_hash: string
        }
        Update: {
          created_at?: string
          event_group_id?: string
          id?: string
          organization_id?: string
          share_month?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_shares_event_group_id_fkey"
            columns: ["event_group_id"]
            isOneToOne: false
            referencedRelation: "event_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_shares_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      service_sections: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          organization_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          organization_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_sections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      staffing_requirements: {
        Row: {
          created_at: string
          event_group_id: string
          id: string
          needed_count: number
          section_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_group_id: string
          id?: string
          needed_count?: number
          section_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_group_id?: string
          id?: string
          needed_count?: number
          section_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staffing_requirements_event_group_id_fkey"
            columns: ["event_group_id"]
            isOneToOne: false
            referencedRelation: "event_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staffing_requirements_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "service_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      unavailability: {
        Row: {
          created_at: string
          id: string
          occurrence_id: string | null
          organization_id: string
          reason: string | null
          request_id: string | null
          submitted_name: string | null
          unavailable_date: string
          updated_at: string
          volunteer_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          occurrence_id?: string | null
          organization_id: string
          reason?: string | null
          request_id?: string | null
          submitted_name?: string | null
          unavailable_date: string
          updated_at?: string
          volunteer_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          occurrence_id?: string | null
          organization_id?: string
          reason?: string | null
          request_id?: string | null
          submitted_name?: string | null
          unavailable_date?: string
          updated_at?: string
          volunteer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "unavailability_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "event_occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unavailability_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unavailability_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "unavailability_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unavailability_volunteer_id_fkey"
            columns: ["volunteer_id"]
            isOneToOne: false
            referencedRelation: "volunteers"
            referencedColumns: ["id"]
          },
        ]
      }
      unavailability_requests: {
        Row: {
          created_at: string
          created_by: string
          expires_on: string
          id: string
          organization_id: string
          request_month: string
          share_token: string | null
          status: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          expires_on: string
          id?: string
          organization_id: string
          request_month: string
          share_token?: string | null
          status?: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_on?: string
          id?: string
          organization_id?: string
          request_month?: string
          share_token?: string | null
          status?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "unavailability_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      volunteer_section_eligibility: {
        Row: {
          created_at: string
          section_id: string
          volunteer_id: string
        }
        Insert: {
          created_at?: string
          section_id: string
          volunteer_id: string
        }
        Update: {
          created_at?: string
          section_id?: string
          volunteer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "volunteer_section_eligibility_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "service_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "volunteer_section_eligibility_volunteer_id_fkey"
            columns: ["volunteer_id"]
            isOneToOne: false
            referencedRelation: "volunteers"
            referencedColumns: ["id"]
          },
        ]
      }
      volunteers: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          organization_id: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          organization_id: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          organization_id?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "volunteers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "volunteers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_schedule_share: {
        Args: {
          share_token: string
          target_event_group_id: string
          target_month: string
          target_organization_id: string
        }
        Returns: string
      }
      create_unavailability_request: {
        Args: {
          request_token: string
          target_expires_on: string
          target_month: string
          target_organization_id: string
        }
        Returns: string
      }
      get_unavailability_form: {
        Args: { request_token: string }
        Returns: Json
      }
      get_shared_schedule: {
        Args: { share_token: string }
        Returns: Json
      }
      reorder_service_sections: {
        Args: {
          ordered_section_ids: string[]
          target_organization_id: string
        }
        Returns: undefined
      }
      submit_unavailability_form: {
        Args: {
          request_token: string
          respondent_name: string
          response_reason: string
          selected_volunteer_id: string | null
          unavailable_dates: string[]
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
