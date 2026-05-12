-- ============================================================================
-- GÜNLÜKİŞ - Günlük İş / Staj / Çıraklık Platformu
-- MySQL Veritabanı Şeması
-- Karakter Seti: utf8mb4 (Türkçe ve emoji desteği için)
-- ============================================================================

DROP DATABASE IF EXISTS gunlukis;
CREATE DATABASE gunlukis CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE gunlukis;

SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================================
-- 1) KULLANICILAR (users)
-- Hem iş arayan hem iş veren (işveren) aynı tabloda; rol ile ayrılır.
-- ============================================================================
CREATE TABLE users (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    full_name       VARCHAR(150)    NOT NULL,                  -- Ad Soyad (örn: Emre Yılmaz)
    email           VARCHAR(190)    NOT NULL UNIQUE,           -- emre.yilmaz@email.com
    phone           VARCHAR(20)     DEFAULT NULL,              -- +90 (555) 123 45 67
    password_hash   VARCHAR(255)    NOT NULL,                  -- bcrypt/argon2 hash
    role            ENUM('worker','employer','admin') NOT NULL DEFAULT 'worker',
    title           VARCHAR(150)    DEFAULT NULL,              -- Meslek/Ünvan: "Deneyimli Host & Satış Danışmanı"
    bio             TEXT            DEFAULT NULL,              -- "Hakkımda" metni
    avatar_url      VARCHAR(500)    DEFAULT NULL,              -- profil fotoğrafı
    city            VARCHAR(80)     DEFAULT NULL,              -- İstanbul
    district        VARCHAR(80)     DEFAULT NULL,              -- Kadıköy
    birth_date      DATE            DEFAULT NULL,
    gender          ENUM('male','female','other') DEFAULT NULL,
    is_verified     TINYINT(1)      NOT NULL DEFAULT 0,        -- "Onaylı Üye" rozeti
    is_online       TINYINT(1)      NOT NULL DEFAULT 0,
    last_seen_at    DATETIME        DEFAULT NULL,
    rating_avg      DECIMAL(3,2)    NOT NULL DEFAULT 0.00,     -- 4.90
    rating_count    INT UNSIGNED    NOT NULL DEFAULT 0,        -- 24 işlem
    total_earnings  DECIMAL(12,2)   NOT NULL DEFAULT 0.00,     -- 28.500 ₺ Toplam Kazanç
    pending_balance DECIMAL(12,2)   NOT NULL DEFAULT 0.00,     -- 4.200 ₺ Bekleyen Yatar
    profile_score   INT UNSIGNED    NOT NULL DEFAULT 0,        -- "+20 Profil Puanı" gibi
    status          ENUM('active','suspended','deleted') NOT NULL DEFAULT 'active',
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_role (role),
    INDEX idx_city (city),
    INDEX idx_status (status)
) ENGINE=InnoDB;

