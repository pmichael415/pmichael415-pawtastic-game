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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      checkout_sessions: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          payment_intent: string | null
          product_id: string
          status: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency: string
          id: string
          payment_intent?: string | null
          product_id: string
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          payment_intent?: string | null
          product_id?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      email_optins: {
        Row: {
          adult_confirmed: boolean
          email: string
          opted_in_at: string
          unsub_token: string
          unsubscribed_at: string | null
          user_id: string
        }
        Insert: {
          adult_confirmed: boolean
          email: string
          opted_in_at?: string
          unsub_token?: string
          unsubscribed_at?: string | null
          user_id: string
        }
        Update: {
          adult_confirmed?: boolean
          email?: string
          opted_in_at?: string
          unsub_token?: string
          unsubscribed_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      entitlements: {
        Row: {
          checkout_session_id: string
          granted_at: string
          id: string
          product_id: string
          revoked_at: string | null
          source_event_id: string
          user_id: string
        }
        Insert: {
          checkout_session_id: string
          granted_at?: string
          id?: string
          product_id: string
          revoked_at?: string | null
          source_event_id: string
          user_id: string
        }
        Update: {
          checkout_session_id?: string
          granted_at?: string
          id?: string
          product_id?: string
          revoked_at?: string | null
          source_event_id?: string
          user_id?: string
        }
        Relationships: []
      }
      game_events: {
        Row: {
          build: string
          client_at: string
          cohort_day: string
          device_id: string
          id: number
          name: string
          props: Json
          received_at: string
          session_id: string
        }
        Insert: {
          build: string
          client_at: string
          cohort_day: string
          device_id: string
          id?: number
          name: string
          props?: Json
          received_at?: string
          session_id: string
        }
        Update: {
          build?: string
          client_at?: string
          cohort_day?: string
          device_id?: string
          id?: number
          name?: string
          props?: Json
          received_at?: string
          session_id?: string
        }
        Relationships: []
      }
      game_saves: {
        Row: {
          data: Json
          game: string
          revision: number
          updated_at: string
          user_id: string
        }
        Insert: {
          data: Json
          game: string
          revision?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          data?: Json
          game?: string
          revision?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notify_config: {
        Row: {
          id: number
          origin: string
        }
        Insert: {
          id: number
          origin: string
        }
        Update: {
          id?: number
          origin?: string
        }
        Relationships: []
      }
      notify_deliveries: {
        Row: {
          channel: string
          created_at: string
          error: string | null
          message_id: string
          person: string
          sent_at: string | null
          status: string
          target_id: string
          week: string
        }
        Insert: {
          channel: string
          created_at?: string
          error?: string | null
          message_id: string
          person: string
          sent_at?: string | null
          status?: string
          target_id: string
          week: string
        }
        Update: {
          channel?: string
          created_at?: string
          error?: string | null
          message_id?: string
          person?: string
          sent_at?: string | null
          status?: string
          target_id?: string
          week?: string
        }
        Relationships: [
          {
            foreignKeyName: "notify_deliveries_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "notify_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      notify_keys: {
        Row: {
          created_at: string
          id: number
          run_secret: string
          vapid_private_jwk: Json
          vapid_public: string
        }
        Insert: {
          created_at?: string
          id: number
          run_secret: string
          vapid_private_jwk: Json
          vapid_public: string
        }
        Update: {
          created_at?: string
          id?: number
          run_secret?: string
          vapid_private_jwk?: Json
          vapid_public?: string
        }
        Relationships: []
      }
      notify_messages: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          audience_user: string | null
          body: string
          channels: string[]
          created_at: string
          email_body: string | null
          email_subject: string | null
          id: string
          kind: string
          path: string
          send_at: string
          sending_started_at: string | null
          sent_at: string | null
          status: string
          title: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          audience_user?: string | null
          body: string
          channels?: string[]
          created_at?: string
          email_body?: string | null
          email_subject?: string | null
          id?: string
          kind: string
          path?: string
          send_at: string
          sending_started_at?: string | null
          sent_at?: string | null
          status?: string
          title: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          audience_user?: string | null
          body?: string
          channels?: string[]
          created_at?: string
          email_body?: string | null
          email_subject?: string | null
          id?: string
          kind?: string
          path?: string
          send_at?: string
          sending_started_at?: string | null
          sent_at?: string | null
          status?: string
          title?: string
        }
        Relationships: []
      }
      payment_events: {
        Row: {
          event_id: string
          received_at: string
          result: string | null
          type: string
        }
        Insert: {
          event_id: string
          received_at?: string
          result?: string | null
          type: string
        }
        Update: {
          event_id?: string
          received_at?: string
          result?: string | null
          type?: string
        }
        Relationships: []
      }
      player_saves: {
        Row: {
          data: Json
          revision: number
          save_version: number
          updated_at: string
          user_id: string
        }
        Insert: {
          data: Json
          revision?: number
          save_version?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          data?: Json
          revision?: number
          save_version?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          device_id: string
          disabled_at: string | null
          endpoint: string
          failure_count: number
          id: string
          last_success_at: string | null
          p256dh: string
          user_id: string | null
        }
        Insert: {
          auth: string
          created_at?: string
          device_id: string
          disabled_at?: string | null
          endpoint: string
          failure_count?: number
          id?: string
          last_success_at?: string | null
          p256dh: string
          user_id?: string | null
        }
        Update: {
          auth?: string
          created_at?: string
          device_id?: string
          disabled_at?: string | null
          endpoint?: string
          failure_count?: number
          id?: string
          last_success_at?: string | null
          p256dh?: string
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      game_daily_funnel: {
        Row: {
          booking_link_clicks_by_referred_players: number | null
          booking_link_clicks_hawthorne: number | null
          booking_link_clicks_hillsdale: number | null
          build: string | null
          camera_list_picks: number | null
          camera_overhead_picks: number | null
          camera_walk_picks: number | null
          client_errors: number | null
          customer_app_link_clicks: number | null
          day: string | null
          directions_clicks: number | null
          first_time_players: number | null
          first_time_players_from_referrals: number | null
          invite_shares: number | null
          mobile_client_errors: number | null
          pawtastic_recommend_shares: number | null
          players: number | null
          players_completed_tutorial: number | null
          players_first_care_cycle: number | null
          players_picked_team_hawthorne: number | null
          players_picked_team_hillsdale: number | null
          players_who_checked_in: number | null
          referral_link_opens: number | null
          restore_failures: number | null
          shop_previews: number | null
        }
        Relationships: []
      }
      game_purchases_daily: {
        Row: {
          day: string | null
          failed_or_expired: number | null
          net_cents_test_mode: number | null
          product_id: string | null
          refunds: number | null
          verified_purchases: number | null
        }
        Relationships: []
      }
      game_retention: {
        Row: {
          cohort_day: string | null
          first_build: string | null
          players: number | null
          returned_days_8_to_30: number | null
          returned_next_day: number | null
          returned_within_7_days: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      grant_entitlement: {
        Args: {
          _amount: number
          _currency: string
          _event_id: string
          _payment_intent?: string
          _product_id: string
          _session_id: string
          _user_id: string
        }
        Returns: string
      }
      mark_checkout_closed: {
        Args: { _event_id: string; _session_id: string; _status: string }
        Returns: string
      }
      notify_claim_email: {
        Args: { _limit: number; _message: string; _week: string }
        Returns: {
          email: string
          unsub_token: string
          user_id: string
        }[]
      }
      notify_claim_push: {
        Args: { _limit: number; _message: string; _week: string }
        Returns: {
          auth: string
          endpoint: string
          p256dh: string
          subscription_id: string
        }[]
      }
      notify_email_unsubscribe: { Args: { _token: string }; Returns: boolean }
      notify_finish: {
        Args: { _message: string; _now: string }
        Returns: undefined
      }
      notify_get_keys: {
        Args: never
        Returns: {
          run_secret: string
          vapid_private_jwk: Json
          vapid_public: string
        }[]
      }
      notify_init_keys: {
        Args: { _private: Json; _public: string; _secret: string }
        Returns: undefined
      }
      notify_mark: {
        Args: {
          _channel: string
          _error: string
          _message: string
          _status: string
          _target: string
        }
        Returns: undefined
      }
      notify_push_result: {
        Args: { _gone: boolean; _ok: boolean; _subscription: string }
        Returns: undefined
      }
      notify_record_results: {
        Args: { _channel: string; _message: string; _results: Json }
        Returns: undefined
      }
      notify_set_email_optin: {
        Args: { _adult: boolean; _email: string; _on: boolean; _user: string }
        Returns: undefined
      }
      notify_start_next: {
        Args: { _now: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          audience_user: string | null
          body: string
          channels: string[]
          created_at: string
          email_body: string | null
          email_subject: string | null
          id: string
          kind: string
          path: string
          send_at: string
          sending_started_at: string | null
          sent_at: string | null
          status: string
          title: string
        }[]
        SetofOptions: {
          from: "*"
          to: "notify_messages"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      notify_subscribe: {
        Args: {
          _auth: string
          _device: string
          _endpoint: string
          _p256dh: string
          _user: string
        }
        Returns: string
      }
      notify_unsubscribe: { Args: { _endpoint: string }; Returns: boolean }
      referral_stats: {
        Args: { _code: string; _exclude_device: string }
        Returns: {
          completed: number
          joined: number
        }[]
      }
      revoke_entitlement_for_refund: {
        Args: { _event_id: string; _payment_intent: string }
        Returns: string
      }
      save_game_progress: {
        Args: { _data: Json; _expected_revision: number; _game: string }
        Returns: number
      }
      save_player_progress: {
        Args: { _data: Json; _expected_revision: number }
        Returns: number
      }
      team_standings: {
        Args: { _weeks_ago?: number }
        Returns: {
          players: number
          points: number
          team: string
        }[]
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
