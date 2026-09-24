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
      account_periods: {
        Row: {
          account_id: string
          closing_balance: number
          computed_at: string
          credit_total: number
          currency: string
          debit_total: number
          id: string
          net_movement: number
          org_id: string
          period_month: number
          period_year: number
        }
        Insert: {
          account_id: string
          closing_balance?: number
          computed_at?: string
          credit_total?: number
          currency?: string
          debit_total?: number
          id?: string
          net_movement?: number
          org_id: string
          period_month: number
          period_year: number
        }
        Update: {
          account_id?: string
          closing_balance?: number
          computed_at?: string
          credit_total?: number
          currency?: string
          debit_total?: number
          id?: string
          net_movement?: number
          org_id?: string
          period_month?: number
          period_year?: number
        }
        Relationships: [
          {
            foreignKeyName: "account_periods_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_periods_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      account_template_items: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          normal_balance: string
          parent_code: string | null
          sort_order: number
          template_id: string
          type: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          normal_balance: string
          parent_code?: string | null
          sort_order?: number
          template_id: string
          type: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          normal_balance?: string
          parent_code?: string | null
          sort_order?: number
          template_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "account_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      account_templates: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_system: boolean
          name: string
          org_id: string | null
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
          org_id?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
          org_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      accountant_access_grants: {
        Row: {
          accepted_at: string | null
          accountant_email: string
          accountant_user_id: string | null
          accountant_was_existing: boolean | null
          client_org_id: string
          client_user_id: string
          conversion_attributed_value: number | null
          conversion_to_pro_at: string | null
          created_at: string
          expires_at: string | null
          id: string
          invitation_token: string
          status: string
        }
        Insert: {
          accepted_at?: string | null
          accountant_email: string
          accountant_user_id?: string | null
          accountant_was_existing?: boolean | null
          client_org_id: string
          client_user_id: string
          conversion_attributed_value?: number | null
          conversion_to_pro_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          invitation_token?: string
          status?: string
        }
        Update: {
          accepted_at?: string | null
          accountant_email?: string
          accountant_user_id?: string | null
          accountant_was_existing?: boolean | null
          client_org_id?: string
          client_user_id?: string
          conversion_attributed_value?: number | null
          conversion_to_pro_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          invitation_token?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "accountant_access_grants_accountant_user_id_fkey"
            columns: ["accountant_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accountant_access_grants_accountant_user_id_fkey"
            columns: ["accountant_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accountant_access_grants_client_org_id_fkey"
            columns: ["client_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accountant_access_grants_client_user_id_fkey"
            columns: ["client_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accountant_access_grants_client_user_id_fkey"
            columns: ["client_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      accountant_invite_requests: {
        Row: {
          accountant_email: string
          accountant_name: string | null
          created_at: string
          id: string
          note: string | null
          org_id: string
          requested_by: string
          sent_at: string | null
          status: string
        }
        Insert: {
          accountant_email: string
          accountant_name?: string | null
          created_at?: string
          id?: string
          note?: string | null
          org_id: string
          requested_by: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          accountant_email?: string
          accountant_name?: string | null
          created_at?: string
          id?: string
          note?: string | null
          org_id?: string
          requested_by?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "accountant_invite_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accountant_invite_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accountant_invite_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          client_id: string | null
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          is_legacy: boolean
          level: number
          name: string
          normal_balance: Database["public"]["Enums"]["entry_type_enum"]
          opening_balance: number
          org_id: string
          parent_id: string | null
          schedule_c_line: number | null
          type: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_legacy?: boolean
          level?: number
          name: string
          normal_balance: Database["public"]["Enums"]["entry_type_enum"]
          opening_balance?: number
          org_id: string
          parent_id?: string | null
          schedule_c_line?: number | null
          type: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_legacy?: boolean
          level?: number
          name?: string
          normal_balance?: Database["public"]["Enums"]["entry_type_enum"]
          opening_balance?: number
          org_id?: string
          parent_id?: string | null
          schedule_c_line?: number | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_suggestions: {
        Row: {
          ai_reason: string | null
          confidence: number | null
          created_at: string
          expires_at: string | null
          human_override: Json | null
          id: string
          model_version: string | null
          org_id: string
          override_reason: string | null
          payload: Json
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["suggestion_status"]
          suggestion_type: Database["public"]["Enums"]["suggestion_type"]
          transaction_id: string | null
        }
        Insert: {
          ai_reason?: string | null
          confidence?: number | null
          created_at?: string
          expires_at?: string | null
          human_override?: Json | null
          id?: string
          model_version?: string | null
          org_id: string
          override_reason?: string | null
          payload?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["suggestion_status"]
          suggestion_type: Database["public"]["Enums"]["suggestion_type"]
          transaction_id?: string | null
        }
        Update: {
          ai_reason?: string | null
          confidence?: number | null
          created_at?: string
          expires_at?: string | null
          human_override?: Json | null
          id?: string
          model_version?: string | null
          org_id?: string
          override_reason?: string | null
          payload?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["suggestion_status"]
          suggestion_type?: Database["public"]["Enums"]["suggestion_type"]
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_suggestions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_suggestions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_suggestions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_suggestions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_suggestions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_chat_inbox"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "ai_suggestions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_doc_transaction_id"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "ai_suggestions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_with_client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_suggestions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_with_evidence"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          created_by: string
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          org_id: string
          revoked_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          org_id: string
          revoked_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          org_id?: string
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          actor_id: string | null
          actor_role: string | null
          created_at: string
          diff: Json | null
          entry_hash: string
          event_type: Database["public"]["Enums"]["audit_event_type"]
          id: string
          metadata: Json | null
          org_id: string
          previous_hash: string | null
          transaction_group_id: string
          transaction_id: string
          transaction_version: number
        }
        Insert: {
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          diff?: Json | null
          entry_hash: string
          event_type: Database["public"]["Enums"]["audit_event_type"]
          id?: string
          metadata?: Json | null
          org_id: string
          previous_hash?: string | null
          transaction_group_id: string
          transaction_id: string
          transaction_version: number
        }
        Update: {
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          diff?: Json | null
          entry_hash?: string
          event_type?: Database["public"]["Enums"]["audit_event_type"]
          id?: string
          metadata?: Json | null
          org_id?: string
          previous_hash?: string | null
          transaction_group_id?: string
          transaction_id?: string
          transaction_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_chat_inbox"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "audit_events_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_doc_transaction_id"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "audit_events_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_with_client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_with_evidence"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      bank_connections: {
        Row: {
          account_id: string | null
          account_name: string | null
          account_subtype: string | null
          account_type: string | null
          client_authorized_at: string | null
          client_id: string | null
          connected_at: string
          connected_by: string
          connected_by_portal: boolean
          created_at: string
          disconnected_at: string | null
          id: string
          institution_id: string | null
          institution_name: string | null
          is_active: boolean
          last_synced_at: string | null
          mask: string | null
          org_id: string
          plaid_access_token: string | null
          plaid_cursor: string | null
          plaid_item_id: string | null
          provider: Database["public"]["Enums"]["bank_provider"]
          sync_error: string | null
          sync_status: string | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          account_name?: string | null
          account_subtype?: string | null
          account_type?: string | null
          client_authorized_at?: string | null
          client_id?: string | null
          connected_at?: string
          connected_by: string
          connected_by_portal?: boolean
          created_at?: string
          disconnected_at?: string | null
          id?: string
          institution_id?: string | null
          institution_name?: string | null
          is_active?: boolean
          last_synced_at?: string | null
          mask?: string | null
          org_id: string
          plaid_access_token?: string | null
          plaid_cursor?: string | null
          plaid_item_id?: string | null
          provider?: Database["public"]["Enums"]["bank_provider"]
          sync_error?: string | null
          sync_status?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          account_name?: string | null
          account_subtype?: string | null
          account_type?: string | null
          client_authorized_at?: string | null
          client_id?: string | null
          connected_at?: string
          connected_by?: string
          connected_by_portal?: boolean
          created_at?: string
          disconnected_at?: string | null
          id?: string
          institution_id?: string | null
          institution_name?: string | null
          is_active?: boolean
          last_synced_at?: string | null
          mask?: string | null
          org_id?: string
          plaid_access_token?: string | null
          plaid_cursor?: string | null
          plaid_item_id?: string | null
          provider?: Database["public"]["Enums"]["bank_provider"]
          sync_error?: string | null
          sync_status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_connections_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_connections_connected_by_fkey"
            columns: ["connected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_connections_connected_by_fkey"
            columns: ["connected_by"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_connections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_imports: {
        Row: {
          account_subtype: string | null
          account_type: string | null
          created_at: string
          error_count: number
          errors: Json | null
          filename: string | null
          id: string
          imported_at: string
          imported_by: string
          org_id: string
          processed_at: string | null
          processed_count: number
          raw_content: string | null
          row_count: number
          source: Database["public"]["Enums"]["tx_source"]
          status: Database["public"]["Enums"]["bank_import_status"]
        }
        Insert: {
          account_subtype?: string | null
          account_type?: string | null
          created_at?: string
          error_count?: number
          errors?: Json | null
          filename?: string | null
          id?: string
          imported_at?: string
          imported_by: string
          org_id: string
          processed_at?: string | null
          processed_count?: number
          raw_content?: string | null
          row_count?: number
          source: Database["public"]["Enums"]["tx_source"]
          status?: Database["public"]["Enums"]["bank_import_status"]
        }
        Update: {
          account_subtype?: string | null
          account_type?: string | null
          created_at?: string
          error_count?: number
          errors?: Json | null
          filename?: string | null
          id?: string
          imported_at?: string
          imported_by?: string
          org_id?: string
          processed_at?: string | null
          processed_count?: number
          raw_content?: string | null
          row_count?: number
          source?: Database["public"]["Enums"]["tx_source"]
          status?: Database["public"]["Enums"]["bank_import_status"]
        }
        Relationships: [
          {
            foreignKeyName: "bank_imports_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_imports_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_imports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_exempt_users: {
        Row: {
          created_at: string
          reason: string
          user_id: string
        }
        Insert: {
          created_at?: string
          reason: string
          user_id: string
        }
        Update: {
          created_at?: string
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
      cgc_validations: {
        Row: {
          cgc_confidence: number | null
          cgc_engine_version: string | null
          cgc_recommendation: string | null
          cgc_session_id: string | null
          created_at: string
          id: string
          latency_ms: number | null
          org_id: string
          policies_checked: number
          proof_hash: string | null
          transaction_id: string
          validation_result: string
          violations: Json
        }
        Insert: {
          cgc_confidence?: number | null
          cgc_engine_version?: string | null
          cgc_recommendation?: string | null
          cgc_session_id?: string | null
          created_at?: string
          id?: string
          latency_ms?: number | null
          org_id: string
          policies_checked?: number
          proof_hash?: string | null
          transaction_id: string
          validation_result: string
          violations?: Json
        }
        Update: {
          cgc_confidence?: number | null
          cgc_engine_version?: string | null
          cgc_recommendation?: string | null
          cgc_session_id?: string | null
          created_at?: string
          id?: string
          latency_ms?: number | null
          org_id?: string
          policies_checked?: number
          proof_hash?: string | null
          transaction_id?: string
          validation_result?: string
          violations?: Json
        }
        Relationships: [
          {
            foreignKeyName: "cgc_validations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cgc_validations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cgc_validations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "v_chat_inbox"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "cgc_validations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "v_doc_transaction_id"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "cgc_validations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "v_transaction_with_client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cgc_validations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "v_transaction_with_evidence"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      checklist_run_items: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          description: string | null
          due_at: string | null
          id: string
          org_id: string
          run_id: string
          sort_order: number
          title: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          org_id: string
          run_id: string
          sort_order?: number
          title: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          org_id?: string
          run_id?: string
          sort_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_run_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_run_items_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "checklist_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_runs: {
        Row: {
          client_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          id: string
          org_id: string
          recurring_id: string | null
          run_date: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          org_id: string
          recurring_id?: string | null
          run_date: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          org_id?: string
          recurring_id?: string | null
          run_date?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_runs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_runs_recurring_id_fkey"
            columns: ["recurring_id"]
            isOneToOne: false
            referencedRelation: "recurring_checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contact_permissions: {
        Row: {
          allow_email: boolean
          allow_sms: boolean
          allow_transaction_resolution_contact: boolean
          client_id: string
          consent_recorded_at: string | null
          consent_recorded_by: string | null
          created_at: string
          email_address: string | null
          id: string
          org_id: string
          sms_number: string | null
          updated_at: string
        }
        Insert: {
          allow_email?: boolean
          allow_sms?: boolean
          allow_transaction_resolution_contact?: boolean
          client_id: string
          consent_recorded_at?: string | null
          consent_recorded_by?: string | null
          created_at?: string
          email_address?: string | null
          id?: string
          org_id: string
          sms_number?: string | null
          updated_at?: string
        }
        Update: {
          allow_email?: boolean
          allow_sms?: boolean
          allow_transaction_resolution_contact?: boolean
          client_id?: string
          consent_recorded_at?: string | null
          consent_recorded_by?: string | null
          created_at?: string
          email_address?: string | null
          id?: string
          org_id?: string
          sms_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_contact_permissions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contact_permissions_consent_recorded_by_fkey"
            columns: ["consent_recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contact_permissions_consent_recorded_by_fkey"
            columns: ["consent_recorded_by"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contact_permissions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_portal_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          client_id: string
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_at: string
          invited_by: string
          org_id: string
          role: Database["public"]["Enums"]["client_portal_role"]
          status: Database["public"]["Enums"]["client_portal_invitation_status"]
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          client_id: string
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_at?: string
          invited_by: string
          org_id: string
          role?: Database["public"]["Enums"]["client_portal_role"]
          status?: Database["public"]["Enums"]["client_portal_invitation_status"]
          token?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          client_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_at?: string
          invited_by?: string
          org_id?: string
          role?: Database["public"]["Enums"]["client_portal_role"]
          status?: Database["public"]["Enums"]["client_portal_invitation_status"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_portal_invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_invitations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_invitations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_portal_users: {
        Row: {
          accepted_at: string | null
          client_id: string
          created_at: string
          id: string
          invited_at: string
          invited_by: string | null
          is_active: boolean
          is_primary: boolean
          org_id: string
          profile_id: string
          role: Database["public"]["Enums"]["client_portal_role"]
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          client_id: string
          created_at?: string
          id?: string
          invited_at?: string
          invited_by?: string | null
          is_active?: boolean
          is_primary?: boolean
          org_id: string
          profile_id: string
          role?: Database["public"]["Enums"]["client_portal_role"]
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          client_id?: string
          created_at?: string
          id?: string
          invited_at?: string
          invited_by?: string | null
          is_active?: boolean
          is_primary?: boolean
          org_id?: string
          profile_id?: string
          role?: Database["public"]["Enums"]["client_portal_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_portal_users_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_users_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_users_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_users_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_users_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_users_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      client_workflows: {
        Row: {
          client_id: string
          created_at: string
          manual_state:
            | Database["public"]["Enums"]["client_workflow_state"]
            | null
          manual_state_expires_at: string | null
          manual_state_set_at: string | null
          notes: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          manual_state?:
            | Database["public"]["Enums"]["client_workflow_state"]
            | null
          manual_state_expires_at?: string | null
          manual_state_set_at?: string | null
          notes?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          manual_state?:
            | Database["public"]["Enums"]["client_workflow_state"]
            | null
          manual_state_expires_at?: string | null
          manual_state_set_at?: string | null
          notes?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_workflows_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_workflows_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_workflows_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          company_name: string | null
          country: string | null
          created_at: string
          created_by: string
          default_currency: string | null
          display_name: string
          email: string | null
          id: string
          is_active: boolean
          notes: string | null
          org_id: string
          payment_terms: number | null
          phone: string | null
          postal_code: string | null
          primary_user_id: string | null
          state: string | null
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          company_name?: string | null
          country?: string | null
          created_at?: string
          created_by: string
          default_currency?: string | null
          display_name: string
          email?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          org_id: string
          payment_terms?: number | null
          phone?: string | null
          postal_code?: string | null
          primary_user_id?: string | null
          state?: string | null
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          company_name?: string | null
          country?: string | null
          created_at?: string
          created_by?: string
          default_currency?: string | null
          display_name?: string
          email?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          org_id?: string
          payment_terms?: number | null
          phone?: string | null
          postal_code?: string | null
          primary_user_id?: string | null
          state?: string | null
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_primary_user_id_fkey"
            columns: ["primary_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_primary_user_id_fkey"
            columns: ["primary_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_records: {
        Row: {
          accepted_at: string
          channel: string
          document: string
          id: string
          user_agent: string | null
          user_id: string
          version: string
        }
        Insert: {
          accepted_at?: string
          channel: string
          document: string
          id?: string
          user_agent?: string | null
          user_id: string
          version: string
        }
        Update: {
          accepted_at?: string
          channel?: string
          document?: string
          id?: string
          user_agent?: string | null
          user_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "consent_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      decisions: {
        Row: {
          actor_id: string
          actor_role: string
          after_state: Json
          before_state: Json
          cgc_validation_id: string | null
          created_at: string
          decision_type: string
          id: string
          org_id: string
          previous_hash: string | null
          proof_hash: string | null
          reason: string | null
          suggestion_id: string | null
          transaction_id: string | null
        }
        Insert: {
          actor_id: string
          actor_role: string
          after_state?: Json
          before_state?: Json
          cgc_validation_id?: string | null
          created_at?: string
          decision_type: string
          id?: string
          org_id: string
          previous_hash?: string | null
          proof_hash?: string | null
          reason?: string | null
          suggestion_id?: string | null
          transaction_id?: string | null
        }
        Update: {
          actor_id?: string
          actor_role?: string
          after_state?: Json
          before_state?: Json
          cgc_validation_id?: string | null
          created_at?: string
          decision_type?: string
          id?: string
          org_id?: string
          previous_hash?: string | null
          proof_hash?: string | null
          reason?: string | null
          suggestion_id?: string | null
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "decisions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_cgc_validation_id_fkey"
            columns: ["cgc_validation_id"]
            isOneToOne: false
            referencedRelation: "cgc_validations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_suggestion_id_fkey"
            columns: ["suggestion_id"]
            isOneToOne: false
            referencedRelation: "ai_suggestions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_chat_inbox"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "decisions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_doc_transaction_id"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "decisions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_with_client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_with_evidence"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      document_requests: {
        Row: {
          client_id: string
          conversation_id: string | null
          created_at: string
          description: string | null
          document_id: string | null
          due_at: string | null
          id: string
          is_sensitive: boolean
          org_id: string
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          client_id: string
          conversation_id?: string | null
          created_at?: string
          description?: string | null
          document_id?: string | null
          due_at?: string | null
          id?: string
          is_sensitive?: boolean
          org_id: string
          requested_by: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          conversation_id?: string | null
          created_at?: string
          description?: string | null
          document_id?: string | null
          due_at?: string | null
          id?: string
          is_sensitive?: boolean
          org_id?: string
          requested_by?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_requests_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "workspace_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_requests_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          client_id: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          document_kind: string
          filename: string
          final_hash: string | null
          height: number | null
          id: string
          mime_type: string
          ocr_completed_at: string | null
          ocr_text: string | null
          org_id: string
          previous_hash: string | null
          raw_hash: string | null
          size_bytes: number
          storage_bucket: string
          storage_path: string
          transaction_id: string | null
          uploaded_by: string
          uploaded_by_role: string
          width: number | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          document_kind?: string
          filename: string
          final_hash?: string | null
          height?: number | null
          id?: string
          mime_type: string
          ocr_completed_at?: string | null
          ocr_text?: string | null
          org_id: string
          previous_hash?: string | null
          raw_hash?: string | null
          size_bytes: number
          storage_bucket?: string
          storage_path: string
          transaction_id?: string | null
          uploaded_by: string
          uploaded_by_role: string
          width?: number | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          document_kind?: string
          filename?: string
          final_hash?: string | null
          height?: number | null
          id?: string
          mime_type?: string
          ocr_completed_at?: string | null
          ocr_text?: string | null
          org_id?: string
          previous_hash?: string | null
          raw_hash?: string | null
          size_bytes?: number
          storage_bucket?: string
          storage_path?: string
          transaction_id?: string | null
          uploaded_by?: string
          uploaded_by_role?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_chat_inbox"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "documents_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_doc_transaction_id"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "documents_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_with_client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_with_evidence"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      estimate_items: {
        Row: {
          created_at: string
          description: string
          discount_pct: number
          estimate_id: string
          id: string
          item_type: Database["public"]["Enums"]["invoice_item_type"]
          line_discount: number
          line_subtotal: number
          line_tax: number
          line_total: number
          org_id: string
          quantity: number
          sort_order: number
          tax_rate: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          description: string
          discount_pct?: number
          estimate_id: string
          id?: string
          item_type?: Database["public"]["Enums"]["invoice_item_type"]
          line_discount?: number
          line_subtotal?: number
          line_tax?: number
          line_total?: number
          org_id: string
          quantity?: number
          sort_order?: number
          tax_rate?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string
          discount_pct?: number
          estimate_id?: string
          id?: string
          item_type?: Database["public"]["Enums"]["invoice_item_type"]
          line_discount?: number
          line_subtotal?: number
          line_tax?: number
          line_total?: number
          org_id?: string
          quantity?: number
          sort_order?: number
          tax_rate?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "estimate_items_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_responses: {
        Row: {
          created_at: string
          estimate_id: string
          id: string
          message: string | null
          proposed_items: Json | null
          proposed_total: number | null
          responder_email: string | null
          responder_ip: unknown
          responder_name: string | null
          response_type: Database["public"]["Enums"]["estimate_response_type"]
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          estimate_id: string
          id?: string
          message?: string | null
          proposed_items?: Json | null
          proposed_total?: number | null
          responder_email?: string | null
          responder_ip?: unknown
          responder_name?: string | null
          response_type: Database["public"]["Enums"]["estimate_response_type"]
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          estimate_id?: string
          id?: string
          message?: string | null
          proposed_items?: Json | null
          proposed_total?: number | null
          responder_email?: string | null
          responder_ip?: unknown
          responder_name?: string | null
          response_type?: Database["public"]["Enums"]["estimate_response_type"]
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimate_responses_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_signatures: {
        Row: {
          estimate_id: string
          id: string
          signature_hash: string
          signature_text: string
          signed_at: string
          signer_email: string | null
          signer_ip: unknown
          signer_name: string
          signer_role: Database["public"]["Enums"]["estimate_signer_role"]
          user_agent: string | null
        }
        Insert: {
          estimate_id: string
          id?: string
          signature_hash: string
          signature_text: string
          signed_at?: string
          signer_email?: string | null
          signer_ip?: unknown
          signer_name: string
          signer_role: Database["public"]["Enums"]["estimate_signer_role"]
          user_agent?: string | null
        }
        Update: {
          estimate_id?: string
          id?: string
          signature_hash?: string
          signature_text?: string
          signed_at?: string
          signer_email?: string | null
          signer_ip?: unknown
          signer_name?: string
          signer_role?: Database["public"]["Enums"]["estimate_signer_role"]
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimate_signatures_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_templates: {
        Row: {
          category: Database["public"]["Enums"]["estimate_template_category"]
          created_at: string
          created_by: string | null
          default_footer: string | null
          default_items: Json
          default_notes: string | null
          default_terms: string | null
          default_valid_days: number | null
          description: string | null
          id: string
          is_active: boolean
          is_global: boolean
          name: string
          org_id: string | null
          updated_at: string
          usage_count: number
        }
        Insert: {
          category: Database["public"]["Enums"]["estimate_template_category"]
          created_at?: string
          created_by?: string | null
          default_footer?: string | null
          default_items?: Json
          default_notes?: string | null
          default_terms?: string | null
          default_valid_days?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_global?: boolean
          name: string
          org_id?: string | null
          updated_at?: string
          usage_count?: number
        }
        Update: {
          category?: Database["public"]["Enums"]["estimate_template_category"]
          created_at?: string
          created_by?: string | null
          default_footer?: string | null
          default_items?: Json
          default_notes?: string | null
          default_terms?: string | null
          default_valid_days?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_global?: boolean
          name?: string
          org_id?: string | null
          updated_at?: string
          usage_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "estimate_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      estimates: {
        Row: {
          accepted_at: string | null
          accepted_by_name: string | null
          accepted_ip: unknown
          accepted_signature_text: string | null
          accepted_user_agent: string | null
          bill_to_address_line1: string | null
          bill_to_address_line2: string | null
          bill_to_city: string | null
          bill_to_company: string | null
          bill_to_country: string | null
          bill_to_email: string | null
          bill_to_name: string | null
          bill_to_phone: string | null
          bill_to_postal_code: string | null
          bill_to_snapshot_at: string | null
          bill_to_state: string | null
          bill_to_tax_id: string | null
          cancelled_at: string | null
          cancelled_reason: string | null
          client_id: string
          converted_at: string | null
          converted_to_invoice_id: string | null
          counter_offer_note: string | null
          counter_offered_at: string | null
          created_at: string
          created_by: string
          currency: string
          discount_total: number
          estimate_number: string
          final_hash: string | null
          footer: string | null
          id: string
          issue_date: string
          notes: string | null
          org_id: string
          parent_estimate_id: string | null
          previous_hash: string | null
          public_token: string | null
          raw_hash: string | null
          rejected_at: string | null
          rejected_by_name: string | null
          rejected_reason: string | null
          scope_description: string | null
          sent_at: string | null
          sent_method: string | null
          sent_to: string | null
          status: Database["public"]["Enums"]["estimate_status"]
          subtotal: number
          tax_total: number
          template_category:
            | Database["public"]["Enums"]["estimate_template_category"]
            | null
          template_id: string | null
          terms: string | null
          title: string | null
          total: number
          updated_at: string
          valid_until: string | null
          view_count: number
          viewed_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_by_name?: string | null
          accepted_ip?: unknown
          accepted_signature_text?: string | null
          accepted_user_agent?: string | null
          bill_to_address_line1?: string | null
          bill_to_address_line2?: string | null
          bill_to_city?: string | null
          bill_to_company?: string | null
          bill_to_country?: string | null
          bill_to_email?: string | null
          bill_to_name?: string | null
          bill_to_phone?: string | null
          bill_to_postal_code?: string | null
          bill_to_snapshot_at?: string | null
          bill_to_state?: string | null
          bill_to_tax_id?: string | null
          cancelled_at?: string | null
          cancelled_reason?: string | null
          client_id: string
          converted_at?: string | null
          converted_to_invoice_id?: string | null
          counter_offer_note?: string | null
          counter_offered_at?: string | null
          created_at?: string
          created_by: string
          currency?: string
          discount_total?: number
          estimate_number: string
          final_hash?: string | null
          footer?: string | null
          id?: string
          issue_date?: string
          notes?: string | null
          org_id: string
          parent_estimate_id?: string | null
          previous_hash?: string | null
          public_token?: string | null
          raw_hash?: string | null
          rejected_at?: string | null
          rejected_by_name?: string | null
          rejected_reason?: string | null
          scope_description?: string | null
          sent_at?: string | null
          sent_method?: string | null
          sent_to?: string | null
          status?: Database["public"]["Enums"]["estimate_status"]
          subtotal?: number
          tax_total?: number
          template_category?:
            | Database["public"]["Enums"]["estimate_template_category"]
            | null
          template_id?: string | null
          terms?: string | null
          title?: string | null
          total?: number
          updated_at?: string
          valid_until?: string | null
          view_count?: number
          viewed_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          accepted_by_name?: string | null
          accepted_ip?: unknown
          accepted_signature_text?: string | null
          accepted_user_agent?: string | null
          bill_to_address_line1?: string | null
          bill_to_address_line2?: string | null
          bill_to_city?: string | null
          bill_to_company?: string | null
          bill_to_country?: string | null
          bill_to_email?: string | null
          bill_to_name?: string | null
          bill_to_phone?: string | null
          bill_to_postal_code?: string | null
          bill_to_snapshot_at?: string | null
          bill_to_state?: string | null
          bill_to_tax_id?: string | null
          cancelled_at?: string | null
          cancelled_reason?: string | null
          client_id?: string
          converted_at?: string | null
          converted_to_invoice_id?: string | null
          counter_offer_note?: string | null
          counter_offered_at?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          discount_total?: number
          estimate_number?: string
          final_hash?: string | null
          footer?: string | null
          id?: string
          issue_date?: string
          notes?: string | null
          org_id?: string
          parent_estimate_id?: string | null
          previous_hash?: string | null
          public_token?: string | null
          raw_hash?: string | null
          rejected_at?: string | null
          rejected_by_name?: string | null
          rejected_reason?: string | null
          scope_description?: string | null
          sent_at?: string | null
          sent_method?: string | null
          sent_to?: string | null
          status?: Database["public"]["Enums"]["estimate_status"]
          subtotal?: number
          tax_total?: number
          template_category?:
            | Database["public"]["Enums"]["estimate_template_category"]
            | null
          template_id?: string | null
          terms?: string | null
          title?: string | null
          total?: number
          updated_at?: string
          valid_until?: string | null
          view_count?: number
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimates_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_converted_to_invoice_id_fkey"
            columns: ["converted_to_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_parent_estimate_id_fkey"
            columns: ["parent_estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_rates: {
        Row: {
          currency: string
          fetched_at: string
          usd_rate: number
        }
        Insert: {
          currency: string
          fetched_at?: string
          usd_rate: number
        }
        Update: {
          currency?: string
          fetched_at?: string
          usd_rate?: number
        }
        Relationships: []
      }
      impersonation_audit: {
        Row: {
          action: string
          actor_role: Database["public"]["Enums"]["system_role"]
          actor_user_id: string
          context_client_id: string | null
          context_org_id: string | null
          context_user_id: string | null
          created_at: string
          id: string
          query_metadata: Json | null
          target_count: number | null
          target_table: string | null
        }
        Insert: {
          action: string
          actor_role: Database["public"]["Enums"]["system_role"]
          actor_user_id: string
          context_client_id?: string | null
          context_org_id?: string | null
          context_user_id?: string | null
          created_at?: string
          id?: string
          query_metadata?: Json | null
          target_count?: number | null
          target_table?: string | null
        }
        Update: {
          action?: string
          actor_role?: Database["public"]["Enums"]["system_role"]
          actor_user_id?: string
          context_client_id?: string | null
          context_org_id?: string | null
          context_user_id?: string | null
          created_at?: string
          id?: string
          query_metadata?: Json | null
          target_count?: number | null
          target_table?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "impersonation_audit_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impersonation_audit_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impersonation_audit_context_client_id_fkey"
            columns: ["context_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impersonation_audit_context_org_id_fkey"
            columns: ["context_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impersonation_audit_context_user_id_fkey"
            columns: ["context_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impersonation_audit_context_user_id_fkey"
            columns: ["context_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          client_id: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invitation_type: Database["public"]["Enums"]["invitation_type"]
          invited_by: string
          org_id: string
          role: Database["public"]["Enums"]["lp_role"]
          status: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          client_id?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invitation_type?: Database["public"]["Enums"]["invitation_type"]
          invited_by: string
          org_id: string
          role?: Database["public"]["Enums"]["lp_role"]
          status?: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          client_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invitation_type?: Database["public"]["Enums"]["invitation_type"]
          invited_by?: string
          org_id?: string
          role?: Database["public"]["Enums"]["lp_role"]
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          created_at: string
          description: string
          discount_pct: number
          id: string
          invoice_id: string
          item_type: Database["public"]["Enums"]["invoice_item_type"]
          line_discount: number
          line_subtotal: number
          line_tax: number
          line_total: number
          org_id: string
          quantity: number
          sort_order: number
          tax_rate: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          description: string
          discount_pct?: number
          id?: string
          invoice_id: string
          item_type?: Database["public"]["Enums"]["invoice_item_type"]
          line_discount?: number
          line_subtotal?: number
          line_tax?: number
          line_total?: number
          org_id: string
          quantity?: number
          sort_order?: number
          tax_rate?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string
          discount_pct?: number
          id?: string
          invoice_id?: string
          item_type?: Database["public"]["Enums"]["invoice_item_type"]
          line_discount?: number
          line_subtotal?: number
          line_tax?: number
          line_total?: number
          org_id?: string
          quantity?: number
          sort_order?: number
          tax_rate?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          fx_rate_at_payment: number | null
          id: string
          invoice_id: string
          method: string | null
          notes: string | null
          org_id: string
          payment_date: string
          recorded_by: string
          reference: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          fx_rate_at_payment?: number | null
          id?: string
          invoice_id: string
          method?: string | null
          notes?: string | null
          org_id: string
          payment_date?: string
          recorded_by: string
          reference?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          fx_rate_at_payment?: number | null
          id?: string
          invoice_id?: string
          method?: string | null
          notes?: string | null
          org_id?: string
          payment_date?: string
          recorded_by?: string
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid: number
          balance_due: number
          bill_to_address_line1: string | null
          bill_to_address_line2: string | null
          bill_to_city: string | null
          bill_to_company: string | null
          bill_to_country: string | null
          bill_to_email: string | null
          bill_to_name: string | null
          bill_to_phone: string | null
          bill_to_postal_code: string | null
          bill_to_snapshot_at: string | null
          bill_to_state: string | null
          bill_to_tax_id: string | null
          client_id: string
          created_at: string
          created_by: string
          currency: string
          discount_total: number
          due_date: string
          footer: string | null
          fx_rate_at_creation: number | null
          id: string
          invoice_number: string
          issue_date: string
          notes: string | null
          org_id: string
          public_token: string | null
          recurring_id: string | null
          sent_at: string | null
          sent_to: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          tax_total: number
          terms: string | null
          title: string | null
          total: number
          updated_at: string
          viewed_at: string | null
        }
        Insert: {
          amount_paid?: number
          balance_due?: number
          bill_to_address_line1?: string | null
          bill_to_address_line2?: string | null
          bill_to_city?: string | null
          bill_to_company?: string | null
          bill_to_country?: string | null
          bill_to_email?: string | null
          bill_to_name?: string | null
          bill_to_phone?: string | null
          bill_to_postal_code?: string | null
          bill_to_snapshot_at?: string | null
          bill_to_state?: string | null
          bill_to_tax_id?: string | null
          client_id: string
          created_at?: string
          created_by: string
          currency?: string
          discount_total?: number
          due_date: string
          footer?: string | null
          fx_rate_at_creation?: number | null
          id?: string
          invoice_number: string
          issue_date?: string
          notes?: string | null
          org_id: string
          public_token?: string | null
          recurring_id?: string | null
          sent_at?: string | null
          sent_to?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax_total?: number
          terms?: string | null
          title?: string | null
          total?: number
          updated_at?: string
          viewed_at?: string | null
        }
        Update: {
          amount_paid?: number
          balance_due?: number
          bill_to_address_line1?: string | null
          bill_to_address_line2?: string | null
          bill_to_city?: string | null
          bill_to_company?: string | null
          bill_to_country?: string | null
          bill_to_email?: string | null
          bill_to_name?: string | null
          bill_to_phone?: string | null
          bill_to_postal_code?: string | null
          bill_to_snapshot_at?: string | null
          bill_to_state?: string | null
          bill_to_tax_id?: string | null
          client_id?: string
          created_at?: string
          created_by?: string
          currency?: string
          discount_total?: number
          due_date?: string
          footer?: string | null
          fx_rate_at_creation?: number | null
          id?: string
          invoice_number?: string
          issue_date?: string
          notes?: string | null
          org_id?: string
          public_token?: string | null
          recurring_id?: string | null
          sent_at?: string | null
          sent_to?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax_total?: number
          terms?: string | null
          title?: string | null
          total?: number
          updated_at?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_recurring_id_fkey"
            columns: ["recurring_id"]
            isOneToOne: false
            referencedRelation: "recurring_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          account_id: string
          amount: number
          amount_usd: number | null
          batch_id: string | null
          created_at: string
          currency: string
          entry_kind: Database["public"]["Enums"]["journal_entry_kind"]
          entry_type: Database["public"]["Enums"]["entry_type_enum"]
          id: string
          is_reversed: boolean
          memo: string | null
          period_month: number
          period_year: number
          reversal_entry_id: string | null
          transaction_id: string | null
        }
        Insert: {
          account_id: string
          amount: number
          amount_usd?: number | null
          batch_id?: string | null
          created_at?: string
          currency: string
          entry_kind?: Database["public"]["Enums"]["journal_entry_kind"]
          entry_type: Database["public"]["Enums"]["entry_type_enum"]
          id?: string
          is_reversed?: boolean
          memo?: string | null
          period_month: number
          period_year: number
          reversal_entry_id?: string | null
          transaction_id?: string | null
        }
        Update: {
          account_id?: string
          amount?: number
          amount_usd?: number | null
          batch_id?: string | null
          created_at?: string
          currency?: string
          entry_kind?: Database["public"]["Enums"]["journal_entry_kind"]
          entry_type?: Database["public"]["Enums"]["entry_type_enum"]
          id?: string
          is_reversed?: boolean
          memo?: string | null
          period_month?: number
          period_year?: number
          reversal_entry_id?: string | null
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "manual_journal_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_reversal_entry_id_fkey"
            columns: ["reversal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_chat_inbox"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "journal_entries_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_doc_transaction_id"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "journal_entries_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_with_client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_with_evidence"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      lp_migration_log: {
        Row: {
          applied_at: string | null
          applied_by: string | null
          checksum: string | null
          description: string
          id: number
          notes: string | null
          version: string
        }
        Insert: {
          applied_at?: string | null
          applied_by?: string | null
          checksum?: string | null
          description: string
          id?: number
          notes?: string | null
          version: string
        }
        Update: {
          applied_at?: string | null
          applied_by?: string | null
          checksum?: string | null
          description?: string
          id?: number
          notes?: string | null
          version?: string
        }
        Relationships: []
      }
      manual_journal_batches: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          client_id: string | null
          created_at: string
          effective_date: string
          entry_kind: Database["public"]["Enums"]["journal_entry_kind"]
          id: string
          memo: string
          org_id: string
          period_month: number
          period_year: number
          posted_at: string | null
          posted_by: string | null
          prepared_by: string
          reversed_by_batch_id: string | null
          reverses_batch_id: string | null
          status: Database["public"]["Enums"]["manual_journal_batch_status"]
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          client_id?: string | null
          created_at?: string
          effective_date: string
          entry_kind: Database["public"]["Enums"]["journal_entry_kind"]
          id?: string
          memo: string
          org_id: string
          period_month: number
          period_year: number
          posted_at?: string | null
          posted_by?: string | null
          prepared_by: string
          reversed_by_batch_id?: string | null
          reverses_batch_id?: string | null
          status?: Database["public"]["Enums"]["manual_journal_batch_status"]
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          client_id?: string | null
          created_at?: string
          effective_date?: string
          entry_kind?: Database["public"]["Enums"]["journal_entry_kind"]
          id?: string
          memo?: string
          org_id?: string
          period_month?: number
          period_year?: number
          posted_at?: string | null
          posted_by?: string | null
          prepared_by?: string
          reversed_by_batch_id?: string | null
          reverses_batch_id?: string | null
          status?: Database["public"]["Enums"]["manual_journal_batch_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_journal_batches_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_journal_batches_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_journal_batches_reversed_by_batch_id_fkey"
            columns: ["reversed_by_batch_id"]
            isOneToOne: false
            referencedRelation: "manual_journal_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_journal_batches_reverses_batch_id_fkey"
            columns: ["reverses_batch_id"]
            isOneToOne: false
            referencedRelation: "manual_journal_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      mileage_connections: {
        Row: {
          created_at: string
          created_by: string
          id: string
          label: string
          last_received_at: string | null
          org_id: string
          provider: string
          revoked_at: string | null
          status: string
          token_hash: string
          token_prefix: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          id?: string
          label: string
          last_received_at?: string | null
          org_id: string
          provider?: string
          revoked_at?: string | null
          status?: string
          token_hash: string
          token_prefix: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          label?: string
          last_received_at?: string | null
          org_id?: string
          provider?: string
          revoked_at?: string | null
          status?: string
          token_hash?: string
          token_prefix?: string
        }
        Relationships: [
          {
            foreignKeyName: "mileage_connections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mileage_entries: {
        Row: {
          category: string
          client_id: string | null
          created_at: string
          created_by: string
          deduction: number
          entry_date: string
          id: string
          miles: number
          org_id: string
          purpose: string | null
          rate: number
          source: string
          source_ref: string | null
        }
        Insert: {
          category?: string
          client_id?: string | null
          created_at?: string
          created_by: string
          deduction: number
          entry_date: string
          id?: string
          miles: number
          org_id: string
          purpose?: string | null
          rate: number
          source?: string
          source_ref?: string | null
        }
        Update: {
          category?: string
          client_id?: string | null
          created_at?: string
          created_by?: string
          deduction?: number
          entry_date?: string
          id?: string
          miles?: number
          org_id?: string
          purpose?: string | null
          rate?: number
          source?: string
          source_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mileage_entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mileage_entries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          document_request_id: string | null
          id: string
          is_read: boolean
          note_id: string | null
          org_id: string
          push_ticket: string | null
          read_at: string | null
          review_id: string | null
          sent_push: boolean
          title: string
          transaction_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          document_request_id?: string | null
          id?: string
          is_read?: boolean
          note_id?: string | null
          org_id: string
          push_ticket?: string | null
          read_at?: string | null
          review_id?: string | null
          sent_push?: boolean
          title: string
          transaction_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          document_request_id?: string | null
          id?: string
          is_read?: boolean
          note_id?: string | null
          org_id?: string
          push_ticket?: string | null
          read_at?: string | null
          review_id?: string | null
          sent_push?: boolean
          title?: string
          transaction_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_document_request_id_fkey"
            columns: ["document_request_id"]
            isOneToOne: false
            referencedRelation: "document_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "workspace_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "transaction_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "v_chat_inbox"
            referencedColumns: ["review_id"]
          },
          {
            foreignKeyName: "notifications_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_chat_inbox"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "notifications_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_doc_transaction_id"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "notifications_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_with_client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_with_evidence"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      org_billing_prefs: {
        Row: {
          allow_overages: boolean
          allow_overages_set_at: string | null
          allow_overages_set_by: string | null
          created_at: string
          notify_at_pct: number
          org_id: string
          updated_at: string
        }
        Insert: {
          allow_overages?: boolean
          allow_overages_set_at?: string | null
          allow_overages_set_by?: string | null
          created_at?: string
          notify_at_pct?: number
          org_id: string
          updated_at?: string
        }
        Update: {
          allow_overages?: boolean
          allow_overages_set_at?: string | null
          allow_overages_set_by?: string | null
          created_at?: string
          notify_at_pct?: number
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_billing_prefs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_memberships: {
        Row: {
          approval_limit: number | null
          created_at: string
          id: string
          is_active: boolean
          org_id: string
          role: Database["public"]["Enums"]["lp_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          approval_limit?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          org_id: string
          role: Database["public"]["Enums"]["lp_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          approval_limit?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          org_id?: string
          role?: Database["public"]["Enums"]["lp_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          brand_color: string | null
          business_code: string | null
          business_type: string | null
          created_at: string
          currency: string
          ein: string | null
          fiscal_year_start: number
          id: string
          invoice_footer: string | null
          invoice_terms: string | null
          is_accountant_firm: boolean
          is_active: boolean
          is_client: boolean
          is_firm: boolean
          is_personal: boolean
          logo_url: string | null
          name: string
          payment_instructions: string | null
          principal_business: string | null
          slug: string
          state_code: string | null
          tax_id: string | null
          tax_setaside_rate: number
          updated_at: string
        }
        Insert: {
          brand_color?: string | null
          business_code?: string | null
          business_type?: string | null
          created_at?: string
          currency?: string
          ein?: string | null
          fiscal_year_start?: number
          id?: string
          invoice_footer?: string | null
          invoice_terms?: string | null
          is_accountant_firm?: boolean
          is_active?: boolean
          is_client?: boolean
          is_firm?: boolean
          is_personal?: boolean
          logo_url?: string | null
          name: string
          payment_instructions?: string | null
          principal_business?: string | null
          slug: string
          state_code?: string | null
          tax_id?: string | null
          tax_setaside_rate?: number
          updated_at?: string
        }
        Update: {
          brand_color?: string | null
          business_code?: string | null
          business_type?: string | null
          created_at?: string
          currency?: string
          ein?: string | null
          fiscal_year_start?: number
          id?: string
          invoice_footer?: string | null
          invoice_terms?: string | null
          is_accountant_firm?: boolean
          is_active?: boolean
          is_client?: boolean
          is_firm?: boolean
          is_personal?: boolean
          logo_url?: string | null
          name?: string
          payment_instructions?: string | null
          principal_business?: string | null
          slug?: string
          state_code?: string | null
          tax_id?: string | null
          tax_setaside_rate?: number
          updated_at?: string
        }
        Relationships: []
      }
      period_controls: {
        Row: {
          client_id: string
          created_at: string
          org_id: string
          period_month: number
          period_year: number
          reason: string | null
          status: Database["public"]["Enums"]["period_status"]
          updated_at: string
          updated_by: string
        }
        Insert: {
          client_id: string
          created_at?: string
          org_id: string
          period_month: number
          period_year: number
          reason?: string | null
          status?: Database["public"]["Enums"]["period_status"]
          updated_at?: string
          updated_by: string
        }
        Update: {
          client_id?: string
          created_at?: string
          org_id?: string
          period_month?: number
          period_year?: number
          reason?: string | null
          status?: Database["public"]["Enums"]["period_status"]
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "period_controls_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "period_controls_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      period_lock_history: {
        Row: {
          changed_at: string
          changed_by: string
          client_id: string
          from_status: Database["public"]["Enums"]["period_status"] | null
          id: string
          is_super_admin_override: boolean
          org_id: string
          period_month: number
          period_year: number
          reason: string | null
          to_status: Database["public"]["Enums"]["period_status"]
        }
        Insert: {
          changed_at?: string
          changed_by: string
          client_id: string
          from_status?: Database["public"]["Enums"]["period_status"] | null
          id?: string
          is_super_admin_override?: boolean
          org_id: string
          period_month: number
          period_year: number
          reason?: string | null
          to_status: Database["public"]["Enums"]["period_status"]
        }
        Update: {
          changed_at?: string
          changed_by?: string
          client_id?: string
          from_status?: Database["public"]["Enums"]["period_status"] | null
          id?: string
          is_super_admin_override?: boolean
          org_id?: string
          period_month?: number
          period_year?: number
          reason?: string | null
          to_status?: Database["public"]["Enums"]["period_status"]
        }
        Relationships: [
          {
            foreignKeyName: "period_lock_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "period_lock_history_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_features: {
        Row: {
          feature_key: string
          is_enabled: boolean
          limit_value: number
          plan: Database["public"]["Enums"]["subscription_plan"]
        }
        Insert: {
          feature_key: string
          is_enabled?: boolean
          limit_value: number
          plan: Database["public"]["Enums"]["subscription_plan"]
        }
        Update: {
          feature_key?: string
          is_enabled?: boolean
          limit_value?: number
          plan?: Database["public"]["Enums"]["subscription_plan"]
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"]
          client_id: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          is_active: boolean
          locale: string
          lp_user_code: string | null
          onboarding_hints_seen: Json
          phone: string | null
          system_role: Database["public"]["Enums"]["system_role"]
          tier: Database["public"]["Enums"]["lp_user_tier"]
          tier_assigned_at: string | null
          tier_assigned_by: string | null
          updated_at: string
          user_type: Database["public"]["Enums"]["user_type"]
          workspace_kind: Database["public"]["Enums"]["workspace_kind"] | null
        }
        Insert: {
          account_type?: Database["public"]["Enums"]["account_type"]
          client_id?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          is_active?: boolean
          locale?: string
          lp_user_code?: string | null
          onboarding_hints_seen?: Json
          phone?: string | null
          system_role?: Database["public"]["Enums"]["system_role"]
          tier?: Database["public"]["Enums"]["lp_user_tier"]
          tier_assigned_at?: string | null
          tier_assigned_by?: string | null
          updated_at?: string
          user_type?: Database["public"]["Enums"]["user_type"]
          workspace_kind?: Database["public"]["Enums"]["workspace_kind"] | null
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"]
          client_id?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          locale?: string
          lp_user_code?: string | null
          onboarding_hints_seen?: Json
          phone?: string | null
          system_role?: Database["public"]["Enums"]["system_role"]
          tier?: Database["public"]["Enums"]["lp_user_tier"]
          tier_assigned_at?: string | null
          tier_assigned_by?: string | null
          updated_at?: string
          user_type?: Database["public"]["Enums"]["user_type"]
          workspace_kind?: Database["public"]["Enums"]["workspace_kind"] | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_tier_assigned_by_fkey"
            columns: ["tier_assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_tier_assigned_by_fkey"
            columns: ["tier_assigned_by"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_events: {
        Row: {
          created_at: string
          id: string
          key: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
        }
        Relationships: []
      }
      read_model_dirty: {
        Row: {
          dirtied_at: string
          model: string
          org_id: string
        }
        Insert: {
          dirtied_at?: string
          model: string
          org_id: string
        }
        Update: {
          dirtied_at?: string
          model?: string
          org_id?: string
        }
        Relationships: []
      }
      receipt_requests: {
        Row: {
          amount_hint: number | null
          cancelled_at: string | null
          cancelled_by: string | null
          client_id: string
          created_at: string
          date_hint: string | null
          fulfilled_at: string | null
          fulfilled_document_id: string | null
          id: string
          merchant_hint: string | null
          org_id: string
          request_note: string | null
          requested_by: string
          status: string
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          amount_hint?: number | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_id: string
          created_at?: string
          date_hint?: string | null
          fulfilled_at?: string | null
          fulfilled_document_id?: string | null
          id?: string
          merchant_hint?: string | null
          org_id: string
          request_note?: string | null
          requested_by: string
          status?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_hint?: number | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_id?: string
          created_at?: string
          date_hint?: string | null
          fulfilled_at?: string | null
          fulfilled_document_id?: string | null
          id?: string
          merchant_hint?: string | null
          org_id?: string
          request_note?: string | null
          requested_by?: string
          status?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipt_requests_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_requests_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_requests_fulfilled_document_id_fkey"
            columns: ["fulfilled_document_id"]
            isOneToOne: false
            referencedRelation: "transaction_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_requests_fulfilled_document_id_fkey"
            columns: ["fulfilled_document_id"]
            isOneToOne: false
            referencedRelation: "v_doc_transaction_id"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "receipt_requests_fulfilled_document_id_fkey"
            columns: ["fulfilled_document_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_with_evidence"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "receipt_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_requests_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_requests_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_chat_inbox"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "receipt_requests_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_doc_transaction_id"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "receipt_requests_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_with_client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_requests_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_with_evidence"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      reconciliation_items: {
        Row: {
          cleared_at: string | null
          created_at: string
          id: string
          is_cleared: boolean
          org_id: string
          session_id: string
          transaction_id: string
        }
        Insert: {
          cleared_at?: string | null
          created_at?: string
          id?: string
          is_cleared?: boolean
          org_id: string
          session_id: string
          transaction_id: string
        }
        Update: {
          cleared_at?: string | null
          created_at?: string
          id?: string
          is_cleared?: boolean
          org_id?: string
          session_id?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_items_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "reconciliation_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_items_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "v_reconciliation_summary"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "reconciliation_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_chat_inbox"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "reconciliation_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_doc_transaction_id"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "reconciliation_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_with_client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_with_evidence"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      reconciliation_sessions: {
        Row: {
          bank_connection_id: string | null
          cleared_balance: number | null
          client_id: string | null
          closed_at: string | null
          closed_by: string | null
          created_at: string
          difference: number | null
          id: string
          notes: string | null
          opened_at: string
          opened_by: string
          org_id: string
          period_end: string
          period_start: string
          statement_closing_balance: number
          statement_opening_balance: number
          status: string
          updated_at: string
        }
        Insert: {
          bank_connection_id?: string | null
          cleared_balance?: number | null
          client_id?: string | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          difference?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by: string
          org_id: string
          period_end: string
          period_start: string
          statement_closing_balance?: number
          statement_opening_balance?: number
          status?: string
          updated_at?: string
        }
        Update: {
          bank_connection_id?: string | null
          cleared_balance?: number | null
          client_id?: string | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          difference?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string
          org_id?: string
          period_end?: string
          period_start?: string
          statement_closing_balance?: number
          statement_opening_balance?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_sessions_bank_connection_id_fkey"
            columns: ["bank_connection_id"]
            isOneToOne: false
            referencedRelation: "bank_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_sessions_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_sessions_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_sessions_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_sessions_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_sessions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_checklist_items: {
        Row: {
          description: string | null
          id: string
          org_id: string
          recurring_id: string
          sort_order: number
          title: string
        }
        Insert: {
          description?: string | null
          id?: string
          org_id: string
          recurring_id: string
          sort_order?: number
          title: string
        }
        Update: {
          description?: string | null
          id?: string
          org_id?: string
          recurring_id?: string
          sort_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_checklist_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_checklist_items_recurring_id_fkey"
            columns: ["recurring_id"]
            isOneToOne: false
            referencedRelation: "recurring_checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_checklists: {
        Row: {
          client_id: string | null
          created_at: string
          created_by: string
          end_date: string | null
          frequency: Database["public"]["Enums"]["recurring_frequency"]
          id: string
          last_generated_at: string | null
          last_run_id: string | null
          max_occurrences: number | null
          next_run_date: string
          occurrences_generated: number
          org_id: string
          status: Database["public"]["Enums"]["recurring_status"]
          title: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_by?: string
          end_date?: string | null
          frequency?: Database["public"]["Enums"]["recurring_frequency"]
          id?: string
          last_generated_at?: string | null
          last_run_id?: string | null
          max_occurrences?: number | null
          next_run_date: string
          occurrences_generated?: number
          org_id: string
          status?: Database["public"]["Enums"]["recurring_status"]
          title: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_by?: string
          end_date?: string | null
          frequency?: Database["public"]["Enums"]["recurring_frequency"]
          id?: string
          last_generated_at?: string | null
          last_run_id?: string | null
          max_occurrences?: number | null
          next_run_date?: string
          occurrences_generated?: number
          org_id?: string
          status?: Database["public"]["Enums"]["recurring_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_checklists_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_checklists_last_run_fkey"
            columns: ["last_run_id"]
            isOneToOne: false
            referencedRelation: "checklist_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_checklists_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_invoice_items: {
        Row: {
          created_at: string
          description: string
          discount_pct: number
          id: string
          item_type: Database["public"]["Enums"]["invoice_item_type"]
          org_id: string
          quantity: number
          recurring_id: string
          sort_order: number
          tax_rate: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          description?: string
          discount_pct?: number
          id?: string
          item_type?: Database["public"]["Enums"]["invoice_item_type"]
          org_id: string
          quantity?: number
          recurring_id: string
          sort_order?: number
          tax_rate?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string
          discount_pct?: number
          id?: string
          item_type?: Database["public"]["Enums"]["invoice_item_type"]
          org_id?: string
          quantity?: number
          recurring_id?: string
          sort_order?: number
          tax_rate?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "recurring_invoice_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_invoice_items_recurring_id_fkey"
            columns: ["recurring_id"]
            isOneToOne: false
            referencedRelation: "recurring_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_invoices: {
        Row: {
          auto_send: boolean
          client_id: string
          created_at: string
          created_by: string | null
          currency: string
          end_date: string | null
          footer: string | null
          frequency: Database["public"]["Enums"]["recurring_frequency"]
          id: string
          last_generated_at: string | null
          last_invoice_id: string | null
          max_occurrences: number | null
          net_days: number
          next_run_date: string
          notes: string | null
          occurrences_generated: number
          org_id: string
          start_date: string
          status: Database["public"]["Enums"]["recurring_status"]
          terms: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          auto_send?: boolean
          client_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          end_date?: string | null
          footer?: string | null
          frequency: Database["public"]["Enums"]["recurring_frequency"]
          id?: string
          last_generated_at?: string | null
          last_invoice_id?: string | null
          max_occurrences?: number | null
          net_days?: number
          next_run_date: string
          notes?: string | null
          occurrences_generated?: number
          org_id: string
          start_date: string
          status?: Database["public"]["Enums"]["recurring_status"]
          terms?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          auto_send?: boolean
          client_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          end_date?: string | null
          footer?: string | null
          frequency?: Database["public"]["Enums"]["recurring_frequency"]
          id?: string
          last_generated_at?: string | null
          last_invoice_id?: string | null
          max_occurrences?: number | null
          net_days?: number
          next_run_date?: string
          notes?: string | null
          occurrences_generated?: number
          org_id?: string
          start_date?: string
          status?: Database["public"]["Enums"]["recurring_status"]
          terms?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_invoices_last_invoice_id_fkey"
            columns: ["last_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      rule_definitions: {
        Row: {
          config: Json
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          org_id: string | null
          priority: number
          rule_id: string
          severity: Database["public"]["Enums"]["rule_severity"]
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          org_id?: string | null
          priority?: number
          rule_id: string
          severity: Database["public"]["Enums"]["rule_severity"]
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string | null
          priority?: number
          rule_id?: string
          severity?: Database["public"]["Enums"]["rule_severity"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rule_definitions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rule_definitions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rule_definitions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      rule_evaluations: {
        Row: {
          client_id: string | null
          created_at: string
          engine_version: string
          evaluated_at: string
          evaluated_rules: Json
          explanation: string | null
          final_status: Database["public"]["Enums"]["semaphore_status"]
          id: string
          rule_score: number | null
          rule_triggered: string | null
          transaction_id: string
          transaction_version: number
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          engine_version: string
          evaluated_at?: string
          evaluated_rules?: Json
          explanation?: string | null
          final_status: Database["public"]["Enums"]["semaphore_status"]
          id?: string
          rule_score?: number | null
          rule_triggered?: string | null
          transaction_id: string
          transaction_version: number
        }
        Update: {
          client_id?: string | null
          created_at?: string
          engine_version?: string
          evaluated_at?: string
          evaluated_rules?: Json
          explanation?: string | null
          final_status?: Database["public"]["Enums"]["semaphore_status"]
          id?: string
          rule_score?: number | null
          rule_triggered?: string | null
          transaction_id?: string
          transaction_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "rule_evaluations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rule_evaluations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rule_evaluations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_chat_inbox"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "rule_evaluations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_doc_transaction_id"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "rule_evaluations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_with_client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rule_evaluations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_with_evidence"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      sales_tax_rates: {
        Row: {
          category: string
          country: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          jurisdiction_name: string
          postal_code: string | null
          published_at: string | null
          rate: number
          source: string
          source_url: string | null
          state_code: string
        }
        Insert: {
          category?: string
          country?: string
          created_at?: string
          created_by?: string | null
          effective_from: string
          effective_to?: string | null
          id?: string
          jurisdiction_name: string
          postal_code?: string | null
          published_at?: string | null
          rate: number
          source?: string
          source_url?: string | null
          state_code: string
        }
        Update: {
          category?: string
          country?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          jurisdiction_name?: string
          postal_code?: string | null
          published_at?: string | null
          rate?: number
          source?: string
          source_url?: string | null
          state_code?: string
        }
        Relationships: []
      }
      sales_tax_settings: {
        Row: {
          avalara_company_code: string | null
          collects_sales_tax: boolean
          created_at: string
          default_category: string
          org_id: string
          provider: Database["public"]["Enums"]["sales_tax_provider"]
          sourcing: Database["public"]["Enums"]["sales_tax_sourcing"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          avalara_company_code?: string | null
          collects_sales_tax?: boolean
          created_at?: string
          default_category?: string
          org_id: string
          provider?: Database["public"]["Enums"]["sales_tax_provider"]
          sourcing?: Database["public"]["Enums"]["sales_tax_sourcing"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          avalara_company_code?: string | null
          collects_sales_tax?: boolean
          created_at?: string
          default_category?: string
          org_id?: string
          provider?: Database["public"]["Enums"]["sales_tax_provider"]
          sourcing?: Database["public"]["Enums"]["sales_tax_sourcing"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_tax_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          canceled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string
          id: string
          org_id: string | null
          plan: Database["public"]["Enums"]["subscription_plan"]
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          trial_ends_at: string | null
          trial_started_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string
          id?: string
          org_id?: string | null
          plan?: Database["public"]["Enums"]["subscription_plan"]
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          trial_started_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string
          id?: string
          org_id?: string | null
          plan?: Database["public"]["Enums"]["subscription_plan"]
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          trial_started_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_setaside_entries: {
        Row: {
          amount: number
          client_id: string | null
          created_at: string
          created_by: string
          entry_date: string
          id: string
          note: string | null
          org_id: string
          user_id: string | null
        }
        Insert: {
          amount: number
          client_id?: string | null
          created_at?: string
          created_by?: string
          entry_date?: string
          id?: string
          note?: string | null
          org_id: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          client_id?: string | null
          created_at?: string
          created_by?: string
          entry_date?: string
          id?: string
          note?: string | null
          org_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tax_setaside_entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_setaside_entries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          client_id: string | null
          created_at: string
          created_by: string
          description: string | null
          duration_minutes: number
          ended_at: string | null
          entry_date: string
          hourly_rate: number
          id: string
          invoice_id: string | null
          is_billable: boolean
          org_id: string
          started_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          duration_minutes?: number
          ended_at?: string | null
          entry_date?: string
          hourly_rate?: number
          id?: string
          invoice_id?: string | null
          is_billable?: boolean
          org_id: string
          started_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          duration_minutes?: number
          ended_at?: string | null
          entry_date?: string
          hourly_rate?: number
          id?: string
          invoice_id?: string | null
          is_billable?: boolean
          org_id?: string
          started_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_conversations: {
        Row: {
          client_id: string | null
          closed_at: string | null
          created_at: string
          id: string
          opened_at: string
          opened_by: string
          org_id: string
          resolution_summary: string | null
          resolved_at: string | null
          resolved_by: string | null
          review_id: string | null
          semaphore_at_open: Database["public"]["Enums"]["semaphore_status"]
          status: Database["public"]["Enums"]["conversation_status"]
          transaction_id: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          closed_at?: string | null
          created_at?: string
          id?: string
          opened_at?: string
          opened_by: string
          org_id: string
          resolution_summary?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          review_id?: string | null
          semaphore_at_open: Database["public"]["Enums"]["semaphore_status"]
          status?: Database["public"]["Enums"]["conversation_status"]
          transaction_id: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          closed_at?: string | null
          created_at?: string
          id?: string
          opened_at?: string
          opened_by?: string
          org_id?: string
          resolution_summary?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          review_id?: string | null
          semaphore_at_open?: Database["public"]["Enums"]["semaphore_status"]
          status?: Database["public"]["Enums"]["conversation_status"]
          transaction_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_conversations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_conversations_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_conversations_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_conversations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_conversations_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_conversations_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_conversations_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "transaction_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_conversations_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "v_chat_inbox"
            referencedColumns: ["review_id"]
          },
          {
            foreignKeyName: "transaction_conversations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_conversations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_chat_inbox"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "transaction_conversations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_doc_transaction_id"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "transaction_conversations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_with_client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_conversations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_with_evidence"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      transaction_documents: {
        Row: {
          created_at: string
          file_size_bytes: number | null
          filename: string
          id: string
          mime_type: string | null
          ocr_amount: number | null
          ocr_confidence: number | null
          ocr_data: Json | null
          ocr_date: string | null
          ocr_merchant: string | null
          org_id: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          score_after: number | null
          score_before: number | null
          status: Database["public"]["Enums"]["document_status"]
          storage_path: string
          transaction_id: string
          updated_at: string
          uploaded_at: string
          uploaded_by: string
          uploaded_by_client: boolean | null
        }
        Insert: {
          created_at?: string
          file_size_bytes?: number | null
          filename: string
          id?: string
          mime_type?: string | null
          ocr_amount?: number | null
          ocr_confidence?: number | null
          ocr_data?: Json | null
          ocr_date?: string | null
          ocr_merchant?: string | null
          org_id: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          score_after?: number | null
          score_before?: number | null
          status?: Database["public"]["Enums"]["document_status"]
          storage_path: string
          transaction_id: string
          updated_at?: string
          uploaded_at?: string
          uploaded_by: string
          uploaded_by_client?: boolean | null
        }
        Update: {
          created_at?: string
          file_size_bytes?: number | null
          filename?: string
          id?: string
          mime_type?: string | null
          ocr_amount?: number | null
          ocr_confidence?: number | null
          ocr_data?: Json | null
          ocr_date?: string | null
          ocr_merchant?: string | null
          org_id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          score_after?: number | null
          score_before?: number | null
          status?: Database["public"]["Enums"]["document_status"]
          storage_path?: string
          transaction_id?: string
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string
          uploaded_by_client?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "transaction_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_documents_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_documents_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_documents_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_documents_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_chat_inbox"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "transaction_documents_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_doc_transaction_id"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "transaction_documents_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_with_client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_documents_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_with_evidence"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "transaction_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_messages: {
        Row: {
          ai_generated: boolean
          body: string
          channels: Database["public"]["Enums"]["message_channel"][]
          client_id: string | null
          client_visible: boolean
          conversation_id: string | null
          created_at: string
          document_id: string | null
          email_status: string | null
          event_type: string | null
          final_hash: string | null
          id: string
          message_kind: string | null
          org_id: string
          previous_hash: string | null
          raw_hash: string | null
          read_at: string | null
          read_by_bookkeeper: boolean
          read_by_client: boolean
          review_id: string | null
          sender_id: string | null
          sender_role: Database["public"]["Enums"]["message_sender_role"]
          sms_status: string | null
          transaction_id: string
        }
        Insert: {
          ai_generated?: boolean
          body: string
          channels?: Database["public"]["Enums"]["message_channel"][]
          client_id?: string | null
          client_visible?: boolean
          conversation_id?: string | null
          created_at?: string
          document_id?: string | null
          email_status?: string | null
          event_type?: string | null
          final_hash?: string | null
          id?: string
          message_kind?: string | null
          org_id: string
          previous_hash?: string | null
          raw_hash?: string | null
          read_at?: string | null
          read_by_bookkeeper?: boolean
          read_by_client?: boolean
          review_id?: string | null
          sender_id?: string | null
          sender_role: Database["public"]["Enums"]["message_sender_role"]
          sms_status?: string | null
          transaction_id: string
        }
        Update: {
          ai_generated?: boolean
          body?: string
          channels?: Database["public"]["Enums"]["message_channel"][]
          client_id?: string | null
          client_visible?: boolean
          conversation_id?: string | null
          created_at?: string
          document_id?: string | null
          email_status?: string | null
          event_type?: string | null
          final_hash?: string | null
          id?: string
          message_kind?: string | null
          org_id?: string
          previous_hash?: string | null
          raw_hash?: string | null
          read_at?: string | null
          read_by_bookkeeper?: boolean
          read_by_client?: boolean
          review_id?: string | null
          sender_id?: string | null
          sender_role?: Database["public"]["Enums"]["message_sender_role"]
          sms_status?: string | null
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "transaction_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_messages_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_messages_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "transaction_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_messages_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "v_chat_inbox"
            referencedColumns: ["review_id"]
          },
          {
            foreignKeyName: "transaction_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_messages_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_messages_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_chat_inbox"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "transaction_messages_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_doc_transaction_id"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "transaction_messages_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_with_client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_messages_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_with_evidence"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      transaction_reviews: {
        Row: {
          answer: Database["public"]["Enums"]["review_answer"] | null
          answer_note: string | null
          answered_at: string | null
          answered_by: string | null
          assigned_to: string | null
          bookkeeper_note: string | null
          created_at: string
          expires_at: string | null
          id: string
          org_id: string
          question: string
          question_type: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["review_status"]
          transaction_group_id: string
          transaction_id: string
          updated_at: string
        }
        Insert: {
          answer?: Database["public"]["Enums"]["review_answer"] | null
          answer_note?: string | null
          answered_at?: string | null
          answered_by?: string | null
          assigned_to?: string | null
          bookkeeper_note?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          org_id: string
          question: string
          question_type?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["review_status"]
          transaction_group_id: string
          transaction_id: string
          updated_at?: string
        }
        Update: {
          answer?: Database["public"]["Enums"]["review_answer"] | null
          answer_note?: string | null
          answered_at?: string | null
          answered_by?: string | null
          assigned_to?: string | null
          bookkeeper_note?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          org_id?: string
          question?: string
          question_type?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["review_status"]
          transaction_group_id?: string
          transaction_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_reviews_answered_by_fkey"
            columns: ["answered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_reviews_answered_by_fkey"
            columns: ["answered_by"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_reviews_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_reviews_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_reviews_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_reviews_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_reviews_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_reviews_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_reviews_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_chat_inbox"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "transaction_reviews_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_doc_transaction_id"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "transaction_reviews_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_with_client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_reviews_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_with_evidence"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      transactions: {
        Row: {
          ai_reason: string | null
          amount: number
          approved_at: string | null
          approved_by: string | null
          bank_import_id: string | null
          client_id: string | null
          confidence_score: number | null
          created_at: string
          created_by: string
          currency: string
          description: string | null
          final_hash: string | null
          id: string
          is_current: boolean
          locked_at: string | null
          merchant_name: string | null
          metadata: Json
          org_id: string
          parent_version_id: string | null
          payment_method: Database["public"]["Enums"]["payment_method_type"]
          previous_hash: string | null
          raw_hash: string
          reconciled_at: string | null
          reconciled_by: string | null
          reconciliation_note: string | null
          reference: string | null
          requires_review: boolean
          review_status: Database["public"]["Enums"]["review_status"]
          semaphore: Database["public"]["Enums"]["semaphore_status"]
          source: Database["public"]["Enums"]["tx_source"]
          status_reason: string | null
          transaction_date: string
          transaction_group_id: string
          updated_at: string
          vendor_id: string | null
          version: number
        }
        Insert: {
          ai_reason?: string | null
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          bank_import_id?: string | null
          client_id?: string | null
          confidence_score?: number | null
          created_at?: string
          created_by: string
          currency?: string
          description?: string | null
          final_hash?: string | null
          id?: string
          is_current?: boolean
          locked_at?: string | null
          merchant_name?: string | null
          metadata?: Json
          org_id: string
          parent_version_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method_type"]
          previous_hash?: string | null
          raw_hash: string
          reconciled_at?: string | null
          reconciled_by?: string | null
          reconciliation_note?: string | null
          reference?: string | null
          requires_review?: boolean
          review_status?: Database["public"]["Enums"]["review_status"]
          semaphore?: Database["public"]["Enums"]["semaphore_status"]
          source: Database["public"]["Enums"]["tx_source"]
          status_reason?: string | null
          transaction_date: string
          transaction_group_id: string
          updated_at?: string
          vendor_id?: string | null
          version?: number
        }
        Update: {
          ai_reason?: string | null
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          bank_import_id?: string | null
          client_id?: string | null
          confidence_score?: number | null
          created_at?: string
          created_by?: string
          currency?: string
          description?: string | null
          final_hash?: string | null
          id?: string
          is_current?: boolean
          locked_at?: string | null
          merchant_name?: string | null
          metadata?: Json
          org_id?: string
          parent_version_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method_type"]
          previous_hash?: string | null
          raw_hash?: string
          reconciled_at?: string | null
          reconciled_by?: string | null
          reconciliation_note?: string | null
          reference?: string | null
          requires_review?: boolean
          review_status?: Database["public"]["Enums"]["review_status"]
          semaphore?: Database["public"]["Enums"]["semaphore_status"]
          source?: Database["public"]["Enums"]["tx_source"]
          status_reason?: string | null
          transaction_date?: string
          transaction_group_id?: string
          updated_at?: string
          vendor_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "transactions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_bank_import_id_fkey"
            columns: ["bank_import_id"]
            isOneToOne: false
            referencedRelation: "bank_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_parent_version_id_fkey"
            columns: ["parent_version_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_parent_version_id_fkey"
            columns: ["parent_version_id"]
            isOneToOne: false
            referencedRelation: "v_chat_inbox"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "transactions_parent_version_id_fkey"
            columns: ["parent_version_id"]
            isOneToOne: false
            referencedRelation: "v_doc_transaction_id"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "transactions_parent_version_id_fkey"
            columns: ["parent_version_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_with_client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_parent_version_id_fkey"
            columns: ["parent_version_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_with_evidence"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "transactions_reconciled_by_fkey"
            columns: ["reconciled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_reconciled_by_fkey"
            columns: ["reconciled_by"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_excess_events: {
        Row: {
          amount_over: number
          billed: boolean
          billed_at: string | null
          created_at: string
          id: string
          metric: Database["public"]["Enums"]["usage_metric"]
          org_id: string
          period_start: string
          stripe_charge_id: string | null
          total_cents: number
          unit_cost_cents: number
        }
        Insert: {
          amount_over: number
          billed?: boolean
          billed_at?: string | null
          created_at?: string
          id?: string
          metric: Database["public"]["Enums"]["usage_metric"]
          org_id: string
          period_start: string
          stripe_charge_id?: string | null
          total_cents: number
          unit_cost_cents: number
        }
        Update: {
          amount_over?: number
          billed?: boolean
          billed_at?: string | null
          created_at?: string
          id?: string
          metric?: Database["public"]["Enums"]["usage_metric"]
          org_id?: string
          period_start?: string
          stripe_charge_id?: string | null
          total_cents?: number
          unit_cost_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "usage_excess_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_meters: {
        Row: {
          ai_queries_count: number
          created_at: string
          id: string
          invoices_count: number
          mileage_trips_count: number
          org_id: string
          period_start: string
          plaid_connections_count: number
          receipts_count: number
          storage_mb: number
          transactions_count: number
          updated_at: string
        }
        Insert: {
          ai_queries_count?: number
          created_at?: string
          id?: string
          invoices_count?: number
          mileage_trips_count?: number
          org_id: string
          period_start: string
          plaid_connections_count?: number
          receipts_count?: number
          storage_mb?: number
          transactions_count?: number
          updated_at?: string
        }
        Update: {
          ai_queries_count?: number
          created_at?: string
          id?: string
          invoices_count?: number
          mileage_trips_count?: number
          org_id?: string
          period_start?: string
          plaid_connections_count?: number
          receipts_count?: number
          storage_mb?: number
          transactions_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_meters_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_tracking: {
        Row: {
          count: number
          feature_key: string
          last_used_at: string | null
          org_id: string | null
          period_month: number
          period_year: number
          user_id: string
        }
        Insert: {
          count?: number
          feature_key: string
          last_used_at?: string | null
          org_id?: string | null
          period_month: number
          period_year: number
          user_id: string
        }
        Update: {
          count?: number
          feature_key?: string
          last_used_at?: string | null
          org_id?: string | null
          period_month?: number
          period_year?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_tracking_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_tracking_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_tracking_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      user_patterns: {
        Row: {
          account_id: string | null
          amount_max: number | null
          amount_min: number | null
          category: string
          confidence_boost: number
          confirmed_at: string
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          keyword: string | null
          match_count: number
          merchant_name: string | null
          org_id: string
          review_answer: Database["public"]["Enums"]["review_answer"] | null
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          account_id?: string | null
          amount_max?: number | null
          amount_min?: number | null
          category: string
          confidence_boost?: number
          confirmed_at?: string
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          keyword?: string | null
          match_count?: number
          merchant_name?: string | null
          org_id: string
          review_answer?: Database["public"]["Enums"]["review_answer"] | null
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          account_id?: string | null
          amount_max?: number | null
          amount_min?: number | null
          category?: string
          confidence_boost?: number
          confirmed_at?: string
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          keyword?: string | null
          match_count?: number
          merchant_name?: string | null
          org_id?: string
          review_answer?: Database["public"]["Enums"]["review_answer"] | null
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_patterns_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_patterns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_patterns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_patterns_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_patterns_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          granted_at: string
          granted_by: string | null
          notes: string | null
          role: Database["public"]["Enums"]["system_role"]
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          notes?: string | null
          role?: Database["public"]["Enums"]["system_role"]
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          notes?: string | null
          role?: Database["public"]["Enums"]["system_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          approval_limit: number | null
          created_at: string
          email: string
          id: string
          is_active: boolean
          lp_user_id: string
          org_id: string
          role: string
        }
        Insert: {
          approval_limit?: number | null
          created_at?: string
          email: string
          id?: string
          is_active?: boolean
          lp_user_id: string
          org_id: string
          role?: string
        }
        Update: {
          approval_limit?: number | null
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          lp_user_id?: string
          org_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_bills: {
        Row: {
          amount: number
          bill_number: string | null
          client_id: string | null
          created_at: string
          created_by: string
          due_date: string
          id: string
          notes: string | null
          org_id: string
          paid_amount: number | null
          paid_at: string | null
          status: Database["public"]["Enums"]["vendor_bill_status"]
          updated_at: string
          vendor_id: string
        }
        Insert: {
          amount: number
          bill_number?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string
          due_date: string
          id?: string
          notes?: string | null
          org_id: string
          paid_amount?: number | null
          paid_at?: string | null
          status?: Database["public"]["Enums"]["vendor_bill_status"]
          updated_at?: string
          vendor_id: string
        }
        Update: {
          amount?: number
          bill_number?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string
          due_date?: string
          id?: string
          notes?: string | null
          org_id?: string
          paid_amount?: number | null
          paid_at?: string | null
          status?: Database["public"]["Enums"]["vendor_bill_status"]
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_bills_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_bills_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_bills_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          client_id: string | null
          country: string | null
          created_at: string
          created_by: string
          dba_name: string | null
          default_1099_box: string | null
          default_expense_account_id: string | null
          email: string | null
          id: string
          is_1099_eligible: boolean
          is_active: boolean
          is_attorney: boolean
          legal_name: string
          notes: string | null
          org_id: string
          phone: string | null
          postal_code: string | null
          state: string | null
          tax_classification:
            | Database["public"]["Enums"]["vendor_tax_classification"]
            | null
          tin: string | null
          tin_enc: string | null
          tin_last4: string | null
          tin_type: Database["public"]["Enums"]["vendor_tin_type"] | null
          updated_at: string
          w9_backup_withholding: boolean
          w9_cert_ip: unknown
          w9_cert_name: string | null
          w9_document_id: string | null
          w9_request_token: string | null
          w9_requested_at: string | null
          w9_status: Database["public"]["Enums"]["vendor_w9_status"]
          w9_submitted_at: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          client_id?: string | null
          country?: string | null
          created_at?: string
          created_by?: string
          dba_name?: string | null
          default_1099_box?: string | null
          default_expense_account_id?: string | null
          email?: string | null
          id?: string
          is_1099_eligible?: boolean
          is_active?: boolean
          is_attorney?: boolean
          legal_name: string
          notes?: string | null
          org_id: string
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          tax_classification?:
            | Database["public"]["Enums"]["vendor_tax_classification"]
            | null
          tin?: string | null
          tin_enc?: string | null
          tin_last4?: string | null
          tin_type?: Database["public"]["Enums"]["vendor_tin_type"] | null
          updated_at?: string
          w9_backup_withholding?: boolean
          w9_cert_ip?: unknown
          w9_cert_name?: string | null
          w9_document_id?: string | null
          w9_request_token?: string | null
          w9_requested_at?: string | null
          w9_status?: Database["public"]["Enums"]["vendor_w9_status"]
          w9_submitted_at?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          client_id?: string | null
          country?: string | null
          created_at?: string
          created_by?: string
          dba_name?: string | null
          default_1099_box?: string | null
          default_expense_account_id?: string | null
          email?: string | null
          id?: string
          is_1099_eligible?: boolean
          is_active?: boolean
          is_attorney?: boolean
          legal_name?: string
          notes?: string | null
          org_id?: string
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          tax_classification?:
            | Database["public"]["Enums"]["vendor_tax_classification"]
            | null
          tin?: string | null
          tin_enc?: string | null
          tin_last4?: string | null
          tin_type?: Database["public"]["Enums"]["vendor_tin_type"] | null
          updated_at?: string
          w9_backup_withholding?: boolean
          w9_cert_ip?: unknown
          w9_cert_name?: string | null
          w9_document_id?: string | null
          w9_request_token?: string | null
          w9_requested_at?: string | null
          w9_status?: Database["public"]["Enums"]["vendor_w9_status"]
          w9_submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendors_default_expense_account_id_fkey"
            columns: ["default_expense_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendors_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendors_w9_document_id_fkey"
            columns: ["w9_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_conversations: {
        Row: {
          archived_at: string | null
          archived_by_role:
            | Database["public"]["Enums"]["message_sender_role"]
            | null
          bookkeeper_unread_count: number
          client_id: string
          client_unread_count: number
          created_at: string
          created_by_role: Database["public"]["Enums"]["message_sender_role"]
          created_by_user_id: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          is_archived: boolean
          last_message_at: string | null
          last_message_kind: string | null
          last_message_preview: string | null
          last_message_sender_role:
            | Database["public"]["Enums"]["message_sender_role"]
            | null
          org_id: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          archived_by_role?:
            | Database["public"]["Enums"]["message_sender_role"]
            | null
          bookkeeper_unread_count?: number
          client_id: string
          client_unread_count?: number
          created_at?: string
          created_by_role: Database["public"]["Enums"]["message_sender_role"]
          created_by_user_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_archived?: boolean
          last_message_at?: string | null
          last_message_kind?: string | null
          last_message_preview?: string | null
          last_message_sender_role?:
            | Database["public"]["Enums"]["message_sender_role"]
            | null
          org_id: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          archived_by_role?:
            | Database["public"]["Enums"]["message_sender_role"]
            | null
          bookkeeper_unread_count?: number
          client_id?: string
          client_unread_count?: number
          created_at?: string
          created_by_role?: Database["public"]["Enums"]["message_sender_role"]
          created_by_user_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_archived?: boolean
          last_message_at?: string | null
          last_message_kind?: string | null
          last_message_preview?: string | null
          last_message_sender_role?:
            | Database["public"]["Enums"]["message_sender_role"]
            | null
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_conversations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_conversations_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_conversations_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_conversations_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_conversations_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_conversations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_member_conversations: {
        Row: {
          created_at: string
          id: string
          last_message_at: string | null
          last_message_preview: string | null
          last_message_sender_id: string | null
          org_id: string
          updated_at: string
          user_a_archived: boolean
          user_a_archived_at: string | null
          user_a_id: string
          user_a_unread_count: number
          user_b_archived: boolean
          user_b_archived_at: string | null
          user_b_id: string
          user_b_unread_count: number
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          last_message_sender_id?: string | null
          org_id: string
          updated_at?: string
          user_a_archived?: boolean
          user_a_archived_at?: string | null
          user_a_id: string
          user_a_unread_count?: number
          user_b_archived?: boolean
          user_b_archived_at?: string | null
          user_b_id: string
          user_b_unread_count?: number
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          last_message_sender_id?: string | null
          org_id?: string
          updated_at?: string
          user_a_archived?: boolean
          user_a_archived_at?: string | null
          user_a_id?: string
          user_a_unread_count?: number
          user_b_archived?: boolean
          user_b_archived_at?: string | null
          user_b_id?: string
          user_b_unread_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "workspace_member_conversations_last_message_sender_id_fkey"
            columns: ["last_message_sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_member_conversations_last_message_sender_id_fkey"
            columns: ["last_message_sender_id"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_member_conversations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_member_conversations_user_a_id_fkey"
            columns: ["user_a_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_member_conversations_user_a_id_fkey"
            columns: ["user_a_id"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_member_conversations_user_b_id_fkey"
            columns: ["user_b_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_member_conversations_user_b_id_fkey"
            columns: ["user_b_id"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_member_messages: {
        Row: {
          body: string | null
          conversation_id: string
          created_at: string
          document_id: string | null
          hash: string | null
          id: string
          org_id: string
          prev_hash: string | null
          sender_id: string
          user_a_read_at: string | null
          user_b_read_at: string | null
        }
        Insert: {
          body?: string | null
          conversation_id: string
          created_at?: string
          document_id?: string | null
          hash?: string | null
          id?: string
          org_id: string
          prev_hash?: string | null
          sender_id: string
          user_a_read_at?: string | null
          user_b_read_at?: string | null
        }
        Update: {
          body?: string | null
          conversation_id?: string
          created_at?: string
          document_id?: string | null
          hash?: string | null
          id?: string
          org_id?: string
          prev_hash?: string | null
          sender_id?: string
          user_a_read_at?: string | null
          user_b_read_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workspace_member_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "workspace_member_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_member_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_member_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_member_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_messages: {
        Row: {
          ai_generated: boolean
          body: string | null
          channels: Database["public"]["Enums"]["message_channel"][]
          client_id: string
          client_visible: boolean
          context_ref: Json | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          document_id: string | null
          email_status: string | null
          event_type: string | null
          final_hash: string | null
          flagged_sensitive: boolean
          id: string
          message_kind: string
          message_tag: string
          org_id: string
          previous_hash: string | null
          raw_hash: string | null
          read_at: string | null
          read_by_bookkeeper: boolean
          read_by_client: boolean
          sender_id: string | null
          sender_role: Database["public"]["Enums"]["message_sender_role"]
          sms_status: string | null
        }
        Insert: {
          ai_generated?: boolean
          body?: string | null
          channels?: Database["public"]["Enums"]["message_channel"][]
          client_id: string
          client_visible?: boolean
          context_ref?: Json | null
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          document_id?: string | null
          email_status?: string | null
          event_type?: string | null
          final_hash?: string | null
          flagged_sensitive?: boolean
          id?: string
          message_kind?: string
          message_tag?: string
          org_id: string
          previous_hash?: string | null
          raw_hash?: string | null
          read_at?: string | null
          read_by_bookkeeper?: boolean
          read_by_client?: boolean
          sender_id?: string | null
          sender_role: Database["public"]["Enums"]["message_sender_role"]
          sms_status?: string | null
        }
        Update: {
          ai_generated?: boolean
          body?: string | null
          channels?: Database["public"]["Enums"]["message_channel"][]
          client_id?: string
          client_visible?: boolean
          context_ref?: Json | null
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          document_id?: string | null
          email_status?: string | null
          event_type?: string | null
          final_hash?: string | null
          flagged_sensitive?: boolean
          id?: string
          message_kind?: string
          message_tag?: string
          org_id?: string
          previous_hash?: string | null
          raw_hash?: string | null
          read_at?: string | null
          read_by_bookkeeper?: boolean
          read_by_client?: boolean
          sender_id?: string | null
          sender_role?: Database["public"]["Enums"]["message_sender_role"]
          sms_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workspace_messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "workspace_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_messages_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_messages_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_messages_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_notes: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          body: string
          client_id: string
          completed_at: string | null
          context_ref: Json | null
          conversation_id: string | null
          created_at: string
          created_by: string
          due_at: string | null
          id: string
          org_id: string
          reminder_sent_at: string | null
          requires_approval: boolean
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          body: string
          client_id: string
          completed_at?: string | null
          context_ref?: Json | null
          conversation_id?: string | null
          created_at?: string
          created_by: string
          due_at?: string | null
          id?: string
          org_id: string
          reminder_sent_at?: string | null
          requires_approval?: boolean
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          body?: string
          client_id?: string
          completed_at?: string | null
          context_ref?: Json | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string
          due_at?: string | null
          id?: string
          org_id?: string
          reminder_sent_at?: string | null
          requires_approval?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_notes_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_notes_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_notes_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "workspace_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_notes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_chat_inbox: {
        Row: {
          ai_reason: string | null
          amount: number | null
          answer: Database["public"]["Enums"]["review_answer"] | null
          confidence_score: number | null
          currency: string | null
          description: string | null
          last_message: string | null
          last_message_at: string | null
          last_sender: Database["public"]["Enums"]["message_sender_role"] | null
          org_id: string | null
          question: string | null
          reference: string | null
          review_id: string | null
          review_status: Database["public"]["Enums"]["review_status"] | null
          review_status_detail:
            | Database["public"]["Enums"]["review_status"]
            | null
          semaphore: Database["public"]["Enums"]["semaphore_status"] | null
          transaction_date: string | null
          transaction_group_id: string | null
          transaction_id: string | null
          unread_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      v_client_dashboard_stats: {
        Row: {
          client_id: string | null
          in_review_green: number | null
          latest_transaction_date: string | null
          pending_amber: number | null
          pending_red: number | null
          recent_messages_count: number | null
          total_transactions: number | null
          verified_blue: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      v_doc_transaction_id: {
        Row: {
          document_id: string | null
          merchant_name: string | null
          ocr_data: Json | null
          transaction_id: string | null
        }
        Relationships: []
      }
      v_governance_dashboard: {
        Row: {
          approved: number | null
          day: string | null
          escalated: number | null
          org_id: string | null
          overridden: number | null
          override_rate_pct: number | null
          rejected: number | null
          total_decisions: number | null
        }
        Relationships: [
          {
            foreignKeyName: "decisions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      v_journal_balance_by_transaction: {
        Row: {
          total_credit: number | null
          total_debit: number | null
          transaction_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_chat_inbox"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "journal_entries_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_doc_transaction_id"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "journal_entries_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_with_client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_with_evidence"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      v_reconciliation_summary: {
        Row: {
          cleared_items: number | null
          cleared_total: number | null
          client_id: string | null
          difference: number | null
          opened_at: string | null
          org_id: string | null
          period_end: string | null
          period_start: string | null
          session_id: string | null
          statement_closing_balance: number | null
          statement_opening_balance: number | null
          status: string | null
          total_items: number | null
          uncleared_items: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_sessions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      v_transaction_with_client: {
        Row: {
          ai_reason: string | null
          allow_email: boolean | null
          allow_sms: boolean | null
          allow_transaction_resolution_contact: boolean | null
          amount: number | null
          approved_at: string | null
          approved_by: string | null
          bank_import_id: string | null
          client_company: string | null
          client_email: string | null
          client_id: string | null
          client_name: string | null
          client_phone: string | null
          confidence_score: number | null
          contact_email: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          description: string | null
          final_hash: string | null
          id: string | null
          is_current: boolean | null
          locked_at: string | null
          merchant_name: string | null
          metadata: Json | null
          org_id: string | null
          parent_version_id: string | null
          previous_hash: string | null
          raw_hash: string | null
          reconciled_at: string | null
          reconciled_by: string | null
          reconciliation_note: string | null
          reference: string | null
          requires_review: boolean | null
          resolved_client_id: string | null
          review_status: Database["public"]["Enums"]["review_status"] | null
          semaphore: Database["public"]["Enums"]["semaphore_status"] | null
          sms_number: string | null
          source: Database["public"]["Enums"]["tx_source"] | null
          status_reason: string | null
          transaction_date: string | null
          transaction_group_id: string | null
          updated_at: string | null
          version: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_bank_import_id_fkey"
            columns: ["bank_import_id"]
            isOneToOne: false
            referencedRelation: "bank_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_parent_version_id_fkey"
            columns: ["parent_version_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_parent_version_id_fkey"
            columns: ["parent_version_id"]
            isOneToOne: false
            referencedRelation: "v_chat_inbox"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "transactions_parent_version_id_fkey"
            columns: ["parent_version_id"]
            isOneToOne: false
            referencedRelation: "v_doc_transaction_id"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "transactions_parent_version_id_fkey"
            columns: ["parent_version_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_with_client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_parent_version_id_fkey"
            columns: ["parent_version_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_with_evidence"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "transactions_reconciled_by_fkey"
            columns: ["reconciled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_reconciled_by_fkey"
            columns: ["reconciled_by"]
            isOneToOne: false
            referencedRelation: "v_user_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      v_transaction_with_evidence: {
        Row: {
          document_id: string | null
          merchant_name: string | null
          ocr_amount: number | null
          ocr_confidence: number | null
          ocr_data: Json | null
          ocr_date: string | null
          ocr_merchant: string | null
          transaction_amount: number | null
          transaction_date: string | null
          transaction_id: string | null
          uploaded_by_client: boolean | null
        }
        Relationships: []
      }
      v_user_directory: {
        Row: {
          assigned_by_code: string | null
          assigned_by_email: string | null
          created_at: string | null
          display_name: string | null
          email: string | null
          id: string | null
          is_active: boolean | null
          lp_user_code: string | null
          org_count: number | null
          tier: Database["public"]["Enums"]["lp_user_tier"] | null
          tier_assigned_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _lp_column_exists: {
        Args: { p_column: string; p_table: string }
        Returns: boolean
      }
      _lp_table_exists: { Args: { p_table: string }; Returns: boolean }
      accept_client_invitation: {
        Args: { p_token: string; p_user_id: string }
        Returns: Json
      }
      accept_client_portal_invitation: {
        Args: { p_token: string }
        Returns: string
      }
      accept_document_and_close: {
        Args: {
          p_document_id: string
          p_reviewer_id: string
          p_score_boost?: number
        }
        Returns: Json
      }
      accept_estimate_public: {
        Args: {
          p_ip?: unknown
          p_signature_text: string
          p_signer_email?: string
          p_signer_name: string
          p_token: string
          p_user_agent?: string
        }
        Returns: Json
      }
      accept_invitation: {
        Args: { p_token: string; p_user_id: string }
        Returns: Json
      }
      add_estimate_item: {
        Args: {
          p_description: string
          p_discount_pct?: number
          p_estimate_id: string
          p_item_type?: Database["public"]["Enums"]["invoice_item_type"]
          p_quantity?: number
          p_sort_order?: number
          p_tax_rate?: number
          p_unit_price?: number
        }
        Returns: string
      }
      approve_workspace_note: { Args: { p_note_id: string }; Returns: Json }
      archive_member_conversation: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      archive_workspace_conversation: {
        Args: { p_conversation_id: string }
        Returns: Json
      }
      assign_legacy_account_to_client: {
        Args: { p_account_id: string; p_client_id: string }
        Returns: undefined
      }
      assign_tester: {
        Args: { p_requesting_admin_id: string; p_target_user_id: string }
        Returns: Json
      }
      assign_transaction_to_client: {
        Args: { p_client_id: string; p_propagate?: boolean; p_tx_id: string }
        Returns: number
      }
      cancel_receipt_request: {
        Args: { p_reason?: string; p_request_id: string }
        Returns: Json
      }
      check_feature_access: {
        Args: { p_feature_key: string; p_user_id: string }
        Returns: Json
      }
      check_quota: {
        Args: {
          p_amount?: number
          p_metric: Database["public"]["Enums"]["usage_metric"]
          p_org_id: string
        }
        Returns: Json
      }
      clear_client_workflow_state: {
        Args: { p_client_id: string }
        Returns: Json
      }
      clone_chart_of_accounts: {
        Args: { p_client_id: string; p_template_id: string }
        Returns: number
      }
      close_reconciliation_session: {
        Args: { p_session_id: string; p_user_id: string }
        Returns: Json
      }
      complete_workspace_note: { Args: { p_note_id: string }; Returns: Json }
      compute_account_balance: {
        Args: {
          p_account_id: string
          p_as_of_month?: number
          p_as_of_year: number
          p_org_id: string
        }
        Returns: number
      }
      compute_invoice_totals: {
        Args: { p_invoice_id: string }
        Returns: undefined
      }
      compute_workflow_state: { Args: { p_client_id: string }; Returns: string }
      convert_estimate_to_invoice: {
        Args: { p_estimate_id: string }
        Returns: Json
      }
      counter_offer_public: {
        Args: {
          p_ip?: unknown
          p_note?: string
          p_proposed_items: Json
          p_signer_email?: string
          p_signer_name?: string
          p_token: string
          p_user_agent?: string
        }
        Returns: Json
      }
      create_client_invitation: {
        Args: {
          p_client_id: string
          p_email: string
          p_invited_by: string
          p_org_id: string
        }
        Returns: Json
      }
      create_client_portal_invitation: {
        Args: {
          p_client_id: string
          p_email: string
          p_role?: Database["public"]["Enums"]["client_portal_role"]
        }
        Returns: Json
      }
      create_custom_account_template: {
        Args: { p_input: Json }
        Returns: string
      }
      create_document_request: {
        Args: {
          p_client_id: string
          p_conversation_id?: string
          p_description?: string
          p_due_at?: string
          p_is_sensitive?: boolean
          p_org_id: string
          p_title: string
        }
        Returns: Json
      }
      create_estimate: {
        Args: {
          p_client_id: string
          p_currency?: string
          p_footer?: string
          p_notes?: string
          p_org_id: string
          p_scope_description?: string
          p_template_category?: Database["public"]["Enums"]["estimate_template_category"]
          p_template_id?: string
          p_terms?: string
          p_title?: string
          p_valid_until?: string
        }
        Returns: Json
      }
      create_initial_subscription: {
        Args: { p_account_type: string; p_user_id: string }
        Returns: undefined
      }
      create_personal_org_for_bookkeeper: {
        Args: { p_display_name?: string; p_user_id: string }
        Returns: string
      }
      create_receipt_request: {
        Args: {
          p_amount_hint?: number
          p_client_id: string
          p_date_hint?: string
          p_merchant_hint?: string
          p_org_id: string
          p_request_note?: string
          p_transaction_id?: string
        }
        Returns: Json
      }
      create_workspace_note: {
        Args: {
          p_body: string
          p_client_id: string
          p_context_ref?: Json
          p_conversation_id?: string
          p_due_at?: string
          p_org_id: string
          p_requires_approval?: boolean
        }
        Returns: Json
      }
      cron_generate_all_recurring_checklists: {
        Args: never
        Returns: undefined
      }
      cron_generate_all_recurring_invoices: { Args: never; Returns: number }
      current_client_id: { Args: never; Returns: string }
      current_system_role: {
        Args: never
        Returns: Database["public"]["Enums"]["system_role"]
      }
      current_user_id: { Args: never; Returns: string }
      decrypt_tin: { Args: { p_enc: string }; Returns: string }
      delete_estimate_item: { Args: { p_item_id: string }; Returns: undefined }
      delete_workspace_conversation: {
        Args: { p_conversation_id: string }
        Returns: Json
      }
      delete_workspace_message: {
        Args: { p_message_id: string }
        Returns: Json
      }
      demote_admin: {
        Args: { p_requesting_admin_id: string; p_target_user_id: string }
        Returns: Json
      }
      encrypt_tin: { Args: { p_tin: string }; Returns: string }
      enforce_and_consume_feature: {
        Args: { p_feature_key: string; p_increment?: number; p_user_id: string }
        Returns: Json
      }
      evaluate_transaction_evidence: {
        Args: { p_transaction_id: string }
        Returns: {
          is_match: boolean
          match_score: number
        }[]
      }
      export_audit_csv: {
        Args: {
          p_client_id?: string
          p_date_from?: string
          p_date_to?: string
          p_max_amount?: number
          p_min_amount?: number
          p_org_id: string
          p_search?: string
          p_semaphore?: string[]
        }
        Returns: string
      }
      fulfill_document_request: {
        Args: { p_document_id: string; p_request_id: string }
        Returns: Json
      }
      fulfill_receipt_request: {
        Args: { p_document_id: string; p_request_id: string }
        Returns: Json
      }
      generate_due_recurring_checklists: {
        Args: { p_org_id: string }
        Returns: Json
      }
      generate_due_recurring_invoices: {
        Args: { p_org_id: string }
        Returns: Json
      }
      generate_lp_user_code: {
        Args: { p_tier?: Database["public"]["Enums"]["lp_user_tier"] }
        Returns: string
      }
      generate_recurring_checklist: {
        Args: { p_recurring_id: string }
        Returns: string
      }
      generate_recurring_invoice: {
        Args: { p_recurring_id: string }
        Returns: string
      }
      get_1099_recipient: {
        Args: { p_tax_year: number; p_vendor_id: string }
        Returns: Json
      }
      get_accountant_dashboard: { Args: { p_org_id: string }; Returns: Json }
      get_admin_command_center: { Args: never; Returns: Json }
      get_audit_summary: {
        Args: {
          p_client_id?: string
          p_date_from?: string
          p_date_to?: string
          p_org_id: string
        }
        Returns: Json
      }
      get_audit_transaction_activity: {
        Args: { p_tx_id: string }
        Returns: Json
      }
      get_audit_transactions: {
        Args: {
          p_client_id?: string
          p_cursor?: string
          p_date_from?: string
          p_date_to?: string
          p_limit?: number
          p_max_amount?: number
          p_min_amount?: number
          p_org_id: string
          p_search?: string
          p_semaphore?: string[]
        }
        Returns: Json
      }
      get_auditor_workspaces: { Args: never; Returns: Json }
      get_balance_sheet: {
        Args: {
          p_as_of_month?: number
          p_as_of_year: number
          p_client_id?: string
          p_org_id: string
        }
        Returns: Json
      }
      get_bookkeeper_dashboard: { Args: { p_org_id: string }; Returns: Json }
      get_client_portal_invitation_preview: {
        Args: { p_token: string }
        Returns: Json
      }
      get_client_portal_memberships: { Args: never; Returns: Json }
      get_clients_admin: {
        Args: { p_org_id?: string }
        Returns: {
          address_line1: string
          address_line2: string
          city: string
          company_name: string
          country: string
          created_at: string
          created_by: string
          default_currency: string
          display_name: string
          id: string
          is_active: boolean
          notes: string
          org_id: string
          payment_terms: number
          phone: string
          postal_code: string
          primary_user_id: string
          state: string
          tax_id: string
          updated_at: string
        }[]
      }
      get_document_signed_url: {
        Args: { p_document_id: string }
        Returns: Json
      }
      get_estimate_by_public_token: {
        Args: {
          p_token: string
          p_track_view?: boolean
          p_user_agent?: string
          p_viewer_ip?: unknown
        }
        Returns: Json
      }
      get_exchange_rate: { Args: { p_currency: string }; Returns: number }
      get_firm_ar_aging: { Args: { p_org_id: string }; Returns: Json }
      get_firm_cashflow_trend: {
        Args: { p_months?: number; p_org_id: string }
        Returns: Json
      }
      get_firm_client_summary: {
        Args: { p_as_of_month?: number; p_as_of_year: number; p_org_id: string }
        Returns: Json
      }
      get_firm_insights: {
        Args: {
          p_months?: number
          p_org_id: string
          p_pl_month?: number
          p_pl_year?: number
        }
        Returns: Json
      }
      get_firm_pl: {
        Args: { p_month?: number; p_org_id: string; p_year?: number }
        Returns: Json
      }
      get_fx_gains_losses: {
        Args: { p_org_id: string }
        Returns: {
          client_name: string
          currency: string
          fx_rate_at_creation: number
          fx_rate_at_payment: number
          gain_loss_usd: number
          invoice_amount: number
          invoice_basis_usd: number
          invoice_id: string
          invoice_number: string
          payment_amount: number
          payment_date: string
          payment_usd: number
        }[]
      }
      get_governance_overview_admin: {
        Args: { p_days?: number }
        Returns: Json
      }
      get_invoice_by_public_token: {
        Args: {
          p_token: string
          p_track_view?: boolean
          p_user_agent?: string
          p_viewer_ip?: unknown
        }
        Returns: Json
      }
      get_member_inbox: {
        Args: { p_include_archived?: boolean; p_org_id: string }
        Returns: Json
      }
      get_member_messages: {
        Args: { p_before?: string; p_conversation_id: string; p_limit?: number }
        Returns: Json
      }
      get_mileage_summary: {
        Args: { p_client_id?: string; p_org_id: string; p_year: number }
        Returns: {
          entry_count: number
          total_deduction: number
          total_miles: number
        }[]
      }
      get_org_activity_feed: {
        Args: { p_limit?: number; p_org_id: string }
        Returns: Json
      }
      get_org_plan_limits: {
        Args: { p_org_id: string }
        Returns: {
          ai_queries_limit: number
          allow_overages_eligible: boolean
          invoices_limit: number
          mileage_trips_limit: number
          plaid_connections_limit: number
          plan: string
          receipts_limit: number
          storage_mb_limit: number
          transactions_limit: number
        }[]
      }
      get_organizations_admin: {
        Args: never
        Returns: {
          brand_color: string | null
          business_code: string | null
          business_type: string | null
          created_at: string
          currency: string
          ein: string | null
          fiscal_year_start: number
          id: string
          invoice_footer: string | null
          invoice_terms: string | null
          is_accountant_firm: boolean
          is_active: boolean
          is_client: boolean
          is_firm: boolean
          is_personal: boolean
          logo_url: string | null
          name: string
          payment_instructions: string | null
          principal_business: string | null
          slug: string
          state_code: string | null
          tax_id: string | null
          tax_setaside_rate: number
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "organizations"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_period_status: {
        Args: { p_client_id: string; p_date: string; p_org_id: string }
        Returns: Database["public"]["Enums"]["period_status"]
      }
      get_profit_and_loss: {
        Args: {
          p_client_id?: string
          p_month?: number
          p_org_id: string
          p_year: number
        }
        Returns: Json
      }
      get_pyme_dashboard: { Args: { p_client_id: string }; Returns: Json }
      get_recent_admin_events: { Args: { p_limit?: number }; Returns: Json }
      get_schedule_c_data: {
        Args: { p_org_id: string; p_year?: number }
        Returns: Json
      }
      get_solo_dashboard: {
        Args: { p_org_id: string; p_quarter?: number; p_year?: number }
        Returns: Json
      }
      get_staff_invitation_by_token: {
        Args: { p_token: string }
        Returns: Json
      }
      get_tax_setaside_summary: {
        Args: { p_client_id?: string; p_org_id: string; p_year: number }
        Returns: {
          entry_count: number
          setaside_rate: number
          total_set_aside: number
        }[]
      }
      get_transaction_messages: {
        Args: { p_before?: string; p_conversation_id: string; p_limit?: number }
        Returns: Json
      }
      get_transactions_admin: {
        Args: { p_client_id?: string; p_limit?: number; p_org_id?: string }
        Returns: {
          ai_reason: string | null
          amount: number
          approved_at: string | null
          approved_by: string | null
          bank_import_id: string | null
          client_id: string | null
          confidence_score: number | null
          created_at: string
          created_by: string
          currency: string
          description: string | null
          final_hash: string | null
          id: string
          is_current: boolean
          locked_at: string | null
          merchant_name: string | null
          metadata: Json
          org_id: string
          parent_version_id: string | null
          payment_method: Database["public"]["Enums"]["payment_method_type"]
          previous_hash: string | null
          raw_hash: string
          reconciled_at: string | null
          reconciled_by: string | null
          reconciliation_note: string | null
          reference: string | null
          requires_review: boolean
          review_status: Database["public"]["Enums"]["review_status"]
          semaphore: Database["public"]["Enums"]["semaphore_status"]
          source: Database["public"]["Enums"]["tx_source"]
          status_reason: string | null
          transaction_date: string
          transaction_group_id: string
          updated_at: string
          vendor_id: string | null
          version: number
        }[]
        SetofOptions: {
          from: "*"
          to: "transactions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_usage_status: { Args: { p_org_id: string }; Returns: Json }
      get_user_directory_admin: {
        Args: never
        Returns: {
          account_type: string
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          last_sign_in_at: string
          lp_user_code: string
          org_count: number
          system_role: string
          tier: string
          user_type: string
        }[]
      }
      get_user_org_context_admin: {
        Args: { p_user_id: string }
        Returns: {
          membership_role: Database["public"]["Enums"]["lp_role"]
          org_id: string
          org_name: string
          org_slug: string
        }[]
      }
      get_user_orgs_by_category: { Args: { p_user_id?: string }; Returns: Json }
      get_users_in_scope: {
        Args: { p_org_id?: string }
        Returns: {
          account_type: string
          created_at: string
          display_name: string
          email: string
          id: string
          is_active: boolean
          last_sign_in_at: string
          lp_user_code: string
          org_count: number
          system_role: string
          tier: string
          workspace_role: string
        }[]
      }
      get_w9_request: { Args: { p_token: string }; Returns: Json }
      get_workspace_inbox: {
        Args: { p_archived?: boolean; p_limit?: number; p_org_id: string }
        Returns: Json
      }
      get_workspace_messages: {
        Args: { p_before?: string; p_conversation_id: string; p_limit?: number }
        Returns: Json
      }
      grant_role: {
        Args: {
          p_notes?: string
          p_role: Database["public"]["Enums"]["system_role"]
          p_target_user_id: string
        }
        Returns: Json
      }
      has_audit_access: { Args: { p_org_id: string }; Returns: boolean }
      has_org_role: {
        Args: {
          p_org_id: string
          p_roles: Database["public"]["Enums"]["lp_role"][]
        }
        Returns: boolean
      }
      import_clients_batch: {
        Args: { p_org_id: string; p_rows: Json }
        Returns: Json
      }
      import_coa_batch: {
        Args: { p_client_id?: string; p_org_id: string; p_rows: Json }
        Returns: Json
      }
      import_opening_balances: {
        Args: {
          p_client_id?: string
          p_memo?: string
          p_org_id: string
          p_rows: Json
          p_transition_date: string
        }
        Returns: Json
      }
      increment_feature_usage: {
        Args: { p_feature_key: string; p_increment?: number; p_user_id: string }
        Returns: undefined
      }
      increment_usage: {
        Args: {
          p_amount?: number
          p_metric: Database["public"]["Enums"]["usage_metric"]
          p_org_id: string
        }
        Returns: number
      }
      is_client_portal_user: { Args: { p_client_id: string }; Returns: boolean }
      is_client_user: { Args: never; Returns: boolean }
      is_org_member: { Args: { p_org_id: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      list_estimates: {
        Args: {
          p_client_id?: string
          p_limit?: number
          p_offset?: number
          p_org_id: string
          p_status?: Database["public"]["Enums"]["estimate_status"]
        }
        Returns: Json
      }
      log_impersonation: {
        Args: {
          p_action: string
          p_context_client_id?: string
          p_context_org_id?: string
          p_context_user_id?: string
          p_metadata?: Json
          p_target_count?: number
          p_target_table?: string
        }
        Returns: string
      }
      lp_assert_can_import: { Args: { p_org_id: string }; Returns: undefined }
      lp_assert_invite_acceptor: {
        Args: { p_invited_email: string; p_user_id: string }
        Returns: undefined
      }
      lp_ensure_personal_books: {
        Args: { p_org_id: string; p_user_id: string }
        Returns: string
      }
      lp_is_billing_exempt: { Args: { p_user_id: string }; Returns: boolean }
      lp_recompute_estimate_totals: {
        Args: { p_estimate_id: string }
        Returns: undefined
      }
      lp_seed_template_id: { Args: { p_category: string }; Returns: string }
      lp_slugify: { Args: { p_text: string }; Returns: string }
      mark_member_messages_read: {
        Args: { p_conversation_id: string }
        Returns: number
      }
      mark_onboarding_hints_seen: {
        Args: { p_surface: string }
        Returns: undefined
      }
      mark_overdue_invoices: { Args: never; Returns: number }
      mark_read_model_dirty: {
        Args: { p_models: string[]; p_org_id: string }
        Returns: undefined
      }
      mark_transaction_messages_read: {
        Args: { p_conversation_id: string }
        Returns: Json
      }
      mark_workspace_conversation_unread: {
        Args: { p_conversation_id: string }
        Returns: Json
      }
      mark_workspace_messages_read: {
        Args: { p_conversation_id: string }
        Returns: Json
      }
      next_estimate_number: { Args: { p_org_id: string }; Returns: string }
      next_invoice_number: { Args: { p_org_id: string }; Returns: string }
      open_or_get_member_conversation: {
        Args: { p_org_id: string; p_other_user_id: string }
        Returns: string
      }
      open_or_get_transaction_conversation: {
        Args: { p_review_id?: string; p_transaction_id: string }
        Returns: string
      }
      open_review_with_message:
        | {
            Args: {
              p_assigned_to?: string
              p_expires_hours?: number
              p_org_id: string
              p_question: string
              p_question_type?: string
              p_transaction_id: string
            }
            Returns: string
          }
        | {
            Args: {
              p_assigned_to?: string
              p_expires_hours?: number
              p_opened_by?: string
              p_org_id: string
              p_question: string
              p_question_type?: string
              p_transaction_id: string
            }
            Returns: string
          }
      payment_method_from_account_type: {
        Args: { p_account_type: string }
        Returns: Database["public"]["Enums"]["payment_method_type"]
      }
      payroll_approve_run: { Args: { p_run_id: string }; Returns: Json }
      payroll_complete_run: {
        Args: {
          p_line_items: Json
          p_provider_run_id: string
          p_run_id: string
        }
        Returns: Json
      }
      payroll_create_employee: {
        Args: {
          p_client_id: string
          p_compensation_amount: number
          p_compensation_basis: string
          p_department: string
          p_employee_type: "w2" | "contractor_1099"
          p_first_name: string
          p_hire_date: string
          p_job_title: string
          p_last_name: string
          p_org_id: string
          p_pa_psd_code?: string
          p_residence_county?: string
          p_residence_state: "VA" | "MD" | "DC" | "PA" | "DE" | "WV"
          p_work_state: "VA" | "MD" | "DC" | "PA" | "DE" | "WV"
        }
        Returns: Json
      }
      payroll_create_employer_profile: {
        Args: { p_org_id: string; p_pay_frequency?: string }
        Returns: Json
      }
      payroll_create_run: {
        Args: {
          p_client_id: string
          p_org_id: string
          p_pay_date: string
          p_period_end: string
          p_period_start: string
        }
        Returns: Json
      }
      payroll_fail_run: {
        Args: { p_reason: string; p_run_id: string }
        Returns: Json
      }
      payroll_find_run_id_by_provider_id: {
        Args: { p_provider_run_id: string }
        Returns: string
      }
      payroll_get_employee_for_sync: {
        Args: { p_employee_id: string }
        Returns: Json
      }
      payroll_get_employer_for_sync: {
        Args: { p_org_id: string }
        Returns: Json
      }
      payroll_get_paystub: { Args: { p_line_item_id: string }; Returns: Json }
      payroll_get_run_for_submission: {
        Args: { p_run_id: string }
        Returns: Json
      }
      payroll_get_run_status: { Args: { p_run_id: string }; Returns: Json }
      payroll_get_tax_documents: {
        Args: { p_employee_id: string }
        Returns: Json
      }
      payroll_list_employees: {
        Args: { p_org_id: string }
        Returns: unknown[]
        SetofOptions: {
          from: "*"
          to: "employees"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      payroll_list_runs: {
        Args: { p_org_id: string }
        Returns: unknown[]
        SetofOptions: {
          from: "*"
          to: "runs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      payroll_mark_run_processing: { Args: { p_run_id: string }; Returns: Json }
      payroll_mark_run_submitted: {
        Args: { p_provider_run_id: string; p_run_id: string }
        Returns: Json
      }
      payroll_mark_webhook_seen: {
        Args: { p_event: string; p_event_id: string; p_topic: string }
        Returns: boolean
      }
      payroll_set_account_mapping: {
        Args: {
          p_cash_account_id: string
          p_org_id: string
          p_payroll_expense_account_id: string
          p_payroll_tax_expense_account_id: string
        }
        Returns: Json
      }
      payroll_set_provider_company_id: {
        Args: { p_org_id: string; p_provider_company_id: string }
        Returns: Json
      }
      payroll_set_provider_employee_id: {
        Args: { p_employee_id: string; p_provider_employee_id: string }
        Returns: Json
      }
      payroll_set_provider_workplace_id: {
        Args: { p_org_id: string; p_provider_workplace_id: string }
        Returns: Json
      }
      payroll_terminate_employee: {
        Args: { p_employee_id: string; p_termination_date: string }
        Returns: Json
      }
      payroll_update_employee: {
        Args: {
          p_compensation_amount?: number
          p_compensation_basis?: string
          p_department?: string
          p_employee_id: string
          p_job_title?: string
          p_pa_psd_code?: string
          p_reciprocity_exemption_type?:
            | "none"
            | "md_mw507"
            | "pa_rev419"
            | "wv_it104"
          p_residence_county?: string
          p_residence_state?: "VA" | "MD" | "DC" | "PA" | "DE" | "WV"
          p_work_state?: "VA" | "MD" | "DC" | "PA" | "DE" | "WV"
        }
        Returns: Json
      }
      pct_used: { Args: { p_limit: number; p_used: number }; Returns: number }
      preview_clients_import: {
        Args: { p_org_id: string; p_rows: Json }
        Returns: Json
      }
      preview_coa_import: {
        Args: { p_client_id?: string; p_org_id: string; p_rows: Json }
        Returns: Json
      }
      promote_to_admin: {
        Args: { p_requesting_admin_id: string; p_target_user_id: string }
        Returns: Json
      }
      quote_csv: { Args: { v: string }; Returns: string }
      record_consent: {
        Args: {
          p_channel?: string
          p_document: string
          p_user_id: string
          p_version: string
        }
        Returns: Json
      }
      record_human_decision: {
        Args: {
          p_actor_id: string
          p_actor_role: string
          p_after_state?: Json
          p_before_state?: Json
          p_decision_type: string
          p_org_id: string
          p_reason?: string
          p_suggestion_id?: string
          p_transaction_id?: string
        }
        Returns: string
      }
      register_document: {
        Args: {
          p_client_id?: string
          p_document_kind?: string
          p_filename: string
          p_height?: number
          p_mime_type: string
          p_org_id: string
          p_size_bytes: number
          p_storage_bucket?: string
          p_storage_path: string
          p_transaction_id?: string
          p_width?: number
        }
        Returns: Json
      }
      reject_estimate_public: {
        Args: {
          p_ip?: unknown
          p_reason: string
          p_signer_email?: string
          p_signer_name?: string
          p_token: string
          p_user_agent?: string
        }
        Returns: Json
      }
      repair_orphan_user:
        | { Args: never; Returns: Json }
        | { Args: { p_target_user_id?: string }; Returns: Json }
      resolve_client_for_transaction: {
        Args: { p_tx_id: string }
        Returns: string
      }
      resolve_sales_tax_rate: {
        Args: {
          p_category?: string
          p_country?: string
          p_date?: string
          p_org_id: string
          p_postal?: string
          p_state: string
        }
        Returns: Json
      }
      restore_member_conversation: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      restore_workspace_conversation: {
        Args: { p_conversation_id: string }
        Returns: Json
      }
      revert_feature_usage: {
        Args: { p_decrement?: number; p_feature_key: string; p_user_id: string }
        Returns: Json
      }
      review_document_request: {
        Args: { p_approve: boolean; p_request_id: string }
        Returns: Json
      }
      rpc_1099_worksheet: {
        Args: { p_client_id?: string; p_org_id: string; p_tax_year: number }
        Returns: Json
      }
      rpc_solo_recurring: { Args: { p_org_id: string }; Returns: Json }
      safe_uuid: { Args: { input: string }; Returns: string }
      score_to_semaphore: {
        Args: { p_score: number }
        Returns: Database["public"]["Enums"]["semaphore_status"]
      }
      search_admin_entities: {
        Args: { p_limit?: number; p_query: string }
        Returns: Json
      }
      seed_chart_of_accounts: {
        Args: { p_org_id: string; p_user_id: string }
        Returns: number
      }
      send_estimate: {
        Args: { p_estimate_id: string; p_method?: string; p_to_email?: string }
        Returns: Json
      }
      send_member_message: {
        Args: {
          p_body?: string
          p_conversation_id: string
          p_document_id?: string
        }
        Returns: string
      }
      send_transaction_message: {
        Args: {
          p_body?: string
          p_channels?: string[]
          p_client_visible?: boolean
          p_conversation_id: string
          p_document_id?: string
          p_message_kind?: string
        }
        Returns: Json
      }
      send_workspace_message: {
        Args: {
          p_body?: string
          p_client_id: string
          p_client_visible?: boolean
          p_context_ref?: Json
          p_document_id?: string
          p_message_kind?: string
          p_message_tag?: string
          p_org_id: string
        }
        Returns: Json
      }
      set_allow_overages: {
        Args: { p_enabled: boolean; p_org_id: string }
        Returns: Json
      }
      set_client_workflow_state: {
        Args: {
          p_client_id: string
          p_expires_in_days?: number
          p_notes?: string
          p_state: string
        }
        Returns: Json
      }
      set_locale: { Args: { p_locale: string }; Returns: undefined }
      set_workspace_kind: {
        Args: { p_kind: string; p_user_id: string }
        Returns: Json
      }
      sha256_jsonb: { Args: { p_input: Json }; Returns: string }
      sha256_text: { Args: { p_input: string }; Returns: string }
      soft_delete_document: { Args: { p_document_id: string }; Returns: Json }
      submit_w9: {
        Args: {
          p_address_line1?: string
          p_backup_withholding?: boolean
          p_cert_name?: string
          p_city?: string
          p_ip?: unknown
          p_legal_name: string
          p_postal_code?: string
          p_state?: string
          p_tax_classification: string
          p_tin: string
          p_tin_type: string
          p_token: string
        }
        Returns: Json
      }
      switch_active_client_portal_membership: {
        Args: { p_client_id: string }
        Returns: undefined
      }
      tx_payment_reportability: {
        Args: { pm: Database["public"]["Enums"]["payment_method_type"] }
        Returns: string
      }
      update_admin_email: {
        Args: { p_admin_id: string; p_new_email: string }
        Returns: Json
      }
      update_estimate: {
        Args: {
          p_currency?: string
          p_estimate_id: string
          p_footer?: string
          p_notes?: string
          p_scope_description?: string
          p_terms?: string
          p_title?: string
          p_valid_until?: string
        }
        Returns: undefined
      }
      update_estimate_item: {
        Args: {
          p_description?: string
          p_discount_pct?: number
          p_item_id: string
          p_quantity?: number
          p_sort_order?: number
          p_tax_rate?: number
          p_unit_price?: number
        }
        Returns: undefined
      }
      update_org_tax_info: {
        Args: {
          p_business_code?: string
          p_business_type?: string
          p_ein?: string
          p_org_id: string
          p_principal_business?: string
          p_state_code?: string
        }
        Returns: Json
      }
    }
    Enums: {
      account_type:
        | "self_employed"
        | "bookkeeper"
        | "pyme_client"
        | "accountant"
      audit_event_type:
        | "created"
        | "normalized"
        | "rule_evaluated"
        | "semaphore_changed"
        | "edited"
        | "approved"
        | "rejected"
        | "locked"
        | "journal_posted"
        | "integrity_verified"
        | "cgc_override"
        | "reconciliation_cleared"
      bank_import_status: "pending" | "processing" | "done" | "failed"
      bank_provider: "plaid" | "manual" | "direct_api"
      client_portal_invitation_status:
        | "pending"
        | "accepted"
        | "expired"
        | "revoked"
      client_portal_role: "client_owner" | "client_contact" | "client_viewer"
      client_workflow_state: "todo" | "in_review" | "reconciling" | "closed"
      conversation_status:
        | "open"
        | "waiting_client"
        | "waiting_internal"
        | "resolved"
        | "closed"
      document_status: "uploaded" | "accepted" | "rejected" | "re_requested"
      entry_type_enum: "debit" | "credit"
      estimate_response_type: "accept" | "reject" | "counter_offer" | "view"
      estimate_signer_role: "client" | "vendor"
      estimate_status:
        | "draft"
        | "sent"
        | "viewed"
        | "accepted"
        | "rejected"
        | "counter_offered"
        | "expired"
        | "converted"
        | "cancelled"
      estimate_template_category:
        | "electrician"
        | "plumber"
        | "painter"
        | "carpenter"
        | "mechanic"
        | "gardener"
        | "cleaning"
        | "construction"
        | "moving"
        | "hvac"
        | "photography"
        | "catering"
        | "it_development"
        | "design"
        | "marketing"
        | "consulting"
        | "beauty_spa"
        | "accounting_services"
        | "legal_services"
        | "bookkeeping_monthly"
        | "general_b2b"
        | "custom"
        | "taxi_driver"
        | "delivery_driver"
        | "truck_driver"
        | "digital_creator"
        | "collision_repair"
        | "auto_detailing"
      invitation_type: "staff" | "client"
      invoice_item_type: "service" | "product" | "expense" | "discount" | "tax"
      invoice_status:
        | "draft"
        | "sent"
        | "viewed"
        | "partial"
        | "paid"
        | "overdue"
        | "void"
      journal_entry_kind:
        | "transaction_linked"
        | "manual_adjustment"
        | "closing_entry"
        | "depreciation"
        | "opening_balance"
        | "payroll"
      lp_role:
        | "owner"
        | "admin"
        | "accountant"
        | "auditor"
        | "approver"
        | "readonly"
      lp_user_tier: "admin" | "tester" | "user"
      manual_journal_batch_status: "draft" | "posted" | "reversed"
      message_channel: "chat" | "sms" | "email"
      message_sender_role: "bookkeeper" | "client" | "system"
      payment_method_type:
        | "ach"
        | "check"
        | "cash"
        | "wire"
        | "other_bank"
        | "card"
        | "third_party_network"
        | "unknown"
      period_status: "OPEN" | "ADJUSTMENT" | "CLOSED"
      recurring_frequency:
        | "weekly"
        | "biweekly"
        | "monthly"
        | "quarterly"
        | "yearly"
      recurring_status: "active" | "paused" | "ended"
      review_answer: "personal" | "business" | "split" | "unknown"
      review_status:
        | "pending"
        | "answered"
        | "confirmed"
        | "rejected"
        | "escalated"
      rule_severity: "info" | "review" | "critical"
      sales_tax_provider: "table" | "avalara"
      sales_tax_sourcing: "origin" | "destination"
      semaphore_status: "blue" | "green" | "amber" | "red"
      subscription_plan:
        | "starter"
        | "entrepreneur"
        | "bookkeeper"
        | "accountant"
        | "enterprise"
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "expired"
      suggestion_status: "pending" | "accepted" | "rejected" | "expired"
      suggestion_type:
        | "account_assignment"
        | "semaphore_change"
        | "review_question"
        | "reconciliation_match"
        | "overdue_alert"
        | "anomaly_detected"
        | "cgc_override"
      system_role: "super_admin" | "admin" | "bookkeeper" | "client" | "auditor"
      tx_source: "bank_api" | "csv" | "ofx" | "manual" | "erp"
      usage_metric:
        | "plaid_connections"
        | "ai_queries"
        | "transactions"
        | "receipts"
        | "mileage_trips"
        | "invoices"
        | "storage_mb"
      user_type: "staff_user" | "client_user"
      vendor_bill_status: "pending" | "paid" | "overdue"
      vendor_tax_classification:
        | "individual"
        | "sole_prop"
        | "partnership"
        | "c_corp"
        | "s_corp"
        | "llc"
        | "trust_estate"
        | "other"
      vendor_tin_type: "ssn" | "ein"
      vendor_w9_status: "missing" | "requested" | "on_file"
      workspace_kind: "solo" | "pro"
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
    Enums: {
      account_type: [
        "self_employed",
        "bookkeeper",
        "pyme_client",
        "accountant",
      ],
      audit_event_type: [
        "created",
        "normalized",
        "rule_evaluated",
        "semaphore_changed",
        "edited",
        "approved",
        "rejected",
        "locked",
        "journal_posted",
        "integrity_verified",
        "cgc_override",
        "reconciliation_cleared",
      ],
      bank_import_status: ["pending", "processing", "done", "failed"],
      bank_provider: ["plaid", "manual", "direct_api"],
      client_portal_invitation_status: [
        "pending",
        "accepted",
        "expired",
        "revoked",
      ],
      client_portal_role: ["client_owner", "client_contact", "client_viewer"],
      client_workflow_state: ["todo", "in_review", "reconciling", "closed"],
      conversation_status: [
        "open",
        "waiting_client",
        "waiting_internal",
        "resolved",
        "closed",
      ],
      document_status: ["uploaded", "accepted", "rejected", "re_requested"],
      entry_type_enum: ["debit", "credit"],
      estimate_response_type: ["accept", "reject", "counter_offer", "view"],
      estimate_signer_role: ["client", "vendor"],
      estimate_status: [
        "draft",
        "sent",
        "viewed",
        "accepted",
        "rejected",
        "counter_offered",
        "expired",
        "converted",
        "cancelled",
      ],
      estimate_template_category: [
        "electrician",
        "plumber",
        "painter",
        "carpenter",
        "mechanic",
        "gardener",
        "cleaning",
        "construction",
        "moving",
        "hvac",
        "photography",
        "catering",
        "it_development",
        "design",
        "marketing",
        "consulting",
        "beauty_spa",
        "accounting_services",
        "legal_services",
        "bookkeeping_monthly",
        "general_b2b",
        "custom",
        "taxi_driver",
        "delivery_driver",
        "truck_driver",
        "digital_creator",
        "collision_repair",
        "auto_detailing",
      ],
      invitation_type: ["staff", "client"],
      invoice_item_type: ["service", "product", "expense", "discount", "tax"],
      invoice_status: [
        "draft",
        "sent",
        "viewed",
        "partial",
        "paid",
        "overdue",
        "void",
      ],
      journal_entry_kind: [
        "transaction_linked",
        "manual_adjustment",
        "closing_entry",
        "depreciation",
        "opening_balance",
        "payroll",
      ],
      lp_role: [
        "owner",
        "admin",
        "accountant",
        "auditor",
        "approver",
        "readonly",
      ],
      lp_user_tier: ["admin", "tester", "user"],
      manual_journal_batch_status: ["draft", "posted", "reversed"],
      message_channel: ["chat", "sms", "email"],
      message_sender_role: ["bookkeeper", "client", "system"],
      payment_method_type: [
        "ach",
        "check",
        "cash",
        "wire",
        "other_bank",
        "card",
        "third_party_network",
        "unknown",
      ],
      period_status: ["OPEN", "ADJUSTMENT", "CLOSED"],
      recurring_frequency: [
        "weekly",
        "biweekly",
        "monthly",
        "quarterly",
        "yearly",
      ],
      recurring_status: ["active", "paused", "ended"],
      review_answer: ["personal", "business", "split", "unknown"],
      review_status: [
        "pending",
        "answered",
        "confirmed",
        "rejected",
        "escalated",
      ],
      rule_severity: ["info", "review", "critical"],
      sales_tax_provider: ["table", "avalara"],
      sales_tax_sourcing: ["origin", "destination"],
      semaphore_status: ["blue", "green", "amber", "red"],
      subscription_plan: [
        "starter",
        "entrepreneur",
        "bookkeeper",
        "accountant",
        "enterprise",
      ],
      subscription_status: [
        "trialing",
        "active",
        "past_due",
        "canceled",
        "expired",
      ],
      suggestion_status: ["pending", "accepted", "rejected", "expired"],
      suggestion_type: [
        "account_assignment",
        "semaphore_change",
        "review_question",
        "reconciliation_match",
        "overdue_alert",
        "anomaly_detected",
        "cgc_override",
      ],
      system_role: ["super_admin", "admin", "bookkeeper", "client", "auditor"],
      tx_source: ["bank_api", "csv", "ofx", "manual", "erp"],
      usage_metric: [
        "plaid_connections",
        "ai_queries",
        "transactions",
        "receipts",
        "mileage_trips",
        "invoices",
        "storage_mb",
      ],
      user_type: ["staff_user", "client_user"],
      vendor_bill_status: ["pending", "paid", "overdue"],
      vendor_tax_classification: [
        "individual",
        "sole_prop",
        "partnership",
        "c_corp",
        "s_corp",
        "llc",
        "trust_estate",
        "other",
      ],
      vendor_tin_type: ["ssn", "ein"],
      vendor_w9_status: ["missing", "requested", "on_file"],
      workspace_kind: ["solo", "pro"],
    },
  },
} as const

// ── Convenience aliases ──────────────────────────────────────────────────────
// Hand-maintained re-exports on top of the generated Database type above —
// regenerating this file from the live schema (via the Supabase MCP
// generate_typescript_types tool) only produces the raw Database/Enums block;
// these aliases are what the rest of the codebase actually imports by name.
// Reconstructed 2026-08-18 after a regeneration accidentally dropped them —
// each maps 1:1 to its table's Row (or Insert) shape or its enum, verified
// against actual table/enum names in the block above and against how each
// name is consumed at its import sites.

type PublicSchema = Database["public"]

export type Transaction        = PublicSchema["Tables"]["transactions"]["Row"]
export type InsertTransaction  = PublicSchema["Tables"]["transactions"]["Insert"]
export type Client             = PublicSchema["Tables"]["clients"]["Row"]
export type Organization       = PublicSchema["Tables"]["organizations"]["Row"]
export type OrganizationMembership = PublicSchema["Tables"]["organization_memberships"]["Row"]
export type Profile            = PublicSchema["Tables"]["profiles"]["Row"]
export type Account            = PublicSchema["Tables"]["accounts"]["Row"]
export type Invoice            = PublicSchema["Tables"]["invoices"]["Row"]
export type InvoiceItem        = PublicSchema["Tables"]["invoice_items"]["Row"]
export type JournalEntry       = PublicSchema["Tables"]["journal_entries"]["Row"]

export type LpRole               = PublicSchema["Enums"]["lp_role"]
export type SystemRole           = PublicSchema["Enums"]["system_role"]
export type AccountType          = PublicSchema["Enums"]["account_type"]
export type SubscriptionPlan     = PublicSchema["Enums"]["subscription_plan"]
export type TxSource             = PublicSchema["Enums"]["tx_source"]
export type SemaphoreStatus      = PublicSchema["Enums"]["semaphore_status"]
export type PaymentMethodType    = PublicSchema["Enums"]["payment_method_type"]
export type EntryTypeEnum        = PublicSchema["Enums"]["entry_type_enum"]
export type InvoiceItemType      = PublicSchema["Enums"]["invoice_item_type"]
export type LpUserTier           = PublicSchema["Enums"]["lp_user_tier"]
export type SalesTaxSourcing     = PublicSchema["Enums"]["sales_tax_sourcing"]
export type SalesTaxProviderName = PublicSchema["Enums"]["sales_tax_provider"]
export type InvoiceStatus        = PublicSchema["Enums"]["invoice_status"]
export type AuditEventType       = PublicSchema["Enums"]["audit_event_type"]
export type RuleSeverity         = PublicSchema["Enums"]["rule_severity"]

export type BankImport      = PublicSchema["Tables"]["bank_imports"]["Row"]
export type AuditEvent      = PublicSchema["Tables"]["audit_events"]["Row"]
export type RuleDefinition  = PublicSchema["Tables"]["rule_definitions"]["Row"]
export type InvoicePayment  = PublicSchema["Tables"]["invoice_payments"]["Row"]

// Added 2026-09-23 alongside the vendor_bills / api_keys tables (bill
// tracking + API access features) -- same PublicSchema["Tables"] pattern.
export type VendorBill       = PublicSchema["Tables"]["vendor_bills"]["Row"]
export type InsertVendorBill = PublicSchema["Tables"]["vendor_bills"]["Insert"]
export type VendorBillStatus = PublicSchema["Enums"]["vendor_bill_status"]
export type ApiKey           = PublicSchema["Tables"]["api_keys"]["Row"]

// Added 2026-09-23 alongside the time_entries table (time tracking feature).
export type TimeEntry        = PublicSchema["Tables"]["time_entries"]["Row"]
export type InsertTimeEntry  = PublicSchema["Tables"]["time_entries"]["Insert"]

// Added 2026-09-23 alongside the recurring monthly close checklist feature.
export type RecurringChecklist      = PublicSchema["Tables"]["recurring_checklists"]["Row"]
export type RecurringChecklistItem  = PublicSchema["Tables"]["recurring_checklist_items"]["Row"]
export type ChecklistRun            = PublicSchema["Tables"]["checklist_runs"]["Row"]
export type ChecklistRunItem        = PublicSchema["Tables"]["checklist_run_items"]["Row"]

// Added 2026-09-23 alongside the mileage_connections table (ControlMiles integration).
export type MileageConnection = PublicSchema["Tables"]["mileage_connections"]["Row"]

// ── Config maps (label/color/bg/border, theme-aware via CSS custom
// properties) — actual runtime values, not just types, so components can
// render a consistent badge for a given enum value without redefining the
// palette locally. --sem-cyan is documented in globals.css as reserved for
// 'viewed'-style status; --lp-text-muted/--lp-surface-2/--lp-border are the
// neutral tokens used for inert/closed states elsewhere (e.g. lib/role-config.ts).

export const LP_TIER_CONFIG: Record<LpUserTier, { label: string; color: string; bg: string; border: string }> = {
  admin:  { label: 'Admin',  color: 'var(--sem-cyan)',      bg: 'var(--sem-cyan-bg)',  border: 'var(--sem-cyan-border)' },
  tester: { label: 'Tester', color: 'var(--sem-amber)',     bg: 'var(--sem-amber-bg)', border: 'var(--sem-amber-border)' },
  user:   { label: 'User',   color: 'var(--lp-text-muted)', bg: 'var(--lp-surface-2)', border: 'var(--lp-border)' },
}

export const INVOICE_STATUS_CONFIG: Record<InvoiceStatus, { label: string; color: string; bg: string; border: string }> = {
  draft:   { label: 'Draft',   color: 'var(--lp-text-muted)', bg: 'var(--lp-surface-2)', border: 'var(--lp-border)' },
  sent:    { label: 'Sent',    color: 'var(--sem-blue)',      bg: 'var(--sem-blue-bg)',  border: 'var(--sem-blue-border)' },
  viewed:  { label: 'Viewed',  color: 'var(--sem-cyan)',      bg: 'var(--sem-cyan-bg)',  border: 'var(--sem-cyan-border)' },
  partial: { label: 'Partial', color: 'var(--sem-amber)',     bg: 'var(--sem-amber-bg)', border: 'var(--sem-amber-border)' },
  paid:    { label: 'Paid',    color: 'var(--sem-green)',     bg: 'var(--sem-green-bg)', border: 'var(--sem-green-border)' },
  overdue: { label: 'Overdue', color: 'var(--sem-red)',       bg: 'var(--sem-red-bg)',   border: 'var(--sem-red-border)' },
  void:    { label: 'Void',    color: 'var(--lp-text-muted)', bg: 'var(--lp-surface-2)', border: 'var(--lp-border)' },
}