-- ============================================================================
-- 2) İŞVEREN PROFİLİ (employers)
-- Kurumsal işveren bilgileri (Hilton, Trendyol, Getir, vb.)
-- Bireysel işveren ise (Ahmet Yılmaz) sadece users yeterli; bu tablo opsiyoneldir.
-- ============================================================================
CREATE TABLE employers (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id         INT UNSIGNED    NOT NULL,
    company_name    VARCHAR(200)    NOT NULL,                  -- "Hilton Otelleri", "Trendyol Express"
    logo_url        VARCHAR(500)    DEFAULT NULL,
    industry        VARCHAR(120)    DEFAULT NULL,              -- "Otelcilik", "Lojistik"
    website         VARCHAR(255)    DEFAULT NULL,
    tax_number      VARCHAR(30)     DEFAULT NULL,              -- vergi no
    about           TEXT            DEFAULT NULL,
    is_corporate    TINYINT(1)      NOT NULL DEFAULT 1,        -- 0 ise bireysel işveren
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_employer_user (user_id),
    CONSTRAINT fk_employers_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================================
-- 3) YETENEKLER & KULLANICI YETENEKLERİ (skills, user_skills)
-- Profil sayfasındaki "Diksiyon, İngilizce B2, Takım Çalışması, Kasa/POS" rozetleri.
-- ============================================================================
CREATE TABLE skills (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(100)    NOT NULL UNIQUE,               -- "Diksiyon", "İngilizce B2"
    slug        VARCHAR(120)    NOT NULL UNIQUE,
    created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE user_skills (
    user_id     INT UNSIGNED NOT NULL,
    skill_id    INT UNSIGNED NOT NULL,
    level       ENUM('beginner','intermediate','advanced','expert') DEFAULT 'intermediate',
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, skill_id),
    CONSTRAINT fk_uskill_user  FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE,
    CONSTRAINT fk_uskill_skill FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================================
-- 4) İŞ KATEGORİLERİ (categories)
-- "Bahçe & Temizlik", "Nakliye & Eşya Taşıma", "Ufak Tamirat İşleri", vb.
-- ============================================================================
CREATE TABLE categories (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(100)    NOT NULL UNIQUE,
    slug        VARCHAR(120)    NOT NULL UNIQUE,
    icon        VARCHAR(60)     DEFAULT NULL,                  -- "fa-solid fa-mug-hot" gibi
    parent_id   INT UNSIGNED    DEFAULT NULL,
    sort_order  INT             NOT NULL DEFAULT 0,
    is_active   TINYINT(1)      NOT NULL DEFAULT 1,
    CONSTRAINT fk_cat_parent FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ============================================================================
-- 5) KULLANICI İŞ TERCİHLERİ (user_preferences)
-- Profilde "Tercih Edilen İş Alanları" bölümü (kategori + çalışma tipi)
-- ============================================================================
CREATE TABLE user_preferences (
    id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id        INT UNSIGNED NOT NULL,
    category_id    INT UNSIGNED NOT NULL,
    work_type      ENUM('full_time','part_time','remote','weekend_only','flexible') NOT NULL DEFAULT 'flexible',
    note           VARCHAR(255) DEFAULT NULL,                  -- "Tam & Yarı Zamanlı", "Sadece Hafta Sonu"
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_user_cat_type (user_id, category_id, work_type),
    CONSTRAINT fk_pref_user FOREIGN KEY (user_id)     REFERENCES users(id)      ON DELETE CASCADE,
    CONSTRAINT fk_pref_cat  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================================
-- 6) İŞ İLANLARI (jobs)
-- is-detay.html ve is-ver.html'deki ilan modeli.
-- ============================================================================
CREATE TABLE jobs (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    employer_id     INT UNSIGNED    NOT NULL,                  -- users.id (ilanı veren kullanıcı)
    category_id     INT UNSIGNED    NOT NULL,
    title           VARCHAR(200)    NOT NULL,                  -- "Bahçe Düzenleme ve Çim Biçme"
    description     TEXT            NOT NULL,                  -- İşin detayları
    requirements    TEXT            DEFAULT NULL,              -- "İstenen Nitelikler"
    job_type        ENUM('daily','internship','apprenticeship') NOT NULL DEFAULT 'daily',
    work_type       ENUM('full_time','part_time','remote') NOT NULL DEFAULT 'full_time',
    budget          DECIMAL(10,2)   NOT NULL,                  -- 1.200 ₺ Toplam Bütçe
    currency        CHAR(3)         NOT NULL DEFAULT 'TRY',
    work_date       DATE            NOT NULL,                  -- 28 Mayıs 2026
    start_time      TIME            DEFAULT NULL,              -- 10:00
    duration_hours  DECIMAL(4,1)    DEFAULT NULL,              -- Tahmini 3 saat
    city            VARCHAR(80)     NOT NULL,                  -- İstanbul
    district        VARCHAR(80)     DEFAULT NULL,              -- Kadıköy
    address_text    VARCHAR(300)    DEFAULT NULL,              -- "Kadıköy Moda, arka bahçe"
    latitude        DECIMAL(10,7)   DEFAULT NULL,              -- Harita için
    longitude       DECIMAL(10,7)   DEFAULT NULL,
    materials_included TINYINT(1)   NOT NULL DEFAULT 0,        -- "Malzemeli" etiketi
    status          ENUM('draft','published','in_progress','completed','cancelled','closed')
                    NOT NULL DEFAULT 'published',
    view_count      INT UNSIGNED    NOT NULL DEFAULT 0,
    applicant_count INT UNSIGNED    NOT NULL DEFAULT 0,
    published_at    DATETIME        DEFAULT NULL,
    closed_at       DATETIME        DEFAULT NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status_date (status, work_date),
    INDEX idx_city (city),
    INDEX idx_category (category_id),
    INDEX idx_employer (employer_id),
    CONSTRAINT fk_jobs_employer FOREIGN KEY (employer_id) REFERENCES users(id)      ON DELETE CASCADE,
    CONSTRAINT fk_jobs_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ============================================================================
-- 7) İŞ ETİKETLERİ (job_tags)
-- "Bahçe & Temizlik", "Günlük İş", "Malzemeli" gibi rozet/etiketler.
-- ============================================================================
CREATE TABLE tags (
    id      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name    VARCHAR(80) NOT NULL UNIQUE,
    slug    VARCHAR(100) NOT NULL UNIQUE,
    color   VARCHAR(20)  DEFAULT NULL                          -- 'emerald','blue','amber'
) ENGINE=InnoDB;

