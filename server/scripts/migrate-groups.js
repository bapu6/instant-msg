const { Pool } = require('pg');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  database: process.env.POSTGRES_DB || 'instant_msg',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || '',
});

const sql = `
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
    UNIQUE(group_id, username)
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

CREATE INDEX IF NOT EXISTS idx_group_messages_group ON group_messages (group_id, created_at);
CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members (username);

-- Seed an initial group if none exists
INSERT INTO chat_groups (id, name, avatar, description, created_by)
VALUES (1, 'General Community', 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=150&auto=format&fit=crop&q=80', 'Welcome to InstantMsg general discussion', 'alice')
ON CONFLICT (id) DO NOTHING;

INSERT INTO group_members (group_id, username, role)
VALUES 
(1, 'alice', 'admin'),
(1, 'bob', 'member'),
(1, 'admin', 'member')
ON CONFLICT (group_id, username) DO NOTHING;

-- Reset sequence to avoid id conflict
SELECT setval('chat_groups_id_seq', (SELECT GREATEST(MAX(id), 1) FROM chat_groups));
`;

pool.query(sql)
  .then(() => {
    console.log('Group tables and seed data created successfully in PostgreSQL!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Group migration failed:', err.message);
    process.exit(1);
  });
