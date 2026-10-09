-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "album_events" (
    "id" SERIAL NOT NULL,
    "album_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "sort_order" INTEGER DEFAULT 0,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "album_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "album_settings" (
    "vendor_id" INTEGER NOT NULL,
    "pw_prefix" VARCHAR(40) DEFAULT '',
    "spw_prefix" VARCHAR(40) DEFAULT '',
    "instructions_template" TEXT,

    CONSTRAINT "album_settings_pkey" PRIMARY KEY ("vendor_id")
);

-- CreateTable
CREATE TABLE "albums" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "category" VARCHAR(80),
    "cover_photo" VARCHAR(300),
    "guest_username" VARCHAR(80),
    "guest_password" VARCHAR(120),
    "admin_username" VARCHAR(80),
    "admin_password" VARCHAR(120),
    "guest_password_enc" TEXT,
    "admin_password_enc" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "exp_enabled" BOOLEAN DEFAULT false,
    "exp_from_date" DATE,
    "exp_date" DATE,
    "exp_notes" TEXT,
    "client_email" VARCHAR(160),
    "face_ai" BOOLEAN DEFAULT false,
    "public_token" VARCHAR(40),
    "gallery_mode" VARCHAR(20),
    "faces_clustered" BOOLEAN DEFAULT false,
    "face_engine_lock" VARCHAR(10),
    "cover_focus" VARCHAR(20) DEFAULT '50% 50%',
    "has_collection" BOOLEAN NOT NULL DEFAULT false,
    "kind" VARCHAR(16) NOT NULL DEFAULT 'gallery',
    "selfie_strictness" SMALLINT,

    CONSTRAINT "albums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatbot_knowledge" (
    "vendor_id" INTEGER NOT NULL,
    "business_name" VARCHAR(160),
    "tagline" VARCHAR(240),
    "service_area" VARCHAR(240),
    "contact" VARCHAR(240),
    "hours" VARCHAR(240),
    "services" TEXT,
    "packages" TEXT,
    "faqs" TEXT,
    "policies" TEXT,
    "notes" TEXT,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "about_team" TEXT,
    "languages" VARCHAR(240),
    "avoid_topics" TEXT,
    "tone_notes" TEXT,
    "delivery_time" VARCHAR(240),
    "bot_name" VARCHAR(60),

    CONSTRAINT "chatbot_knowledge_pkey" PRIMARY KEY ("vendor_id")
);

-- CreateTable
CREATE TABLE "chatbot_messages" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "name" VARCHAR(160),
    "contact" VARCHAR(160),
    "status" VARCHAR(20) DEFAULT 'unread',
    "session" VARCHAR(64),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chatbot_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatbot_pending" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "status" VARCHAR(20) DEFAULT 'pending',
    "session" VARCHAR(64),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chatbot_pending_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatbot_subscribers" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "active" BOOLEAN DEFAULT true,
    "share_token" VARCHAR(24),
    "access_code" VARCHAR(60),
    "subscribed_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chatbot_subscribers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatbot_transcripts" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "session" VARCHAR(64) NOT NULL,
    "role" VARCHAR(12) NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "visitor_name" VARCHAR(120),

    CONSTRAINT "chatbot_transcripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatbot_usage" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "session" VARCHAR(64),
    "input_tokens" INTEGER DEFAULT 0,
    "output_tokens" INTEGER DEFAULT 0,
    "cost_usd" DECIMAL(10,6) DEFAULT 0,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chatbot_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_audit" (
    "id" SERIAL NOT NULL,
    "contract_id" INTEGER NOT NULL,
    "event" VARCHAR(40) NOT NULL,
    "ip" VARCHAR(64),
    "meta" JSONB,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_templates" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "name" VARCHAR(120) NOT NULL DEFAULT 'My Contract',
    "event_type" VARCHAR(100),
    "header" TEXT DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "legal_terms" TEXT DEFAULT '',
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "sections" JSONB NOT NULL DEFAULT '[]',
    "is_default" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "contract_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "title" VARCHAR(200) DEFAULT 'Service Agreement',
    "body" TEXT NOT NULL,
    "status" VARCHAR(20) DEFAULT 'draft',
    "signed_name" VARCHAR(200),
    "signed_ip" VARCHAR(64),
    "signed_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "signature_data" TEXT,
    "initials" JSONB DEFAULT '[]',
    "viewed_at" TIMESTAMP(6),
    "doc_sha256" VARCHAR(64),
    "package_id" INTEGER,
    "template_id" INTEGER,
    "voided_at" TIMESTAMP(6),
    "released_at" TIMESTAMP(6),

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crew_members" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "role" VARCHAR(80),
    "phone" VARCHAR(40),
    "email" VARCHAR(200),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crew_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_settings" (
    "vendor_id" INTEGER NOT NULL,
    "mode" VARCHAR(20) DEFAULT 'platform',
    "smtp_host" VARCHAR(200),
    "smtp_port" INTEGER DEFAULT 587,
    "smtp_user" VARCHAR(200),
    "smtp_pass" VARCHAR(300),
    "from_name" VARCHAR(120),
    "from_email" VARCHAR(200),
    "notify_email" VARCHAR(200),
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_settings_pkey" PRIMARY KEY ("vendor_id")
);

