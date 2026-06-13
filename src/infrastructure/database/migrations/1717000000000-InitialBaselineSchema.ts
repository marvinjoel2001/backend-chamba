import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Baseline del esquema completo de Chamba (generado desde el esquema real via pg_dump).
 * Crea todas las tablas, indices y constraints existentes. Es el punto de partida del
 * versionado por migraciones. En bases ya existentes se marca como aplicada sin re-ejecutar.
 */
export class InitialBaselineSchema1717000000000 implements MigrationInterface {
  name = 'InitialBaselineSchema1717000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;
CREATE TYPE public.users_type_enum AS ENUM (
    'client',
    'worker'
);
CREATE TYPE public.users_verification_status_enum AS ENUM (
    'not_verified',
    'pending',
    'verified'
);
CREATE TABLE public.api_request_logs (
    id bigint NOT NULL,
    method text NOT NULL,
    path text NOT NULL,
    status_code integer NOT NULL,
    duration_ms integer NOT NULL,
    ip text,
    user_agent text,
    query_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    request_body_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    response_preview text,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE VIEW public.api_request_logs_grafana_v1 AS
 SELECT created_at AS "time",
    method,
    path,
    status_code,
    duration_ms,
    ip,
    user_agent,
    error_message
   FROM public.api_request_logs;
CREATE SEQUENCE public.api_request_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.api_request_logs_id_seq OWNED BY public.api_request_logs.id;
CREATE TABLE public.app_config (
    key text NOT NULL,
    value_json jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.auth_credentials (
    user_id uuid NOT NULL,
    password text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.categories (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    icon text,
    parent_id text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    thread_id uuid NOT NULL,
    sender_user_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.chat_threads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid,
    client_user_id uuid NOT NULL,
    worker_user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.dismissed_requests (
    request_id uuid NOT NULL,
    worker_user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.dispute_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dispute_id uuid NOT NULL,
    sender_type text DEFAULT 'user'::text NOT NULL,
    sender_id uuid,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.disputes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid,
    reported_by uuid NOT NULL,
    reported_user uuid,
    reason text NOT NULL,
    description text,
    status text DEFAULT 'open'::text NOT NULL,
    resolution text,
    resolved_by text,
    resolved_at timestamp with time zone,
    user_last_read_at timestamp with time zone,
    admin_last_read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.job_offers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    worker_user_id uuid NOT NULL,
    amount numeric(12,2) NOT NULL,
    message text,
    status text DEFAULT 'pending'::text NOT NULL,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.job_request_photos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    url text NOT NULL,
    public_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.job_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_user_id uuid NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    category text NOT NULL,
    budget numeric(12,2) NOT NULL,
    price_type text NOT NULL,
    scheduled_at timestamp with time zone,
    location public.geography(Point,4326) NOT NULL,
    address text NOT NULL,
    status text DEFAULT 'searching'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    ai_categories jsonb DEFAULT '[]'::jsonb NOT NULL,
    worker_arrived boolean DEFAULT false NOT NULL,
    client_confirmed_arrival boolean DEFAULT false NOT NULL,
    completed_at timestamp with time zone,
    work_started_at timestamp with time zone,
    payment_method text DEFAULT 'Efectivo'::text NOT NULL
);
CREATE TABLE public.notifications (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    title character varying NOT NULL,
    body character varying NOT NULL,
    type character varying NOT NULL,
    data jsonb,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.payment_methods (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(100) NOT NULL,
    code character varying(50) NOT NULL,
    description text,
    icon character varying(50),
    color character varying(20) DEFAULT '#4CAF50'::character varying NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    config text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.push_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token text NOT NULL,
    platform text DEFAULT 'unknown'::text NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.request_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    reporter_user_id uuid NOT NULL,
    reason text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.user_blocks (
    blocker_user_id uuid NOT NULL,
    blocked_user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    type public.users_type_enum DEFAULT 'client'::public.users_type_enum NOT NULL,
    email character varying NOT NULL,
    phone character varying,
    country_code character varying,
    ci_number character varying,
    verification_status public.users_verification_status_enum DEFAULT 'not_verified'::public.users_verification_status_enum NOT NULL,
    id_photo_url character varying,
    face_photo_url character varying,
    id_photo_verified boolean,
    face_photo_verified boolean,
    verification_reviewed_at timestamp with time zone,
    first_name character varying NOT NULL,
    last_name character varying,
    profile_photo_url character varying,
    profile_photo_public_id character varying,
    current_location public.geography(Point,4326),
    work_radius_km double precision DEFAULT '5'::double precision NOT NULL,
    average_rating double precision DEFAULT '0'::double precision NOT NULL,
    completed_jobs integer DEFAULT 0 NOT NULL,
    is_available boolean DEFAULT false NOT NULL,
    is_blocked boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    google_id text
);
CREATE TABLE public.worker_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    worker_user_id uuid NOT NULL,
    client_user_id uuid NOT NULL,
    stars integer NOT NULL,
    comment text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT worker_reviews_stars_check CHECK (((stars >= 1) AND (stars <= 5)))
);
CREATE TABLE public.worker_skills (
    user_id uuid NOT NULL,
    skill text NOT NULL
);
ALTER TABLE ONLY public.api_request_logs ALTER COLUMN id SET DEFAULT nextval('public.api_request_logs_id_seq'::regclass);
ALTER TABLE ONLY public.payment_methods
    ADD CONSTRAINT "PK_34f9b8c6dfb4ac3559f7e2820d1" PRIMARY KEY (id);
ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY (id);
ALTER TABLE ONLY public.users
    ADD CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY (id);
ALTER TABLE ONLY public.users
    ADD CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE (email);
ALTER TABLE ONLY public.payment_methods
    ADD CONSTRAINT "UQ_f8aad3eab194dfdae604ca11125" UNIQUE (code);
ALTER TABLE ONLY public.api_request_logs
    ADD CONSTRAINT api_request_logs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.app_config
    ADD CONSTRAINT app_config_pkey PRIMARY KEY (key);
ALTER TABLE ONLY public.auth_credentials
    ADD CONSTRAINT auth_credentials_pkey PRIMARY KEY (user_id);
ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_name_key UNIQUE (name);
ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.chat_threads
    ADD CONSTRAINT chat_threads_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.chat_threads
    ADD CONSTRAINT chat_threads_request_id_client_user_id_worker_user_id_key UNIQUE (request_id, client_user_id, worker_user_id);
ALTER TABLE ONLY public.dismissed_requests
    ADD CONSTRAINT dismissed_requests_pkey PRIMARY KEY (request_id, worker_user_id);
ALTER TABLE ONLY public.dispute_messages
    ADD CONSTRAINT dispute_messages_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.disputes
    ADD CONSTRAINT disputes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.job_offers
    ADD CONSTRAINT job_offers_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.job_offers
    ADD CONSTRAINT job_offers_request_id_worker_user_id_key UNIQUE (request_id, worker_user_id);
ALTER TABLE ONLY public.job_request_photos
    ADD CONSTRAINT job_request_photos_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.job_requests
    ADD CONSTRAINT job_requests_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.push_tokens
    ADD CONSTRAINT push_tokens_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.push_tokens
    ADD CONSTRAINT push_tokens_token_key UNIQUE (token);
ALTER TABLE ONLY public.request_reports
    ADD CONSTRAINT request_reports_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.request_reports
    ADD CONSTRAINT request_reports_request_id_reporter_user_id_key UNIQUE (request_id, reporter_user_id);
ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT user_blocks_pkey PRIMARY KEY (blocker_user_id, blocked_user_id);
ALTER TABLE ONLY public.worker_reviews
    ADD CONSTRAINT worker_reviews_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.worker_skills
    ADD CONSTRAINT worker_skills_pkey PRIMARY KEY (user_id, skill);
CREATE INDEX idx_api_logs_created_at ON public.api_request_logs USING btree (created_at DESC);
CREATE INDEX idx_api_logs_method ON public.api_request_logs USING btree (method);
CREATE INDEX idx_api_logs_status ON public.api_request_logs USING btree (status_code);
CREATE INDEX idx_categories_active_name ON public.categories USING btree (is_active, name);
CREATE INDEX idx_chat_messages_thread_created ON public.chat_messages USING btree (thread_id, created_at DESC);
CREATE INDEX idx_dispute_messages_dispute ON public.dispute_messages USING btree (dispute_id, created_at);
CREATE INDEX idx_disputes_request ON public.disputes USING btree (request_id);
CREATE INDEX idx_disputes_status ON public.disputes USING btree (status);
CREATE INDEX idx_job_offers_request ON public.job_offers USING btree (request_id);
CREATE INDEX idx_job_request_photos_request ON public.job_request_photos USING btree (request_id);
CREATE INDEX idx_job_requests_location ON public.job_requests USING gist (location);
CREATE INDEX idx_push_tokens_user ON public.push_tokens USING btree (user_id);
CREATE INDEX idx_users_current_location ON public.users USING gist (current_location);
CREATE UNIQUE INDEX idx_users_google_id ON public.users USING btree (google_id);
CREATE UNIQUE INDEX idx_worker_reviews_request ON public.worker_reviews USING btree (request_id);
ALTER TABLE ONLY public.auth_credentials
    ADD CONSTRAINT auth_credentials_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.categories(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_sender_user_id_fkey FOREIGN KEY (sender_user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.chat_threads(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.chat_threads
    ADD CONSTRAINT chat_threads_client_user_id_fkey FOREIGN KEY (client_user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.chat_threads
    ADD CONSTRAINT chat_threads_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.job_requests(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.chat_threads
    ADD CONSTRAINT chat_threads_worker_user_id_fkey FOREIGN KEY (worker_user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.dismissed_requests
    ADD CONSTRAINT dismissed_requests_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.job_requests(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.dismissed_requests
    ADD CONSTRAINT dismissed_requests_worker_user_id_fkey FOREIGN KEY (worker_user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.dispute_messages
    ADD CONSTRAINT dispute_messages_dispute_id_fkey FOREIGN KEY (dispute_id) REFERENCES public.disputes(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.dispute_messages
    ADD CONSTRAINT dispute_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.disputes
    ADD CONSTRAINT disputes_reported_by_fkey FOREIGN KEY (reported_by) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.disputes
    ADD CONSTRAINT disputes_reported_user_fkey FOREIGN KEY (reported_user) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.disputes
    ADD CONSTRAINT disputes_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.job_requests(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.job_offers
    ADD CONSTRAINT job_offers_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.job_requests(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.job_offers
    ADD CONSTRAINT job_offers_worker_user_id_fkey FOREIGN KEY (worker_user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.job_request_photos
    ADD CONSTRAINT job_request_photos_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.job_requests(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.job_requests
    ADD CONSTRAINT job_requests_client_user_id_fkey FOREIGN KEY (client_user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.push_tokens
    ADD CONSTRAINT push_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.request_reports
    ADD CONSTRAINT request_reports_reporter_user_id_fkey FOREIGN KEY (reporter_user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.request_reports
    ADD CONSTRAINT request_reports_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.job_requests(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT user_blocks_blocked_user_id_fkey FOREIGN KEY (blocked_user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT user_blocks_blocker_user_id_fkey FOREIGN KEY (blocker_user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.worker_reviews
    ADD CONSTRAINT worker_reviews_client_user_id_fkey FOREIGN KEY (client_user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.worker_reviews
    ADD CONSTRAINT worker_reviews_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.job_requests(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.worker_reviews
    ADD CONSTRAINT worker_reviews_worker_user_id_fkey FOREIGN KEY (worker_user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.worker_skills
    ADD CONSTRAINT worker_skills_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
`);
  }

  public async down(): Promise<void> {
    throw new Error('Baseline migration is irreversible (no down).');
  }
}
