// Auto-derive from this file. Run `supabase gen types typescript` to regenerate.
// This is a hand-authored version matching the migrations exactly.

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export type Role = 'owner' | 'admin' | 'teacher'
export type SessionStatus = 'draft' | 'published' | 'delivered' | 'archived'
export type SessionType = 'sermon' | 'sunday_school' | 'bible_study' | (string & {})
export type Visibility = 'private' | 'church' | 'public'
export type BlockType = 'point' | 'sub_point' | 'scripture' | 'illustration' | 'application' | 'transition'
export type Confidence = 'high' | 'medium' | 'low'
export type ValidationStatus = 'untested' | 'valid' | 'invalid' | 'expired'
export type ThoughtType = 'text' | 'audio'
export type TranscriptionStatus = 'none' | 'pending' | 'complete' | 'failed'
export type NotificationCategory = 'teaching' | 'system'
export type ImportSourceType = 'text_paste' | 'txt' | 'docx'
export type ImportStatus = 'pending' | 'reviewed' | 'applied' | 'discarded'

export interface AISource {
  model: string
  prompt_version: string
  confidence: Confidence
}

export interface ScriptureData {
  book: string
  chapter_start: number
  verse_start: number
  chapter_end?: number
  verse_end?: number
}

// ── Table row types ────────────────────────────────────────────────────────────

export interface Church {
  id: string
  name: string
  slug: string
  owner_id: string | null
  settings: Json
  created_at: string
}

export interface ChurchMember {
  id: string
  church_id: string
  user_id: string
  role: Role
  is_active: boolean
  created_at: string
}

export interface Profile {
  id: string
  full_name: string | null
  avatar_url: string | null
  bio: string | null
  updated_at: string
}

// ── User AI Credentials ───────────────────────────────────────────────────────
// One row per (user_id, provider). Table: user_ai_credentials.
// Replaces the old user_ai_keys table (single-row-per-user with provider-specific columns).
// Never contains the raw API key — api_key_enc is the AES-256-GCM encrypted form.
export interface UserAICredential {
  user_id: string
  provider: SupportedAIProvider
  api_key_enc: string | null
  model_preference: string | null
  validation_status: ValidationStatus
  validated_at: string | null
  validation_error: string | null
  created_at: string
  updated_at: string
}

export type SupportedAIProvider = 'openai' | 'anthropic' | 'google'

// Kept for reference during migration — remove after migration 008 is applied.
// @deprecated Use UserAICredential instead.
export interface UserAIKey {
  user_id: string
  openai_key_enc: string | null
  model_preference: string
  validation_status: ValidationStatus
  validated_at: string | null
  validation_error: string | null
  created_at: string
  updated_at: string
}


export interface ChurchLessonType {
  id: string
  church_id: string
  key: string
  label: string
  description: string | null
  is_enabled: boolean
  sort_order: number
  default_flow_id: string | null
  created_at: string
  updated_at: string
}

export interface TeachingSession {
  id: string
  church_id: string
  teacher_id: string
  type: SessionType
  title: string
  scripture_ref: string | null
  scripture_data: ScriptureData | null
  status: SessionStatus
  visibility: Visibility
  estimated_duration: number | null
  notes: string | null
  scheduled_date: string | null
  published_at: string | null
  delivered_at: string | null
  created_at: string
  updated_at: string
}

export interface Flow {
  id: string
  church_id: string
  teacher_id: string
  name: string
  description: string | null
  structure: FlowBlock[]
  is_default_for: SessionType | null
  is_archived: boolean
  archived_at: string | null
  created_at: string
  updated_at: string
}

export interface FlowBlock {
  type: BlockType
  label: string
  placeholder?: string
}

export interface Outline {
  id: string
  session_id: string
  church_id: string
  layout_config: { font_size_pref?: 'small' | 'medium' | 'large' }
  created_at: string
  updated_at: string
}

export interface OutlineBlock {
  id: string
  outline_id: string
  parent_id: string | null
  type: BlockType
  content: string
  scripture_ref: string | null
  position: number
  estimated_minutes: number | null
  ai_source: AISource | null
  ai_edited: boolean
  created_at: string
  updated_at: string
}

export interface ThoughtCapture {
  id: string
  session_id: string
  church_id: string
  type: ThoughtType
  content: string | null
  storage_path: string | null
  file_name: string | null
  file_size_bytes: number | null
  duration_seconds: number | null
  transcription_status: TranscriptionStatus
  created_at: string
}

// ── Snapshot data shapes ───────────────────────────────────────────────────────

export interface SessionSnapshotData {
  title: string
  scripture_ref: string | null
  scripture_data: ScriptureData | null
  type: SessionType
  status: SessionStatus
  visibility: Visibility
  estimated_duration: number | null
  notes: string | null
  confirmed_tag_ids: string[]
}

export interface SessionSnapshot {
  id: string
  session_id: string
  church_id: string
  version_number: number
  label: string | null
  data: SessionSnapshotData
  created_by: string | null
  created_at: string
}