-- CreateTable
CREATE TABLE "email_templates" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "subject" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "face_clusters" (
    "id" SERIAL NOT NULL,
    "album_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "engine" VARCHAR(20),
    "centroid" JSONB,
    "cover_photo_id" INTEGER,
    "cover_box" JSONB,
    "photo_count" INTEGER DEFAULT 0,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "face_clusters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorites" (
    "id" SERIAL NOT NULL,
    "album_id" INTEGER NOT NULL,
    "photo_id" INTEGER NOT NULL,
    "email" VARCHAR(160) NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gallery_theme" (
    "vendor_id" INTEGER NOT NULL,
    "heading_font" VARCHAR(60) DEFAULT 'Playfair Display',
    "body_font" VARCHAR(60) DEFAULT 'Jost',
    "bg_color" VARCHAR(9) DEFAULT '#0f1115',
    "heading_color" VARCHAR(9) DEFAULT '#f3f4f6',
    "accent_color" VARCHAR(9) DEFAULT '#2dd4bf',
    "sub_color" VARCHAR(9) DEFAULT '#9ca3af',
    "title_text" VARCHAR(120) DEFAULT 'Client Galleries',
    "subtitle_text" VARCHAR(160) DEFAULT 'Secure, Password-Protected Memories',
    "tagline_text" VARCHAR(200) DEFAULT 'Ready to view, share and download.',
    "default_mode" VARCHAR(20) DEFAULT 'per_event',

    CONSTRAINT "gallery_theme_pkey" PRIMARY KEY ("vendor_id")
);

-- CreateTable
CREATE TABLE "inquiry_settings" (
    "vendor_id" INTEGER NOT NULL,
    "brand_name" VARCHAR(120),
    "brand_color" VARCHAR(20) DEFAULT '#2dd4bf',
    "intro_text" VARCHAR(300) DEFAULT 'Tell us about your event 💫',
    "show_phone" BOOLEAN DEFAULT true,
    "show_guests" BOOLEAN DEFAULT true,
    "show_times" BOOLEAN DEFAULT true,
    "show_location" BOOLEAN DEFAULT true,
    "show_getting_ready" BOOLEAN DEFAULT true,
    "show_notes" BOOLEAN DEFAULT true,
    "event_types" JSONB DEFAULT '["Wedding", "Engagement", "Portrait", "Event", "Other"]',
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "custom_fields" JSONB DEFAULT '[]',
    "theme" VARCHAR(30) DEFAULT 'classic',
    "font" VARCHAR(60) DEFAULT 'Inter',
    "details_heading" VARCHAR(200) DEFAULT 'Event Details',
    "background" VARCHAR(30) DEFAULT 'none',
    "intro_link" VARCHAR(300) DEFAULT '',

    CONSTRAINT "inquiry_settings_pkey" PRIMARY KEY ("vendor_id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "invoice_number" VARCHAR(30) NOT NULL,
    "items" JSONB DEFAULT '[]',
    "subtotal" DECIMAL(10,2) DEFAULT 0,
    "discount" DECIMAL(10,2) DEFAULT 0,
    "total" DECIMAL(10,2) DEFAULT 0,
    "paid" DECIMAL(10,2) DEFAULT 0,
    "balance" DECIMAL(10,2) DEFAULT 0,
    "notes" VARCHAR(300),
    "status" VARCHAR(20) DEFAULT 'issued',
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_crew" (
    "id" SERIAL NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "crew_member_id" INTEGER NOT NULL,
    "duty" VARCHAR(120),
    "arrive_time" VARCHAR(20),
    "leave_time" VARCHAR(20),
    "checkin_token" VARCHAR(64),
    "checked_in_at" TIMESTAMP(6),
    "checked_out_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_crew_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER,
    "name" VARCHAR(200),
    "email" VARCHAR(200),
    "phone" VARCHAR(50),
    "event_type" VARCHAR(100),
    "event_date" DATE,
    "timing_from" VARCHAR(20),
    "timing_to" VARCHAR(20),
    "location" VARCHAR(300),
    "hours" INTEGER,
    "guests" INTEGER,
    "gr_bride" BOOLEAN DEFAULT false,
    "gr_bride_venue" VARCHAR(300),
    "gr_groom" BOOLEAN DEFAULT false,
    "gr_groom_venue" VARCHAR(300),
    "notes" TEXT,
    "internal_notes" TEXT,
    "status" VARCHAR(50) DEFAULT 'new',
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "package_id" INTEGER,
    "package_snapshot" JSONB,
    "deposit_percent" INTEGER DEFAULT 30,
    "discount_percent" DECIMAL(5,2) DEFAULT 0,
    "price_override" DECIMAL(10,2),
    "archived_at" TIMESTAMP(6),
    "billed" BOOLEAN DEFAULT false,
    "delivered" BOOLEAN DEFAULT false,
    "booking_notes" TEXT,
    "ceremony" TEXT,
    "client_token" VARCHAR(64),
    "custom_data" JSONB DEFAULT '{}',
    "role" VARCHAR(50),
    "instagram" VARCHAR(120),
    "heard" VARCHAR(120),
    "gateway_enabled" BOOLEAN DEFAULT false,
    "web_payment_enabled" BOOLEAN DEFAULT true,
    "timer_enabled" BOOLEAN DEFAULT false,
    "timer_hours" INTEGER DEFAULT 72,
    "timer_started_at" TIMESTAMPTZ(6),
    "seen_at" TIMESTAMP(6),
    "form_snapshot" JSONB,
    "package_template_id" INTEGER,
    "packages_sent_at" TIMESTAMP(6),
    "payment_claimed_at" TIMESTAMP(6),
    "deposit_amount_override" DECIMAL(10,2),
    "client_birthday" DATE,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "type" VARCHAR(40) DEFAULT 'info',
    "title" VARCHAR(200) NOT NULL,
    "body" VARCHAR(400),
    "seen_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "link_type" VARCHAR(20),
    "link_id" INTEGER,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offers" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "label" VARCHAR(120),
    "percent_off" INTEGER NOT NULL,
    "active" BOOLEAN DEFAULT true,
    "starts_at" DATE,
    "ends_at" DATE,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "applies_to" VARCHAR(40) DEFAULT 'all',

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_items" (
    "id" SERIAL NOT NULL,
    "package_id" INTEGER NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "icon" VARCHAR(20),
    "detail" VARCHAR(200),
    "price_monthly" DECIMAL(8,2),
    "price_annual" DECIMAL(8,2),
    "price_annual_regular" DECIMAL(8,2),
    "is_addon" BOOLEAN DEFAULT false,
    "is_included" BOOLEAN DEFAULT false,
    "sort_order" INTEGER DEFAULT 0,

    CONSTRAINT "package_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_templates" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "name" VARCHAR(120) NOT NULL DEFAULT 'My Event',
    "sort_order" INTEGER DEFAULT 1,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "package_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packages" (
    "id" SERIAL NOT NULL,
    "key" VARCHAR(50) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "tagline" VARCHAR(200),
    "icon" VARCHAR(20),
    "price_monthly" DECIMAL(8,2),
    "price_annual" DECIMAL(8,2),
    "price_annual_regular" DECIMAL(8,2),
    "trial_days" INTEGER DEFAULT 30,
    "sort_order" INTEGER DEFAULT 0,
    "country_prices" JSONB DEFAULT '{}',
    "storage_gb" INTEGER NOT NULL DEFAULT 50,

    CONSTRAINT "packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "method" VARCHAR(40) DEFAULT 'manual',
    "note" VARCHAR(200),
    "paid_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photo_faces" (
    "cluster_id" INTEGER NOT NULL,
    "photo_id" INTEGER NOT NULL,
    "face_index" INTEGER,

    CONSTRAINT "photo_faces_pkey" PRIMARY KEY ("cluster_id","photo_id")
);

-- CreateTable
CREATE TABLE "photos" (
    "id" SERIAL NOT NULL,
    "ready" BOOLEAN NOT NULL DEFAULT true,
    "album_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "filename" VARCHAR(200),
    "storage_path" VARCHAR(400),
    "thumb_path" VARCHAR(400),
    "is_selected" BOOLEAN DEFAULT false,
    "selected_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "preview_path" VARCHAR(400),
    "faces" JSONB,
    "face_indexed" BOOLEAN DEFAULT false,
    "face_count" INTEGER DEFAULT 0,
    "event_id" INTEGER,
    "face_engine" VARCHAR(20),
    "kind" VARCHAR(10) NOT NULL DEFAULT 'photo',
    "duration_s" INTEGER,
    "size_bytes" BIGINT,

    CONSTRAINT "photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_features" (
    "plan_id" INTEGER NOT NULL,
    "feature_key" VARCHAR(40) NOT NULL,

    CONSTRAINT "plan_features_pkey" PRIMARY KEY ("plan_id","feature_key")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "price_monthly" DECIMAL(8,2) NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "storage_gb" INTEGER,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_settings" (
    "key" VARCHAR(60) NOT NULL,
    "value" TEXT,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "poll_votes" (
    "id" SERIAL NOT NULL,
    "choice" VARCHAR(120) NOT NULL,
    "ip" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "poll_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" SERIAL NOT NULL,
    "referrer_email" VARCHAR(200) NOT NULL,
    "friend_email" VARCHAR(200) NOT NULL,
    "status" VARCHAR(30) DEFAULT 'pending',
    "reward" VARCHAR(60) DEFAULT '1 free month',
    "friend_vendor_id" INTEGER,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "rewarded_at" TIMESTAMP(6),

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "selection_notes" (
    "album_id" INTEGER NOT NULL,
    "note" TEXT,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(6),

    CONSTRAINT "selection_notes_pkey" PRIMARY KEY ("album_id")
);

-- CreateTable
CREATE TABLE "selections" (
    "id" SERIAL NOT NULL,
    "album_id" INTEGER NOT NULL,
    "photo_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "selections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "icon" VARCHAR(20),
    "price" DECIMAL(8,2) NOT NULL,
    "is_addon" BOOLEAN DEFAULT false,
    "requires_service_id" INTEGER,
    "feature_key" VARCHAR(40),
    "price_annual" DECIMAL(8,2),
    "price_annual_regular" DECIMAL(8,2),
    "tiers" JSONB,
    "country_prices" JSONB DEFAULT '{}',
    "is_live" BOOLEAN NOT NULL DEFAULT true,
    "description" VARCHAR(200),
    "is_private" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_messages" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER,
    "from_email" VARCHAR(160),
    "subject" VARCHAR(200),
    "body" TEXT,
    "status" VARCHAR(20) DEFAULT 'open',
    "seen" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trial_signups" (
    "id" SERIAL NOT NULL,
    "ip_address" VARCHAR(64) NOT NULL,
    "email" VARCHAR(200),
    "vendor_id" INTEGER,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trial_signups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "email" VARCHAR(200) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" VARCHAR(50) NOT NULL DEFAULT 'vendor',
    "vendor_id" INTEGER,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "tokens_valid_from" TIMESTAMP(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_feature_overrides" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "feature_key" VARCHAR(40) NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_feature_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_packages" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "name" VARCHAR(120) NOT NULL DEFAULT 'My Package',
    "base_price" DECIMAL(10,2) DEFAULT 0,
    "included_hours" INTEGER DEFAULT 0,
    "per_hour_price" DECIMAL(10,2) DEFAULT 0,
    "inclusions" JSONB DEFAULT '[]',
    "is_default" BOOLEAN DEFAULT false,
    "sort_order" INTEGER DEFAULT 1,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "template_id" INTEGER,

    CONSTRAINT "vendor_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_services" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "service_id" INTEGER NOT NULL,
    "enabled" BOOLEAN DEFAULT true,

    CONSTRAINT "vendor_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_settings" (
    "vendor_id" INTEGER NOT NULL,
    "time_format" VARCHAR(5) DEFAULT '12h',
    "timezone" VARCHAR(80) DEFAULT 'America/Vancouver',
    "theme" VARCHAR(10) DEFAULT 'dark',
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "currency" VARCHAR(3),
    "auto_release_contract" BOOLEAN NOT NULL DEFAULT false,
    "default_deposit_percent" DECIMAL(5,2) NOT NULL DEFAULT 30,
    "storage_limit_mb" INTEGER,

    CONSTRAINT "vendor_settings_pkey" PRIMARY KEY ("vendor_id")
);

-- CreateTable
CREATE TABLE "vendor_subscriptions" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "plan_id" INTEGER NOT NULL,
    "status" VARCHAR(20) DEFAULT 'active',
    "started_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMP(6),

    CONSTRAINT "vendor_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" SERIAL NOT NULL,
    "business_name" VARCHAR(200) NOT NULL,
    "status" VARCHAR(50) DEFAULT 'trial',
    "storage_mb" INTEGER DEFAULT 0,
    "country" VARCHAR(100),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "signup_ip" VARCHAR(60),
    "seen_by_admin" BOOLEAN DEFAULT false,
    "logo_path" VARCHAR(300) DEFAULT '',
    "phone" VARCHAR(60) DEFAULT '',
    "email" VARCHAR(160) DEFAULT '',
    "gallery_token" VARCHAR(40),
    "slug" VARCHAR(80) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "album_faces" (
    "id" SERIAL NOT NULL,
    "album_id" INTEGER NOT NULL,
    "photo_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "rekognition_face_id" VARCHAR(191) NOT NULL,
    "collection_id" VARCHAR(191) NOT NULL,
    "bounding_box" JSONB,
    "confidence" DECIMAL(5,2),
    "occurrence_count" INTEGER NOT NULL DEFAULT 1,
    "matched_face_id" INTEGER,
    "is_processed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "portrait_score" DECIMAL(5,4),

    CONSTRAINT "album_faces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_packages" (
    "id" SERIAL NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "source_package_id" INTEGER,
    "name" VARCHAR(120) NOT NULL,
    "price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "inclusions" JSONB NOT NULL DEFAULT '[]',
    "admin_notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_selected" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_sites" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "theme" VARCHAR(30) NOT NULL DEFAULT 'aperture',
    "accent" VARCHAR(9) NOT NULL DEFAULT '#b8922a',
    "heading_font" VARCHAR(60) NOT NULL DEFAULT 'Playfair Display',
    "body_font" VARCHAR(60) NOT NULL DEFAULT 'Inter',
    "site_title" VARCHAR(120),
    "tagline" VARCHAR(200),
    "about_heading" VARCHAR(120),
    "about_body" TEXT,
    "contact_email" VARCHAR(160),
    "contact_phone" VARCHAR(40),
    "instagram" VARCHAR(200),
    "facebook" VARCHAR(200),
    "sections" JSONB NOT NULL DEFAULT '[]',
    "slug" VARCHAR(60),
    "published" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cover_photo" VARCHAR(300),
    "cover_focus" VARCHAR(20) NOT NULL DEFAULT '50% 50%',
    "portfolio" JSONB NOT NULL DEFAULT '[]',
    "clients" JSONB NOT NULL DEFAULT '[]',
    "testimonials" JSONB NOT NULL DEFAULT '[]',
    "clients_heading" VARCHAR(160),
    "custom_domain" VARCHAR(255),
    "domain_verified_at" TIMESTAMPTZ(6),
    "domain_status" VARCHAR(20) NOT NULL DEFAULT 'none',
    "gallery_heading" VARCHAR(160),
    "gallery_body" TEXT,

    CONSTRAINT "vendor_sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_share_items" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "filename" VARCHAR(300) NOT NULL,
    "stored_name" VARCHAR(300) NOT NULL,
    "size_bytes" BIGINT NOT NULL DEFAULT 0,
    "mime" VARCHAR(150),
    "uploaded_by" VARCHAR(10) NOT NULL DEFAULT 'vendor',
    "uploader_name" VARCHAR(120),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "folder_id" INTEGER,

    CONSTRAINT "file_share_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_shares" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "note" TEXT,
    "password" VARCHAR(120),
    "allow_upload" BOOLEAN NOT NULL DEFAULT true,
    "expires_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "folder_id" INTEGER,

    CONSTRAINT "file_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_folders" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "parent_id" INTEGER,
    "name" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revoked_tokens" (
    "jti" VARCHAR(64) NOT NULL,
    "user_id" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(6) NOT NULL,
    "revoked_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revoked_tokens_pkey" PRIMARY KEY ("jti")
);

-- CreateTable
CREATE TABLE "pending_uploads" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "folder_id" INTEGER,
    "object_key" TEXT NOT NULL,
    "upload_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "mime" VARCHAR(150),
    "part_size" INTEGER NOT NULL,
    "source" VARCHAR(16) NOT NULL DEFAULT 'vendor',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "phone" VARCHAR(60),
    "note" VARCHAR(500),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "share_recipients" (
    "id" SERIAL NOT NULL,
    "share_id" INTEGER NOT NULL,
    "contact_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "sent_at" TIMESTAMP(6),
    "opened_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "share_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_objects" (
    "id" BIGSERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "cls" VARCHAR(16) NOT NULL,
    "object_key" TEXT NOT NULL,
    "bytes" BIGINT NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "storage_objects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_events" (
    "id" BIGSERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "kind" VARCHAR(24) NOT NULL,
    "target_id" INTEGER,
    "label" VARCHAR(200),
    "ip_prefix" VARCHAR(45),
    "country" VARCHAR(2),
    "referrer" VARCHAR(300),
    "ua_kind" VARCHAR(16),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_tokens" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "token_hash" VARCHAR(120) NOT NULL,
    "scope" VARCHAR(32) NOT NULL DEFAULT 'upload',
    "last_used" TIMESTAMP(6),
    "last_ip" VARCHAR(45),
    "revoked_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "occasion_greetings" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "occasion_on" DATE NOT NULL,
    "subject" VARCHAR(300),
    "body" TEXT,
    "sent_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "occasion_greetings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "albums_public_token_key" ON "albums"("public_token");

-- CreateIndex
CREATE INDEX "idx_albums_vendor" ON "albums"("vendor_id");

-- CreateIndex
CREATE INDEX "idx_albums_kind" ON "albums"("vendor_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "chatbot_subscribers_vendor_id_key" ON "chatbot_subscribers"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "chatbot_subscribers_share_token_key" ON "chatbot_subscribers"("share_token");

-- CreateIndex
CREATE INDEX "idx_cbt_created" ON "chatbot_transcripts"("created_at");

-- CreateIndex
CREATE INDEX "idx_cbt_vendor_session" ON "chatbot_transcripts"("vendor_id", "session", "id");

-- CreateIndex
CREATE INDEX "idx_ct_vendor_session" ON "chatbot_transcripts"("vendor_id", "session");

-- CreateIndex
CREATE INDEX "idx_cbusage_vendor" ON "chatbot_usage"("vendor_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_ctaudit" ON "contract_audit"("contract_id");

-- CreateIndex
CREATE INDEX "idx_cttpl_vendor" ON "contract_templates"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "one_default_contract_per_vendor" ON "contract_templates"("vendor_id") WHERE (is_default);

-- CreateIndex
CREATE UNIQUE INDEX "contracts_token_key" ON "contracts"("token");

-- CreateIndex
CREATE INDEX "idx_ct_lead" ON "contracts"("lead_id");

-- CreateIndex
CREATE INDEX "idx_ct_token" ON "contracts"("token");

-- CreateIndex
CREATE INDEX "idx_crew_vendor" ON "crew_members"("vendor_id");

-- CreateIndex
CREATE INDEX "idx_et_vendor" ON "email_templates"("vendor_id");

-- CreateIndex
CREATE INDEX "idx_fc_album" ON "face_clusters"("album_id", "photo_count" DESC);

-- CreateIndex
CREATE INDEX "idx_favorites_album" ON "favorites"("album_id");

-- CreateIndex
CREATE INDEX "idx_favorites_album_email" ON "favorites"("album_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "favorites_album_id_photo_id_email_key" ON "favorites"("album_id", "photo_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_token_key" ON "invoices"("token");

-- CreateIndex
CREATE INDEX "idx_inv_lead" ON "invoices"("lead_id");

-- CreateIndex
CREATE INDEX "idx_inv_vendor" ON "invoices"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "lead_crew_checkin_token_key" ON "lead_crew"("checkin_token");

-- CreateIndex
CREATE INDEX "idx_lc_lead" ON "lead_crew"("lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "leads_client_token_key" ON "leads"("client_token");

-- CreateIndex
CREATE INDEX "idx_leads_vendor" ON "leads"("vendor_id");

-- CreateIndex
CREATE INDEX "idx_leads_vendor_seen" ON "leads"("vendor_id", "seen_at");

-- CreateIndex
CREATE INDEX "idx_leads_pkg_tpl" ON "leads"("package_template_id");

-- CreateIndex
CREATE INDEX "idx_notif_vendor" ON "notifications"("vendor_id", "seen_at");

-- CreateIndex
CREATE UNIQUE INDEX "offers_code_key" ON "offers"("code");

-- CreateIndex
CREATE INDEX "idx_offers_code" ON "offers"("code");

-- CreateIndex
CREATE INDEX "idx_pkg_items_pkg" ON "package_items"("package_id");

-- CreateIndex
CREATE INDEX "idx_ptpl_vendor" ON "package_templates"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "packages_key_key" ON "packages"("key");

-- CreateIndex
CREATE INDEX "idx_prt_token_hash" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "idx_prt_user" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE INDEX "idx_pay_lead" ON "payments"("lead_id");

-- CreateIndex
CREATE INDEX "idx_pay_vendor" ON "payments"("vendor_id");

-- CreateIndex
CREATE INDEX "idx_pf_photo" ON "photo_faces"("photo_id");

-- CreateIndex
CREATE INDEX "idx_photos_album" ON "photos"("album_id");

-- CreateIndex
CREATE INDEX "idx_photos_vendor" ON "photos"("vendor_id");

-- CreateIndex
CREATE INDEX "idx_photos_kind" ON "photos"("album_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

-- CreateIndex
CREATE UNIQUE INDEX "poll_votes_ip_key" ON "poll_votes"("ip");

-- CreateIndex
CREATE INDEX "idx_ref_friend" ON "referrals"("friend_email");

-- CreateIndex
CREATE INDEX "idx_ref_referrer" ON "referrals"("referrer_email");

-- CreateIndex
CREATE INDEX "idx_selections_album" ON "selections"("album_id");

-- CreateIndex
CREATE UNIQUE INDEX "selections_album_id_photo_id_key" ON "selections"("album_id", "photo_id");

-- CreateIndex
CREATE UNIQUE INDEX "services_feature_key_key" ON "services"("feature_key");

-- CreateIndex
CREATE INDEX "idx_trial_ip" ON "trial_signups"("ip_address");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_users_vendor" ON "users"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_feature_overrides_vendor_id_feature_key_key" ON "vendor_feature_overrides"("vendor_id", "feature_key");

-- CreateIndex
CREATE INDEX "idx_vpkg_vendor" ON "vendor_packages"("vendor_id");

-- CreateIndex
CREATE INDEX "idx_vendor_services_vendor" ON "vendor_services"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_services_vendor_id_service_id_key" ON "vendor_services"("vendor_id", "service_id");

-- CreateIndex
CREATE INDEX "idx_vsub_vendor" ON "vendor_subscriptions"("vendor_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_gallery_token_key" ON "vendors"("gallery_token");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_slug_key" ON "vendors"("slug");

-- CreateIndex
CREATE INDEX "idx_album_faces_album" ON "album_faces"("album_id");

-- CreateIndex
CREATE INDEX "idx_album_faces_matched" ON "album_faces"("matched_face_id");

-- CreateIndex
CREATE INDEX "idx_album_faces_photo" ON "album_faces"("photo_id");

-- CreateIndex
CREATE INDEX "idx_album_faces_vendor" ON "album_faces"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "album_faces_album_id_rekognition_face_id_key" ON "album_faces"("album_id", "rekognition_face_id");

-- CreateIndex
CREATE INDEX "idx_lead_pkg_lead" ON "lead_packages"("lead_id", "sort_order");

-- CreateIndex
CREATE INDEX "idx_lead_pkg_vendor" ON "lead_packages"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_sites_vendor_id_key" ON "vendor_sites"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_sites_slug_key" ON "vendor_sites"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_sites_custom_domain_key" ON "vendor_sites"("custom_domain") WHERE (custom_domain IS NOT NULL);

-- CreateIndex
CREATE INDEX "idx_vendor_sites_slug" ON "vendor_sites"("slug") WHERE (slug IS NOT NULL);

-- CreateIndex
CREATE INDEX "idx_file_items_vendor" ON "file_share_items"("vendor_id");

-- CreateIndex
CREATE INDEX "idx_file_items_folder" ON "file_share_items"("folder_id");

-- CreateIndex
CREATE UNIQUE INDEX "file_shares_token_key" ON "file_shares"("token");

-- CreateIndex
CREATE INDEX "idx_file_shares_token" ON "file_shares"("token");

-- CreateIndex
CREATE INDEX "idx_file_shares_vendor" ON "file_shares"("vendor_id");

-- CreateIndex
CREATE INDEX "idx_file_shares_folder" ON "file_shares"("folder_id");

-- CreateIndex
CREATE INDEX "idx_file_folders_parent" ON "file_folders"("parent_id");

-- CreateIndex
CREATE INDEX "idx_file_folders_vendor" ON "file_folders"("vendor_id");

-- CreateIndex
CREATE INDEX "idx_revoked_expires" ON "revoked_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "idx_revoked_user" ON "revoked_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_pending_key" ON "pending_uploads"("object_key");

-- CreateIndex
CREATE INDEX "idx_pending_vendor" ON "pending_uploads"("vendor_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_contacts_vendor" ON "contacts"("vendor_id", "name");

-- CreateIndex
CREATE INDEX "idx_recipient_contact" ON "share_recipients"("contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_share_recipient" ON "share_recipients"("share_id", "contact_id");

-- CreateIndex
CREATE INDEX "idx_storage_vendor" ON "storage_objects"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_storage_key" ON "storage_objects"("cls", "object_key");

-- CreateIndex
CREATE INDEX "idx_events_kind" ON "site_events"("vendor_id", "kind", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_events_vendor" ON "site_events"("vendor_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "idx_device_hash" ON "device_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "idx_device_vendor" ON "device_tokens"("vendor_id");

-- CreateIndex
CREATE INDEX "idx_occ_vendor" ON "occasion_greetings"("vendor_id", "sent_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "idx_occ_once" ON "occasion_greetings"("lead_id", "kind", "occasion_on");

-- AddForeignKey
ALTER TABLE "album_events" ADD CONSTRAINT "album_events_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "albums"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "chatbot_knowledge" ADD CONSTRAINT "chatbot_knowledge_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "chatbot_messages" ADD CONSTRAINT "chatbot_messages_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "chatbot_pending" ADD CONSTRAINT "chatbot_pending_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "chatbot_subscribers" ADD CONSTRAINT "chatbot_subscribers_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "chatbot_transcripts" ADD CONSTRAINT "chatbot_transcripts_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "chatbot_usage" ADD CONSTRAINT "chatbot_usage_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contract_audit" ADD CONSTRAINT "contract_audit_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contract_templates" ADD CONSTRAINT "contract_templates_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "crew_members" ADD CONSTRAINT "crew_members_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "email_settings" ADD CONSTRAINT "email_settings_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "face_clusters" ADD CONSTRAINT "face_clusters_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "albums"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "albums"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "photos"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inquiry_settings" ADD CONSTRAINT "inquiry_settings_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "lead_crew" ADD CONSTRAINT "lead_crew_crew_member_id_fkey" FOREIGN KEY ("crew_member_id") REFERENCES "crew_members"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "lead_crew" ADD CONSTRAINT "lead_crew_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "vendor_packages"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_package_template_id_fkey" FOREIGN KEY ("package_template_id") REFERENCES "package_templates"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "package_items" ADD CONSTRAINT "package_items_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "package_templates" ADD CONSTRAINT "package_templates_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "photo_faces" ADD CONSTRAINT "photo_faces_cluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "face_clusters"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "photo_faces" ADD CONSTRAINT "photo_faces_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "photos"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "albums"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "album_events"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "plan_features" ADD CONSTRAINT "plan_features_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_friend_vendor_id_fkey" FOREIGN KEY ("friend_vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "selection_notes" ADD CONSTRAINT "selection_notes_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "albums"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "selections" ADD CONSTRAINT "selections_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "albums"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "selections" ADD CONSTRAINT "selections_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "photos"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_requires_service_id_fkey" FOREIGN KEY ("requires_service_id") REFERENCES "services"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "trial_signups" ADD CONSTRAINT "trial_signups_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vendor_feature_overrides" ADD CONSTRAINT "vendor_feature_overrides_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vendor_packages" ADD CONSTRAINT "vendor_packages_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "package_templates"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vendor_packages" ADD CONSTRAINT "vendor_packages_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vendor_services" ADD CONSTRAINT "vendor_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vendor_services" ADD CONSTRAINT "vendor_services_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vendor_settings" ADD CONSTRAINT "vendor_settings_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vendor_subscriptions" ADD CONSTRAINT "vendor_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vendor_subscriptions" ADD CONSTRAINT "vendor_subscriptions_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "album_faces" ADD CONSTRAINT "album_faces_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "albums"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "album_faces" ADD CONSTRAINT "album_faces_matched_face_id_fkey" FOREIGN KEY ("matched_face_id") REFERENCES "album_faces"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "album_faces" ADD CONSTRAINT "album_faces_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "photos"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "lead_packages" ADD CONSTRAINT "lead_packages_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vendor_sites" ADD CONSTRAINT "vendor_sites_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "file_share_items" ADD CONSTRAINT "file_share_items_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "file_folders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "file_share_items" ADD CONSTRAINT "file_share_items_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "file_shares" ADD CONSTRAINT "file_shares_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "file_folders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "file_shares" ADD CONSTRAINT "file_shares_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "file_folders" ADD CONSTRAINT "file_folders_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "file_folders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "file_folders" ADD CONSTRAINT "file_folders_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "revoked_tokens" ADD CONSTRAINT "revoked_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "pending_uploads" ADD CONSTRAINT "pending_uploads_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "file_folders"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "pending_uploads" ADD CONSTRAINT "pending_uploads_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "share_recipients" ADD CONSTRAINT "share_recipients_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "share_recipients" ADD CONSTRAINT "share_recipients_share_id_fkey" FOREIGN KEY ("share_id") REFERENCES "file_shares"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "share_recipients" ADD CONSTRAINT "share_recipients_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "site_events" ADD CONSTRAINT "site_events_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "occasion_greetings" ADD CONSTRAINT "occasion_greetings_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "occasion_greetings" ADD CONSTRAINT "occasion_greetings_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