CREATE TABLE job_tags (
    job_id  INT UNSIGNED NOT NULL,
    tag_id  INT UNSIGNED NOT NULL,
    PRIMARY KEY (job_id, tag_id),
    CONSTRAINT fk_jt_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    CONSTRAINT fk_jt_tag FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================================
-- 8) BAŞVURULAR (applications)
-- Bir iş arayanın bir ilana başvurusu.
-- ============================================================================
CREATE TABLE applications (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    job_id          INT UNSIGNED NOT NULL,
    worker_id       INT UNSIGNED NOT NULL,                     -- users.id (başvuran)
    cover_message   TEXT         DEFAULT NULL,
    status          ENUM('pending','accepted','rejected','withdrawn','completed') NOT NULL DEFAULT 'pending',
    payment_status  ENUM('not_paid','pending','paid','refunded') NOT NULL DEFAULT 'not_paid',
    applied_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    responded_at    DATETIME DEFAULT NULL,
    completed_at    DATETIME DEFAULT NULL,
    UNIQUE KEY uq_job_worker (job_id, worker_id),
    INDEX idx_worker_status (worker_id, status),
    INDEX idx_job_status (job_id, status),
    CONSTRAINT fk_app_job    FOREIGN KEY (job_id)    REFERENCES jobs(id)  ON DELETE CASCADE,
    CONSTRAINT fk_app_worker FOREIGN KEY (worker_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================================
-- 9) İŞ GEÇMİŞİ (work_history)
-- Profildeki "İş Geçmişim" bölümü - tamamlanmış işler.
-- ============================================================================
CREATE TABLE work_history (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id         INT UNSIGNED NOT NULL,                     -- çalışan kişi
    job_id          INT UNSIGNED DEFAULT NULL,                 -- platform içi iş (NULL ise manuel/dışarıdan)
    application_id  INT UNSIGNED DEFAULT NULL,
    company_name    VARCHAR(200) NOT NULL,                     -- "Hilton Otelleri"
    position_title  VARCHAR(200) NOT NULL,                     -- "VIP Karşılama Hostesi"
    description     TEXT DEFAULT NULL,
    start_date      DATE NOT NULL,                             -- 12 Nisan 2026
    end_date        DATE DEFAULT NULL,                         -- 15 Nisan 2026
    earnings        DECIMAL(10,2) DEFAULT NULL,
    employer_rating DECIMAL(3,2)  DEFAULT NULL,                -- "5.0 İşveren Puanı"
    is_paid         TINYINT(1) NOT NULL DEFAULT 0,             -- "Ödeme Alındı"
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_date (user_id, start_date),
    CONSTRAINT fk_wh_user FOREIGN KEY (user_id)        REFERENCES users(id)        ON DELETE CASCADE,
    CONSTRAINT fk_wh_job  FOREIGN KEY (job_id)         REFERENCES jobs(id)         ON DELETE SET NULL,
    CONSTRAINT fk_wh_app  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ============================================================================
-- 10) DEĞERLENDİRMELER (reviews)
-- Profildeki "Değerlendirmeler" sekmesi - işverenin çalışana yorumu.
-- ============================================================================
CREATE TABLE reviews (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    job_id          INT UNSIGNED NOT NULL,
    application_id  INT UNSIGNED DEFAULT NULL,
    reviewer_id     INT UNSIGNED NOT NULL,                     -- yorum yapan (genelde işveren)
    reviewee_id     INT UNSIGNED NOT NULL,                     -- yorum yapılan
    rating          DECIMAL(2,1) NOT NULL,                     -- 4.5 / 5.0
    comment         TEXT DEFAULT NULL,
    review_type     ENUM('employer_to_worker','worker_to_employer') NOT NULL DEFAULT 'employer_to_worker',
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_reviewee (reviewee_id),
    INDEX idx_job (job_id),
    CONSTRAINT chk_rating CHECK (rating >= 0 AND rating <= 5),
    CONSTRAINT fk_rev_job      FOREIGN KEY (job_id)         REFERENCES jobs(id)         ON DELETE CASCADE,
    CONSTRAINT fk_rev_app      FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE SET NULL,
    CONSTRAINT fk_rev_reviewer FOREIGN KEY (reviewer_id)    REFERENCES users(id)        ON DELETE CASCADE,
    CONSTRAINT fk_rev_reviewee FOREIGN KEY (reviewee_id)    REFERENCES users(id)        ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================================
-- 11) KAYDEDİLEN İLANLAR (bookmarks)
-- Bookmark/favori (yer imi) butonu.
-- ============================================================================
CREATE TABLE bookmarks (
    user_id    INT UNSIGNED NOT NULL,
    job_id     INT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, job_id),
    CONSTRAINT fk_bm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_bm_job  FOREIGN KEY (job_id)  REFERENCES jobs(id)  ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================================
-- 12) MESAJLAŞMA (conversations, messages)
-- mesaj.html sayfasındaki sohbet listesi ve mesajlar.
-- ============================================================================
CREATE TABLE conversations (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user1_id        INT UNSIGNED NOT NULL,
    user2_id        INT UNSIGNED NOT NULL,
    job_id          INT UNSIGNED DEFAULT NULL,                 -- hangi iş üzerinden başlamış
    last_message_at DATETIME DEFAULT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_conv_users (user1_id, user2_id, job_id),
    INDEX idx_user1 (user1_id),
    INDEX idx_user2 (user2_id),
    CONSTRAINT fk_conv_u1  FOREIGN KEY (user1_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_conv_u2  FOREIGN KEY (user2_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_conv_job FOREIGN KEY (job_id)   REFERENCES jobs(id)  ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE messages (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    conversation_id INT UNSIGNED NOT NULL,
    sender_id       INT UNSIGNED NOT NULL,
    content         TEXT NOT NULL,
    attachment_url  VARCHAR(500) DEFAULT NULL,
    is_read         TINYINT(1) NOT NULL DEFAULT 0,
    read_at         DATETIME DEFAULT NULL,
    sent_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_conv_sent (conversation_id, sent_at),
    CONSTRAINT fk_msg_conv   FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    CONSTRAINT fk_msg_sender FOREIGN KEY (sender_id)       REFERENCES users(id)         ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================================
-- 13) TAKVİM OLAYLARI (calendar_events)
-- takvim.html - takvime manuel eklenen ya da iş kabulüyle otomatik düşen olaylar.
-- ============================================================================
CREATE TABLE calendar_events (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     INT UNSIGNED NOT NULL,
    job_id      INT UNSIGNED DEFAULT NULL,                     -- iş tabanlıysa
    title       VARCHAR(200) NOT NULL,                         -- "Sınavım var çalışamayacağım" veya iş başlığı
    note        TEXT DEFAULT NULL,
    event_date  DATE NOT NULL,
    start_time  TIME DEFAULT NULL,
    end_time    TIME DEFAULT NULL,
    color       ENUM('slate','emerald','rose','amber','blue') NOT NULL DEFAULT 'slate',
    source      ENUM('manual','job','system') NOT NULL DEFAULT 'manual',
    is_blocked  TINYINT(1) NOT NULL DEFAULT 0,                 -- 1 ise o gün başkalarına müsait değil
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_date (user_id, event_date),
    CONSTRAINT fk_cal_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_cal_job  FOREIGN KEY (job_id)  REFERENCES jobs(id)  ON DELETE SET NULL
) ENGINE=InnoDB;

-- ============================================================================
-- 14) ANKETLER (surveys, survey_questions, survey_options, survey_responses)
-- anket.html - firmaların yayınladığı anketler ve cevaplar.
-- ============================================================================
CREATE TABLE surveys (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    employer_id     INT UNSIGNED NOT NULL,                     -- anketi yayınlayan firma (users.id)
    title           VARCHAR(200) NOT NULL,                     -- "Esnek Çalışma Şartları Anketi"
    subtitle        VARCHAR(200) DEFAULT NULL,                 -- "Pazar Araştırması"
    description     TEXT DEFAULT NULL,
    estimated_minutes TINYINT UNSIGNED DEFAULT NULL,           -- ~3 dk
    reward_type     ENUM('balance','points','none') NOT NULL DEFAULT 'none',
    reward_amount   DECIMAL(10,2) DEFAULT NULL,                -- 50.00 (₺) ya da 20 (puan)
    status          ENUM('draft','active','closed') NOT NULL DEFAULT 'active',
    starts_at       DATETIME DEFAULT NULL,
    ends_at         DATETIME DEFAULT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    CONSTRAINT fk_sur_employer FOREIGN KEY (employer_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE survey_questions (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    survey_id    INT UNSIGNED NOT NULL,
    question_text VARCHAR(500) NOT NULL,
    question_type ENUM('single_choice','multi_choice','rating','text') NOT NULL DEFAULT 'single_choice',
    is_required  TINYINT(1) NOT NULL DEFAULT 1,
    sort_order   INT NOT NULL DEFAULT 0,
    INDEX idx_survey (survey_id),
    CONSTRAINT fk_sq_survey FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE survey_options (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    question_id  INT UNSIGNED NOT NULL,
    option_text  VARCHAR(255) NOT NULL,
    sort_order   INT NOT NULL DEFAULT 0,
    CONSTRAINT fk_so_question FOREIGN KEY (question_id) REFERENCES survey_questions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE survey_responses (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    survey_id    INT UNSIGNED NOT NULL,
    user_id      INT UNSIGNED NOT NULL,
    submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reward_granted TINYINT(1) NOT NULL DEFAULT 0,
    UNIQUE KEY uq_survey_user (survey_id, user_id),
    CONSTRAINT fk_sr_survey FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
    CONSTRAINT fk_sr_user   FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE survey_answers (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    response_id  INT UNSIGNED NOT NULL,
    question_id  INT UNSIGNED NOT NULL,
    option_id    INT UNSIGNED DEFAULT NULL,                    -- şıklı sorularda
    text_answer  TEXT DEFAULT NULL,                            -- açık uçlu/yorum sorularında
    rating_value TINYINT UNSIGNED DEFAULT NULL,                -- 1-5 puanlı sorularda
    INDEX idx_response (response_id),
    CONSTRAINT fk_sa_response FOREIGN KEY (response_id) REFERENCES survey_responses(id) ON DELETE CASCADE,
    CONSTRAINT fk_sa_question FOREIGN KEY (question_id) REFERENCES survey_questions(id) ON DELETE CASCADE,
    CONSTRAINT fk_sa_option   FOREIGN KEY (option_id)   REFERENCES survey_options(id)   ON DELETE SET NULL
) ENGINE=InnoDB;

-- ============================================================================
-- 15) ÖDEMELER (payments)
-- "Toplam Kazanç", "Bekleyen Yatar", "Ödeme Alındı" durumları için.
-- ============================================================================
CREATE TABLE payments (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    job_id          INT UNSIGNED NOT NULL,
    application_id  INT UNSIGNED DEFAULT NULL,
    payer_id        INT UNSIGNED NOT NULL,                     -- işveren
    payee_id        INT UNSIGNED NOT NULL,                     -- çalışan
    gross_amount    DECIMAL(10,2) NOT NULL,                    -- brüt
    commission      DECIMAL(10,2) NOT NULL DEFAULT 0.00,       -- platform kesintisi
    net_amount      DECIMAL(10,2) NOT NULL,                    -- net (gross - commission)
    currency        CHAR(3) NOT NULL DEFAULT 'TRY',
    method          ENUM('credit_card','bank_transfer','wallet') DEFAULT 'credit_card',
    status          ENUM('pending','held','released','refunded','failed') NOT NULL DEFAULT 'pending',
    paid_at         DATETIME DEFAULT NULL,                     -- işverenden tahsil edildi
    released_at     DATETIME DEFAULT NULL,                     -- çalışana yatırıldı
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_payee_status (payee_id, status),
    INDEX idx_payer (payer_id),
    CONSTRAINT fk_pay_job   FOREIGN KEY (job_id)         REFERENCES jobs(id)         ON DELETE CASCADE,
    CONSTRAINT fk_pay_app   FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE SET NULL,
    CONSTRAINT fk_pay_payer FOREIGN KEY (payer_id)       REFERENCES users(id)        ON DELETE CASCADE,
    CONSTRAINT fk_pay_payee FOREIGN KEY (payee_id)       REFERENCES users(id)        ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================================
-- 16) BİLDİRİMLER (notifications)
-- Header'daki çan ikonu (kırmızı nokta) için.
-- ============================================================================
CREATE TABLE notifications (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     INT UNSIGNED NOT NULL,
    type        ENUM('application','message','payment','review','survey','system') NOT NULL,
    title       VARCHAR(200) NOT NULL,
    body        TEXT DEFAULT NULL,
    link_url    VARCHAR(500) DEFAULT NULL,
    is_read     TINYINT(1) NOT NULL DEFAULT 0,
    read_at     DATETIME DEFAULT NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_read (user_id, is_read),
    CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- ÖRNEK VERİLER (Test/Demo)
-- ============================================================================

-- Kategoriler
INSERT INTO categories (name, slug, icon, sort_order) VALUES
('Nakliye & Eşya Taşıma', 'nakliye',  'fa-solid fa-truck',        1),
('Ev & Ofis Temizliği',   'temizlik', 'fa-solid fa-broom',        2),
('Bahçe Bakımı & Düzenleme','bahce',  'fa-solid fa-leaf',         3),
('Ufak Tamirat İşleri',   'tamirat',  'fa-solid fa-screwdriver-wrench', 4),
('Evcil Hayvan Bakım',    'hayvan',   'fa-solid fa-paw',          5),
('Etkinlik & Hostlük',    'etkinlik', 'fa-solid fa-microphone',   6),
('Servis & Barista',      'servis',   'fa-solid fa-mug-hot',      7),
('Depo & Lojistik',       'depo',     'fa-solid fa-box',          8),
('Diğer İşler',           'diger',    'fa-solid fa-ellipsis',     9);

-- Yetenekler
INSERT INTO skills (name, slug) VALUES
('Diksiyon', 'diksiyon'),
('İngilizce B2', 'ingilizce-b2'),
('Takım Çalışması', 'takim-calismasi'),
('Kasa / POS', 'kasa-pos'),
('Bahçıvanlık', 'bahcivanlik'),
('Sürücü Belgesi', 'surucu-belgesi');

-- Etiketler
INSERT INTO tags (name, slug, color) VALUES
('Günlük İş',         'gunluk-is',  'blue'),
('Bahçe & Temizlik',  'bahce-temizlik', 'emerald'),
('Malzemeli',         'malzemeli',  'amber'),
('Acil',              'acil',       'rose'),
('Hafta Sonu',        'hafta-sonu', 'blue');

-- Kullanıcılar (1=çalışan, 2-4=işveren)
INSERT INTO users (full_name, email, phone, password_hash, role, title, bio, avatar_url, city, district, is_verified, rating_avg, rating_count, total_earnings, pending_balance) VALUES
('Emre Yılmaz',     'emre.yilmaz@email.com',    '+905551234567', '$2y$10$hash', 'worker',
 'Deneyimli Host & Satış Danışmanı',
 'Marmara Üniversitesi İletişim Fakültesi 3. sınıf öğrencisiyim. İletişim becerilerim güçlüdür.',
 'https://i.pravatar.cc/150?img=32', 'İstanbul', 'Kadıköy', 1, 4.90, 24, 28500.00, 4200.00),
('Ahmet Yılmaz',    'ahmet.y@email.com',        '+905557654321', '$2y$10$hash', 'employer',
 'Bireysel İşveren', 'Kadıköy Moda sakini.', 'https://i.pravatar.cc/150?img=11', 'İstanbul', 'Kadıköy', 1, 4.90, 24, 0, 0),
('Hilton İK',       'ik@hilton-tr.com',         '+902121234567', '$2y$10$hash', 'employer',
 'İK Departmanı', 'Hilton Otelleri Türkiye.', 'https://i.pravatar.cc/150?img=47', 'İstanbul', 'Beşiktaş', 1, 0, 0, 0, 0),
('Trendyol Depo',   'depo@trendyol.com',        '+902129876543', '$2y$10$hash', 'employer',
 'Operasyon Müdürü', 'Trendyol Express Lojistik.', 'https://i.pravatar.cc/150?img=5', 'İstanbul', 'Esenyurt', 1, 0, 0, 0, 0);

-- İşveren detayları (kurumsal)
INSERT INTO employers (user_id, company_name, industry, is_corporate) VALUES
(3, 'Hilton Otelleri',     'Otelcilik', 1),
(4, 'Trendyol Express',    'Lojistik',  1);

-- Emre'nin yetenekleri
INSERT INTO user_skills (user_id, skill_id, level) VALUES
(1, 1, 'advanced'),
(1, 2, 'intermediate'),
(1, 3, 'advanced'),
(1, 4, 'intermediate');

-- Emre'nin iş tercihleri
INSERT INTO user_preferences (user_id, category_id, work_type, note) VALUES
(1, 6, 'part_time',     'Tam & Yarı Zamanlı'),
(1, 7, 'weekend_only',  'Sadece Hafta Sonu');

-- İş ilanları
INSERT INTO jobs (employer_id, category_id, title, description, requirements, job_type, work_type, budget, work_date, start_time, duration_hours, city, district, materials_included, status, published_at) VALUES
(2, 3,
 'Bahçe Düzenleme ve Çim Biçme',
 'Kadıköy Moda''daki evimin arka bahçesinde uzayan çimlerin biçilmesi, dökülen yaprakların temizlenmesi ve genel bir düzenleme yapılması gerekiyor. Bahçe yaklaşık 80 metrekare büyüklüğündedir.',
 'Daha önce benzer bahçe işlerinde tecrübe; belirtilen gün ve saatte kesin katılım; fiziksel uygunluk.',
 'daily', 'full_time', 1200.00, '2026-05-28', '10:00:00', 3.0, 'İstanbul', 'Kadıköy', 1, 'published', NOW()),
(3, 6,
 'VIP Karşılama Hostesi',
 'Uluslararası Teknoloji Zirvesi kapsamında yabancı misafirlerin karşılanması, yaka kartı dağıtımı ve salon yönlendirmeleri.',
 'İyi diksiyon, İngilizce iletişim, prezentabl görünüm.',
 'daily', 'full_time', 1800.00, '2026-05-24', '09:00:00', 8.0, 'İstanbul', 'Beşiktaş', 0, 'published', NOW()),
(4, 8,
 'Depo Sayım Elemanı (Gece Vardiyası)',
 'Gece vardiyasında RF el terminali ile iade ürünlerin barkod okutması ve stok sayım işlemlerinin gerçekleştirilmesi.',
 'Gece çalışmaya uygun, dikkatli, hızlı.',
 'daily', 'full_time', 950.00, '2026-03-01', '22:00:00', 8.0, 'İstanbul', 'Esenyurt', 0, 'completed', '2026-02-25 10:00:00');

-- İş etiketleri
INSERT INTO job_tags (job_id, tag_id) VALUES
(1, 1), (1, 2), (1, 3),
(2, 1),
(3, 1);

-- İş geçmişi (Emre'nin tamamladığı işler)
INSERT INTO work_history (user_id, company_name, position_title, description, start_date, end_date, earnings, employer_rating, is_paid) VALUES
(1, 'Hilton Otelleri', 'VIP Karşılama Hostesi',
 'Uluslararası Teknoloji Zirvesi kapsamında yabancı misafirlerin karşılanması.',
 '2026-04-12', '2026-04-15', 1800.00, 5.0, 1),
(1, 'Trendyol Express', 'Depo Sayım Elemanı (Gece Vardiyası)',
 'Gece vardiyasında RF el terminali ile iade ürünlerin barkod okutması ve stok sayımı.',
 '2026-03-01', '2026-03-01', 950.00, 4.8, 1);

-- Değerlendirmeler (Emre'ye yapılanlar)
INSERT INTO reviews (job_id, reviewer_id, reviewee_id, rating, comment, review_type) VALUES
(2, 3, 1, 5.0, 'Emre Bey tam zamanında geldi, diksiyonu ve enerjisi çok iyiydi. Yabancı misafirlerle iletişimde hiç zorluk yaşamadı. Tekrar çalışmak isteriz.', 'employer_to_worker'),
(3, 4, 1, 4.5, 'Verilen görevi eksiksiz tamamladı. Sayım konusunda dikkatli ve hızlıydı.', 'employer_to_worker');

-- Mesajlaşma
INSERT INTO conversations (user1_id, user2_id, job_id, last_message_at) VALUES
(1, 3, 2, '2026-05-11 10:42:00'),
(1, 2, 1, '2026-05-10 21:15:00');

INSERT INTO messages (conversation_id, sender_id, content, sent_at, is_read) VALUES
(1, 3, 'Merhaba, VIP Karşılama pozisyonu için başvurunuzu inceledik.', '2026-05-11 10:30:00', 1),
(1, 1, 'Harika! Çok teşekkür ederim.',                                  '2026-05-11 10:35:00', 1),
(1, 3, 'Cuma günü saat 09:00''da bekliyoruz. Görüşmek üzere.',          '2026-05-11 10:42:00', 0),
(2, 1, 'Gece vardiyası için konum alabilir miyim?',                      '2026-05-10 21:00:00', 1),
(2, 2, 'Konum bilgilerini ilettim. Depo A kapısından giriş yapın.',      '2026-05-10 21:15:00', 1);

-- Takvim olayları
INSERT INTO calendar_events (user_id, job_id, title, event_date, start_time, color, source) VALUES
(1, 2, 'VIP Karşılama Hostesi - Hilton', '2026-05-24', '09:00:00', 'blue',    'job'),
(1, NULL, 'Sınavım var çalışamayacağım',  '2026-05-20', NULL,       'rose',    'manual');

-- Anket
INSERT INTO surveys (employer_id, title, subtitle, description, estimated_minutes, reward_type, reward_amount, status) VALUES
(4, 'Esnek Çalışma Şartları Anketi', 'Pazar Araştırması',
 'Kuryelerimiz ve depo çalışanlarımız için oluşturmayı planladığımız yeni esnek saat modeline dair fikrini merak ediyoruz.',
 3, 'balance', 50.00, 'active'),
(4, 'Gece Vardiyası Beklentileri', 'Memnuniyet Anketi',
 'Gece vardiyasında çalışan günlük personellerimizin çalışma koşullarını iyileştirmemiz için bize yardımcı ol.',
 2, 'points', 20.00, 'active');

-- Anket soruları
INSERT INTO survey_questions (survey_id, question_text, question_type, is_required, sort_order) VALUES
(1, 'Haftalık olarak kaç saat çalışmayı tercih edersiniz?', 'single_choice', 1, 1),
(1, 'Çalışma deneyiminizi 1-5 arası puanlayın.',            'rating',        1, 2),
(1, 'Eklemek istediğiniz görüşler:',                        'text',          0, 3);

-- Anket seçenekleri
INSERT INTO survey_options (question_id, option_text, sort_order) VALUES
(1, '10 saatten az',  1),
(1, '10-20 saat',     2),
(1, '20-40 saat',     3);

-- Bildirim örneği
INSERT INTO notifications (user_id, type, title, body) VALUES
(1, 'application', 'Başvurun onaylandı!', 'Hilton Otelleri - VIP Karşılama Hostesi başvurun kabul edildi.'),
(1, 'message',     'Yeni mesaj',           'Hilton İK Departmanı sana mesaj attı.');

-- Ödeme örnekleri
INSERT INTO payments (job_id, payer_id, payee_id, gross_amount, commission, net_amount, status, paid_at, released_at) VALUES
(2, 3, 1, 1800.00, 180.00, 1620.00, 'released', '2026-04-12 09:00:00', '2026-04-16 12:00:00'),
(3, 4, 1, 950.00,  95.00,  855.00,  'released', '2026-03-01 22:00:00', '2026-03-05 12:00:00');

-- ============================================================================
-- ÖRNEK SORGULAR (Kullanım)
-- ============================================================================
-- Ana sayfada aktif iş listesi:
--   SELECT j.id, j.title, j.budget, j.city, j.district, u.full_name AS employer_name
--   FROM jobs j JOIN users u ON u.id = j.employer_id
--   WHERE j.status = 'published' ORDER BY j.published_at DESC;
--
-- Bir kullanıcının iş geçmişi:
--   SELECT * FROM work_history WHERE user_id = 1 ORDER BY start_date DESC;
--
-- Bir kullanıcının bekleyen mesajları:
--   SELECT COUNT(*) FROM messages m
--   JOIN conversations c ON c.id = m.conversation_id
--   WHERE (c.user1_id = 1 OR c.user2_id = 1) AND m.sender_id <> 1 AND m.is_read = 0;
--
-- Aktif anketler:
--   SELECT * FROM surveys WHERE status='active' AND id NOT IN
--   (SELECT survey_id FROM survey_responses WHERE user_id = 1);
