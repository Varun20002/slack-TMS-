export type Role = "admin" | "trainer";
export type WebinarStatus = "upcoming" | "completed" | "cancelled";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: Role;
          full_name: string;
          phone: string | null;
          email: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          role: Role;
          full_name: string;
          phone?: string | null;
          email: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Database["public"]["Tables"]["profiles"]["Row"], "id" | "created_at">>;
      };
      trainers: {
        Row: {
          id: string;
          profile_id: string | null;
          name: string;
          experience: number;
          investing_trading_persona: string;
          strengths: string;
          product_categories: string[];
          nature_of_business: string;
          phone_number: string;
          email: string;
          languages_spoken: string;
          base_city: string;
          credentials_or_claim_to_fame: string | null;
          certifications: string | null;
          social_media_handles: Record<string, string> | null;
          average_rating: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["trainers"]["Row"], "id" | "average_rating" | "created_at" | "updated_at"> & {
          id?: string;
          average_rating?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Database["public"]["Tables"]["trainers"]["Row"], "id" | "created_at">>;
      };
      webinars: {
        Row: {
          id: string;
          trainer_id: string;
          title: string;
          requirements: string | null;
          target_user_base: string | null;
          webinar_timing: string;
          duration_minutes: number;
          pre_webinar_link: string | null;
          post_webinar_link: string | null;
          google_calendar_embed_url: string | null;
          status: WebinarStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["webinars"]["Row"], "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Database["public"]["Tables"]["webinars"]["Row"], "id" | "created_at">>;
      };
      webinar_metrics: {
        Row: {
          id: string;
          webinar_id: string;
          registrations_count: number;
          attendees_count: number;
          first_time_future_traders_count: number;
          rating: number | null;
          highest_audience_count: number | null;
          success_rate: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["webinar_metrics"]["Row"], "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Database["public"]["Tables"]["webinar_metrics"]["Row"], "id" | "created_at">>;
      };
      trainer_availability: {
        Row: {
          id: string;
          trainer_id: string;
          day_of_week: number;
          start_time: string;
          end_time: string;
          timezone: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["trainer_availability"]["Row"], "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Database["public"]["Tables"]["trainer_availability"]["Row"], "id" | "created_at">>;
      };
      rating_upload_batches: {
        Row: {
          id: string;
          uploaded_by: string;
          file_name: string;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["rating_upload_batches"]["Row"], "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<Database["public"]["Tables"]["rating_upload_batches"]["Row"], "id" | "created_at">>;
      };
      trainer_ratings: {
        Row: {
          id: string;
          trainer_id: string;
          webinar_id: string | null;
          upload_batch_id: string | null;
          rating: number;
          source: string;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["trainer_ratings"]["Row"], "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<Database["public"]["Tables"]["trainer_ratings"]["Row"], "id" | "created_at">>;
      };
      badges: {
        Row: {
          id: string;
          name: string;
          description: string;
          icon: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["badges"]["Row"], "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<Database["public"]["Tables"]["badges"]["Row"], "id" | "created_at">>;
      };
      trainer_badges: {
        Row: {
          id: string;
          trainer_id: string;
          badge_id: string;
          awarded_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["trainer_badges"]["Row"], "id"> & { id?: string };
        Update: Partial<Omit<Database["public"]["Tables"]["trainer_badges"]["Row"], "id">>;
      };
      incentives: {
        Row: {
          id: string;
          trainer_id: string;
          title: string;
          description: string | null;
          amount_or_reward: string;
          awarded_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["incentives"]["Row"], "id"> & { id?: string };
        Update: Partial<Omit<Database["public"]["Tables"]["incentives"]["Row"], "id">>;
      };
    };
  };
};
