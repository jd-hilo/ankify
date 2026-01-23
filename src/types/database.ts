export type AlignmentType =
  | 'directly_aligned'
  | 'deeper_than_lecture'
  | 'too_shallow'
  | 'not_aligned';

export type ProcessingStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed';

export interface Database {
  public: {
    Tables: {
      decks: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          file_type: 'apkg' | 'csv';
          card_count: number;
          version_hash: string;
          processing_status: ProcessingStatus;
          error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['decks']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['decks']['Insert']>;
      };
      card_concepts: {
        Row: {
          id: string;
          deck_id: string;
          card_id: string; // Stable Anki card identifier
          concept_summary: string;
          embedding: number[]; // 1536-dimensional vector
          tags: string[] | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['card_concepts']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['card_concepts']['Insert']>;
      };
      lectures: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          file_type: 'pdf' | 'pptx';
          slide_count: number;
          processing_status: ProcessingStatus;
          error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['lectures']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['lectures']['Insert']>;
      };
      slide_concepts: {
        Row: {
          id: string;
          lecture_id: string;
          slide_number: number;
          concept_summary: string;
          embedding: number[]; // 1536-dimensional vector
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['slide_concepts']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['slide_concepts']['Insert']>;
      };
      card_alignments: {
        Row: {
          id: string;
          lecture_id: string;
          slide_concept_id: string;
          card_concept_id: string;
          alignment_type: AlignmentType;
          similarity_score: number;
          llm_reasoning: string;
          user_override: AlignmentType | null;
          user_override_note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['card_alignments']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['card_alignments']['Insert']>;
      };
      coverage_gaps: {
        Row: {
          id: string;
          lecture_id: string;
          slide_concept_id: string;
          gap_description: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['coverage_gaps']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['coverage_gaps']['Insert']>;
      };
      processing_jobs: {
        Row: {
          id: string;
          user_id: string;
          job_type: 'deck_processing' | 'lecture_processing' | 'alignment_generation';
          target_id: string; // deck_id or lecture_id
          status: ProcessingStatus;
          progress: number; // 0-100
          error_message: string | null;
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['processing_jobs']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['processing_jobs']['Insert']>;
      };
    };
  };
}

// Helper types for easier usage
export type Deck = Database['public']['Tables']['decks']['Row'];
export type CardConcept = Database['public']['Tables']['card_concepts']['Row'];
export type Lecture = Database['public']['Tables']['lectures']['Row'];
export type SlideConcept = Database['public']['Tables']['slide_concepts']['Row'];
export type CardAlignment = Database['public']['Tables']['card_alignments']['Row'];
export type CoverageGap = Database['public']['Tables']['coverage_gaps']['Row'];
export type ProcessingJob = Database['public']['Tables']['processing_jobs']['Row'];
