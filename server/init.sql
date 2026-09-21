-- Initialize Instant Msg Database Schema

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    display_name VARCHAR(150),
    email VARCHAR(150),
    phone_number VARCHAR(30) UNIQUE,
    avatar TEXT,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    hide_presence BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    sender VARCHAR(100) NOT NULL,
    recipient VARCHAR(100) NOT NULL,
    body TEXT,
    message_type VARCHAR(50) DEFAULT 'text',
    media_url TEXT,
    media_name VARCHAR(255),
    media_size BIGINT,
    media_mime VARCHAR(100),
    encryption_key TEXT,
    encryption_iv TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_groups (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    avatar TEXT,
    description TEXT,
    created_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS group_members (
    id SERIAL PRIMARY KEY,
    group_id INTEGER REFERENCES chat_groups(id) ON DELETE CASCADE,
    username VARCHAR(100) NOT NULL,
    role VARCHAR(50) DEFAULT 'member',
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (group_id, username)
);

CREATE TABLE IF NOT EXISTS group_messages (
    id SERIAL PRIMARY KEY,
    group_id INTEGER REFERENCES chat_groups(id) ON DELETE CASCADE,
    sender VARCHAR(100) NOT NULL,
    body TEXT,
    message_type VARCHAR(50) DEFAULT 'text',
    media_url TEXT,
    media_name VARCHAR(255),
    media_size BIGINT,
    media_mime VARCHAR(100),
    encryption_key TEXT,
    encryption_iv TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation 
ON messages (sender, recipient, created_at);

CREATE INDEX IF NOT EXISTS idx_messages_recipient 
ON messages (recipient, created_at);

CREATE INDEX IF NOT EXISTS idx_group_messages_group 
ON group_messages (group_id, created_at);

-- Seed initial test users (admin only)
INSERT INTO users (username, password, display_name, phone_number, avatar)
VALUES 
('admin', 'adminpass', 'System Admin', '+910000000000', 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=150&auto=format&fit=crop&q=80')
ON CONFLICT (username) DO NOTHING;