export interface OutlineSnapshot {
  id: string
  outline_id: string
  session_id: string
  church_id: string
  version_number: number
  label: string | null
  blocks: OutlineBlock[]
  created_by: string | null
  created_at: string
}

// ── Tags ───────────────────────────────────────────────────────────────────────

export interface TagTaxonomy {
  id: string
  church_id: string
  name: string
  slug: string
  is_system: boolean
  created_at: string
}

export interface Tag {
  id: string
  church_id: string
  taxonomy_id: string
  label: string
  slug: string
  created_at: string
}

export interface ContentTag {
  id: string
  church_id: string
  session_id: string
  tag_id: string
  is_ai_suggested: boolean
  confirmed: boolean
  created_at: string
}

// ── Notifications ──────────────────────────────────────────────────────────────

export interface Notification {
  id: string
  church_id: string
  user_id: string
  category: NotificationCategory
  title: string
  body: string | null
  action_url: string | null
  read_at: string | null
  created_at: string
}

export interface NotificationPref {
  id: string
  church_id: string
  user_id: string
  email_enabled: boolean
  updated_at: string
}

// ── Imports ────────────────────────────────────────────────────────────────────

export interface Import {
  id: string
  church_id: string
  teacher_id: string
  source_type: ImportSourceType
  original_content: string | null
  parsed_outline: Json | null
  status: ImportStatus
  session_id: string | null
  created_at: string
}

// ── Audit log ──────────────────────────────────────────────────────────────────

export interface AuditLog {
  id: string
  church_id: string
  actor_user_id: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  metadata: Json
  created_at: string
}

// ── Theological tradition ──────────────────────────────────────────────────────

export type TheologicalTradition =
  | 'reformed'
  | 'presbyterian'
  | 'baptist'
  | 'methodist'
  | 'lutheran'
  | 'anglican'
  | 'pentecostal'
  | 'catholic'
  | 'eastern_orthodox'
  | 'nondenominational'

export const TRADITION_LABELS: Record<TheologicalTradition, string> = {
  reformed: 'Reformed',
  presbyterian: 'Presbyterian',
  baptist: 'Baptist',
  methodist: 'Methodist',
  lutheran: 'Lutheran',
  anglican: 'Anglican / Episcopal',
  pentecostal: 'Pentecostal / Charismatic',
  catholic: 'Catholic',
  eastern_orthodox: 'Eastern Orthodox',
  nondenominational: 'Non-denominational',
}

// ── Series ─────────────────────────────────────────────────────────────────────

export type SeriesStatus = 'planning' | 'active' | 'completed' | 'archived'
export type SeriesSessionStatus = 'planned' | 'created' | 'delivered'

export interface Series {
  id: string
  church_id: string
  teacher_id: string
  title: string
  description: string | null
  scripture_section: string | null
  total_weeks: number | null
  start_date: string | null
  tradition: string | null
  status: SeriesStatus
  created_at: string
  updated_at: string
}

export interface SeriesSession {
  id: string
  series_id: string
  session_id: string | null
  week_number: number
  proposed_title: string | null
  proposed_scripture: string | null
  notes: string | null
  liturgical_note: string | null
  status: SeriesSessionStatus
  week_type: 'normal' | 'skipped' | 'guest'
  skip_reason: string | null
  guest_name: string | null
  guest_in_series: boolean
  computed_date: string | null   // series.start_date + (week_number-1)*7 days
  created_at: string
}

// ── Research items ─────────────────────────────────────────────────────────────

export type ResearchCategory =
  | 'word_study'
  | 'related_text'
  | 'theological'
  | 'practical'
  | 'historical'
  | 'denominational'
  | 'current_topic'

export type ResearchSourceType = 'ai_synthesis' | 'sourced' | 'user'

export interface VerseNote {
  id: string
  session_id: string
  church_id: string
  teacher_id: string
  verse_ref: string
  content: string
  position: number
  used_count: number
  created_at: string
  updated_at: string
}

export interface ResearchItem {
  id: string
  session_id: string
  church_id: string
  teacher_id: string
  category: ResearchCategory
  subcategory: string | null
  title: string
  content: string
  source_label: string
  source_type: ResearchSourceType
  confidence: Confidence | null
  is_pinned: boolean
  is_dismissed: boolean
  metadata: Json
  position: number
  created_at: string
}

// Research item metadata shapes per category
export interface WordStudyMeta {
  word: string
  original_language: 'hebrew' | 'greek' | 'aramaic'
  strongs_ref?: string
  semantic_range?: string[]
}

export interface RelatedTextMeta {
  ref: string
  testament: 'old' | 'new'
  relation_type: 'common' | 'less_common'
}

export interface PracticalItemMeta {
  subcategory: 'application' | 'analogy' | 'insight'
  suggested_block_type: BlockType
}

export interface TheologicalItemMeta {
  tradition: string
  is_cross_tradition: boolean
}

// ── AI types (shared between client and server) ────────────────────────────────
// These are separate from server-only AI generation code.

export interface ProposedWeek {
  week_number: number
  proposed_title: string
  proposed_scripture: string
  notes: string
  liturgical_note: string | null
}
