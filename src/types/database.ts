export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      gbp_posts: {
        Row: {
          id: string
          blog_title: string
          blog_url: string | null
          location_key: string
          location_name: string
          content: string
          ai_model: string
          status: string
          error_message: string | null
          character_count: number | null
          post_date: string
          created_at: string
          metadata: Json | null
        }
        Insert: {
          id?: string
          blog_title: string
          blog_url?: string | null
          location_key: string
          location_name: string
          content: string
          ai_model?: string
          status?: string
          error_message?: string | null
          character_count?: number | null
          post_date?: string
          created_at?: string
          metadata?: Json | null
        }
        Update: {
          id?: string
          blog_title?: string
          blog_url?: string | null
          location_key?: string
          location_name?: string
          content?: string
          ai_model?: string
          status?: string
          error_message?: string | null
          character_count?: number | null
          post_date?: string
          created_at?: string
          metadata?: Json | null
        }
        Relationships: []
      }
      episodes_content: {
        Row: {
          bannerbear_image_url: string | null
          blog_html: string | null
          confidence_score: number | null
          created_at: string
          description: string | null
          facebook_status: Database["public"]["Enums"]["social_status"]
          facebook_url: string | null
          id: string
          image_url: string | null
          instagram_status: Database["public"]["Enums"]["social_status"]
          instagram_url: string | null
          intake_id: string | null
          seo_keywords: string[] | null
          show_name: string | null
          title: string | null
          updated_at: string | null
          wordpress_post_id: string | null
          wordpress_status: Database["public"]["Enums"]["wordpress_status"]
          wordpress_url: string | null
          youtube_status: Database["public"]["Enums"]["social_status"]
          youtube_url: string | null
        }
        Insert: {
          bannerbear_image_url?: string | null
          blog_html?: string | null
          confidence_score?: number | null
          created_at?: string
          description?: string | null
          facebook_status?: Database["public"]["Enums"]["social_status"]
          facebook_url?: string | null
          id?: string
          image_url?: string | null
          instagram_status?: Database["public"]["Enums"]["social_status"]
          instagram_url?: string | null
          intake_id?: string | null
          seo_keywords?: string[] | null
          show_name?: string | null
          title?: string | null
          updated_at?: string | null
          wordpress_post_id?: string | null
          wordpress_status?: Database["public"]["Enums"]["wordpress_status"]
          wordpress_url?: string | null
          youtube_status?: Database["public"]["Enums"]["social_status"]
          youtube_url?: string | null
        }
        Update: {
          bannerbear_image_url?: string | null
          blog_html?: string | null
          confidence_score?: number | null
          created_at?: string
          description?: string | null
          facebook_status?: Database["public"]["Enums"]["social_status"]
          facebook_url?: string | null
          id?: string
          image_url?: string | null
          instagram_status?: Database["public"]["Enums"]["social_status"]
          instagram_url?: string | null
          intake_id?: string | null
          seo_keywords?: string[] | null
          show_name?: string | null
          title?: string | null
          updated_at?: string | null
          wordpress_post_id?: string | null
          wordpress_status?: Database["public"]["Enums"]["wordpress_status"]
          wordpress_url?: string | null
          youtube_status?: Database["public"]["Enums"]["social_status"]
          youtube_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "episodes_content_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "intake_transcripts"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_transcripts: {
        Row: {
          clean_transcript: string | null
          created_at: string
          file_hash: string | null
          file_name: string | null
          file_url: string | null
          id: string
          meeting_uuid: string | null
          raw_transcript: string | null
          source_type: Database["public"]["Enums"]["intake_source_type"]
          status: Database["public"]["Enums"]["intake_status"]
        }
        Insert: {
          clean_transcript?: string | null
          created_at?: string
          file_hash?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          meeting_uuid?: string | null
          raw_transcript?: string | null
          source_type?: Database["public"]["Enums"]["intake_source_type"]
          status?: Database["public"]["Enums"]["intake_status"]
        }
        Update: {
          clean_transcript?: string | null
          created_at?: string
          file_hash?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          meeting_uuid?: string | null
          raw_transcript?: string | null
          source_type?: Database["public"]["Enums"]["intake_source_type"]
          status?: Database["public"]["Enums"]["intake_status"]
        }
        Relationships: []
      }
      summaries_matters: {
        Row: {
          attorney_status: Database["public"]["Enums"]["attorney_status"]
          client_name: string | null
          clio_matter_id: string | null
          created_at: string
          filed_at: string | null
          filed_to_clio: boolean
          id: string
          intake_id: string | null
          overridden_by: string | null
          summary_text: string | null
          updated_at: string | null
        }
        Insert: {
          attorney_status?: Database["public"]["Enums"]["attorney_status"]
          client_name?: string | null
          clio_matter_id?: string | null
          created_at?: string
          filed_at?: string | null
          filed_to_clio?: boolean
          id?: string
          intake_id?: string | null
          overridden_by?: string | null
          summary_text?: string | null
          updated_at?: string | null
        }
        Update: {
          attorney_status?: Database["public"]["Enums"]["attorney_status"]
          client_name?: string | null
          clio_matter_id?: string | null
          created_at?: string
          filed_at?: string | null
          filed_to_clio?: boolean
          id?: string
          intake_id?: string | null
          overridden_by?: string | null
          summary_text?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "summaries_matters_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "intake_transcripts"
            referencedColumns: ["id"]
          },
        ]
      }
      system_logs: {
        Row: {
          created_at: string
          details: Json | null
          entity_id: string | null
          event_type: Database["public"]["Enums"]["log_event_type"]
          id: string
          message: string
          resolved_by: string | null
          retry_count: number
          scenario_name: string
          status: Database["public"]["Enums"]["log_status"]
        }
        Insert: {
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          event_type?: Database["public"]["Enums"]["log_event_type"]
          id?: string
          message: string
          resolved_by?: string | null
          retry_count?: number
          scenario_name: string
          status?: Database["public"]["Enums"]["log_status"]
        }
        Update: {
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          event_type?: Database["public"]["Enums"]["log_event_type"]
          id?: string
          message?: string
          resolved_by?: string | null
          retry_count?: number
          scenario_name?: string
          status?: Database["public"]["Enums"]["log_status"]
        }
        Relationships: []
      }
      retry_queue: {
        Row: {
          id: string
          entity_id: string | null
          platform: string
          status: Database["public"]["Enums"]["retry_status"]
          attempts: number
          max_attempts: number
          next_retry_at: string
          last_error: string | null
          output_url: string | null
          payload: Json | null
          resolved_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          entity_id?: string | null
          platform: string
          status?: Database["public"]["Enums"]["retry_status"]
          attempts?: number
          max_attempts?: number
          next_retry_at?: string
          last_error?: string | null
          output_url?: string | null
          payload?: Json | null
          resolved_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          entity_id?: string | null
          platform?: string
          status?: Database["public"]["Enums"]["retry_status"]
          attempts?: number
          max_attempts?: number
          next_retry_at?: string
          last_error?: string | null
          output_url?: string | null
          payload?: Json | null
          resolved_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          role: "content" | "intake" | "admin"
          full_name: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          role?: "content" | "intake" | "admin"
          full_name?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          role?: "content" | "intake" | "admin"
          full_name?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      intake_leads: {
        Row: {
          id: string
          source: "lexidesk" | "acuity" | "manual"
          external_id: string | null
          client_first: string | null
          client_last: string | null
          email: string | null
          phone: string | null
          consult_datetime: string | null
          method: "zoom" | "phone" | "in_person" | null
          office: "mesa" | "peoria" | "scottsdale" | "tucson" | null
          self_scheduled: boolean | null
          consult_type: "IC" | "LSS" | null
          matter_type: string | null
          opposing_party_name: string | null
          county: string | null
          referral_source: string | null
          description: string | null
          priority_score: number | null
          qualified: boolean | null
          recording_url: string | null
          consulting_attorney: string | null
          assigned_advocate: string | null
          clio_matter_id: string | null
          clio_client_contact_id: string | null
          clio_op_contact_id: string | null
          clio_portal_id: string | null
          conflict_status: "pending" | "clear" | "conflict"
          status: Database["public"]["Enums"]["intake_lead_status"]
          raw_payload: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          source?: "lexidesk" | "acuity" | "manual"
          external_id?: string | null
          client_first?: string | null
          client_last?: string | null
          email?: string | null
          phone?: string | null
          consult_datetime?: string | null
          method?: "zoom" | "phone" | "in_person" | null
          office?: "mesa" | "peoria" | "scottsdale" | "tucson" | null
          self_scheduled?: boolean | null
          consult_type?: "IC" | "LSS" | null
          matter_type?: string | null
          opposing_party_name?: string | null
          county?: string | null
          referral_source?: string | null
          description?: string | null
          priority_score?: number | null
          qualified?: boolean | null
          recording_url?: string | null
          consulting_attorney?: string | null
          assigned_advocate?: string | null
          clio_matter_id?: string | null
          clio_client_contact_id?: string | null
          clio_op_contact_id?: string | null
          clio_portal_id?: string | null
          conflict_status?: "pending" | "clear" | "conflict"
          status?: Database["public"]["Enums"]["intake_lead_status"]
          raw_payload?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          source?: "lexidesk" | "acuity" | "manual"
          external_id?: string | null
          client_first?: string | null
          client_last?: string | null
          email?: string | null
          phone?: string | null
          consult_datetime?: string | null
          method?: "zoom" | "phone" | "in_person" | null
          office?: "mesa" | "peoria" | "scottsdale" | "tucson" | null
          self_scheduled?: boolean | null
          consult_type?: "IC" | "LSS" | null
          matter_type?: string | null
          opposing_party_name?: string | null
          county?: string | null
          referral_source?: string | null
          description?: string | null
          priority_score?: number | null
          qualified?: boolean | null
          recording_url?: string | null
          consulting_attorney?: string | null
          assigned_advocate?: string | null
          clio_matter_id?: string | null
          clio_client_contact_id?: string | null
          clio_op_contact_id?: string | null
          clio_portal_id?: string | null
          conflict_status?: "pending" | "clear" | "conflict"
          status?: Database["public"]["Enums"]["intake_lead_status"]
          raw_payload?: Json | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      intake_steps: {
        Row: {
          id: string
          lead_id: string
          step_key: string
          state: "pending" | "running" | "done" | "skipped" | "failed" | "awaiting_human"
          detail: Json | null
          error: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          lead_id: string
          step_key: string
          state?: "pending" | "running" | "done" | "skipped" | "failed" | "awaiting_human"
          detail?: Json | null
          error?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          lead_id?: string
          step_key?: string
          state?: "pending" | "running" | "done" | "skipped" | "failed" | "awaiting_human"
          detail?: Json | null
          error?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "intake_steps_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "intake_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      office_addresses: {
        Row: {
          office: "mesa" | "peoria" | "scottsdale" | "tucson"
          address: string
        }
        Insert: {
          office: "mesa" | "peoria" | "scottsdale" | "tucson"
          address: string
        }
        Update: {
          office?: "mesa" | "peoria" | "scottsdale" | "tucson"
          address?: string
        }
        Relationships: []
      }
      appointments: {
        Row: {
          id: string
          acuity_id: string
          datetime: string | null
          end_time: string | null
          duration_min: number | null
          type: string | null
          category: string | null
          appointment_type_id: string | null
          calendar: string | null
          attorney: string | null
          client_first: string | null
          client_last: string | null
          email: string | null
          phone: string | null
          location: string | null
          canceled: boolean
          is_consult: boolean
          lead_id: string | null
          raw: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          acuity_id: string
          datetime?: string | null
          end_time?: string | null
          duration_min?: number | null
          type?: string | null
          category?: string | null
          appointment_type_id?: string | null
          calendar?: string | null
          attorney?: string | null
          client_first?: string | null
          client_last?: string | null
          email?: string | null
          phone?: string | null
          location?: string | null
          canceled?: boolean
          is_consult?: boolean
          lead_id?: string | null
          raw?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          acuity_id?: string
          datetime?: string | null
          end_time?: string | null
          duration_min?: number | null
          type?: string | null
          category?: string | null
          appointment_type_id?: string | null
          calendar?: string | null
          attorney?: string | null
          client_first?: string | null
          client_last?: string | null
          email?: string | null
          phone?: string | null
          location?: string | null
          canceled?: boolean
          is_consult?: boolean
          lead_id?: string | null
          raw?: Json | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      integration_tokens: {
        Row: {
          provider: string
          access_token: string
          refresh_token: string | null
          expires_at: string | null
          account_name: string | null
          connected_by: string | null
          updated_at: string
        }
        Insert: {
          provider: string
          access_token: string
          refresh_token?: string | null
          expires_at?: string | null
          account_name?: string | null
          connected_by?: string | null
          updated_at?: string
        }
        Update: {
          provider?: string
          access_token?: string
          refresh_token?: string | null
          expires_at?: string | null
          account_name?: string | null
          connected_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      attorney_zoom_links: {
        Row: { attorney_name: string; zoom_link: string; updated_at: string }
        Insert: { attorney_name: string; zoom_link: string; updated_at?: string }
        Update: { attorney_name?: string; zoom_link?: string; updated_at?: string }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: {
      intake_lead_status:
        | "received"
        | "enriched"
        | "conflict_pending"
        | "conflict_clear"
        | "stopped"
        | "matter_created"
        | "manage_finished"
        | "portal_sent"
        | "text_sent"
        | "slack_pending"
        | "slack_posted"
        | "tasks_set"
        | "done"
        | "failed"
        | "canceled"
      attorney_status: "pending_review" | "approved" | "overridden"
      intake_source_type: "manual_upload" | "zoom_webhook"
      intake_status: "pending" | "processing" | "completed" | "failed"
      log_event_type: "info" | "warning" | "error"
      log_status: "logged" | "retrying" | "resolved"
      retry_status: "failed" | "retrying" | "resolved" | "needs_attention"
      social_status: "pending" | "published" | "failed"
      wordpress_status: "draft" | "published" | "failed"
    }
    CompositeTypes: { [_ in never]: never }
  }
}

type PublicSchema = Database["public"]

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"]
export type Enums<T extends keyof PublicSchema["Enums"]> =
  PublicSchema["Enums"][T]

// ── Convenience domain aliases ───────────────────────────────────────────────
export type IntakeTranscript = Tables<"intake_transcripts">
export type SummaryMatter = Tables<"summaries_matters">
export type EpisodeContent = Tables<"episodes_content">
export type SystemLog = Tables<"system_logs">

export type IntakeStatus = Enums<"intake_status">
export type AttorneyStatus = Enums<"attorney_status">
export type SocialStatus = Enums<"social_status">
export type WordpressStatus = Enums<"wordpress_status">
export type LogEventType = Enums<"log_event_type">
export type LogStatus = Enums<"log_status">
export type IntakeSourceType = Enums<"intake_source_type">

// ── Consultation intake automation ───────────────────────────────────────────
export type Profile = Tables<"profiles">
export type Role = Profile["role"]
export type IntakeLead = Tables<"intake_leads">
export type IntakeStep = Tables<"intake_steps">
export type IntakeLeadStatus = Enums<"intake_lead_status">
export type OfficeAddress = Tables<"office_addresses">
export type AttorneyZoomLink = Tables<"attorney_zoom_links">

// Joined shapes used by the archive & meetings pages
export type SummaryWithIntake = SummaryMatter & {
  intake_transcripts: IntakeTranscript | null
}
export type EpisodeWithIntake = EpisodeContent & {
  intake_transcripts: IntakeTranscript | null
}

// ── Recovery / Dead-Letter Queue (resilient automation design) ───────────────
// Populated by Make error handlers; drained by the recovery scenario.
export type RetryStatus = "failed" | "retrying" | "resolved" | "needs_attention"
export type RetryPlatform =
  | "instagram"
  | "facebook"
  | "youtube"
  | "wordpress"
  | "blog"
  | "prepare"
  | (string & {})

export interface RetryQueueJob {
  id: string
  entity_id: string | null
  platform: RetryPlatform
  status: RetryStatus
  attempts: number
  max_attempts: number
  next_retry_at: string
  last_error: string | null
  output_url: string | null
  payload: Json | null
  resolved_by: string | null
  created_at: string
  updated_at: string
}
export type Appointment = Tables<"appointments">
