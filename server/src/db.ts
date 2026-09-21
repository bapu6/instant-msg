import { Pool, QueryResult, QueryResultRow } from 'pg';
import path from 'path';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config({ path: path.join(__dirname, '../.env') });

export const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  database: process.env.POSTGRES_DB || 'instant_msg',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || '',
});

pool.on('error', (err: Error) => {
  console.error('Unexpected error on idle PostgreSQL client:', err);
});

export const query = <R extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<R>> => {
  return pool.query<R>(text, params);
};

export async function initDb(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        display_name VARCHAR(150),
        phone_number VARCHAR(30) UNIQUE,
        avatar TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number VARCHAR(30) UNIQUE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(150);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS hide_presence BOOLEAN DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS public_key TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS encrypted_private_key TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS key_salt TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS key_iv TEXT;
      CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

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
        is_delivered BOOLEAN DEFAULT FALSE,
        delivered_at TIMESTAMP WITH TIME ZONE,
        is_read BOOLEAN DEFAULT FALSE,
        read_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE messages ADD COLUMN IF NOT EXISTS encryption_key TEXT;
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS encryption_iv TEXT;
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_delivered BOOLEAN DEFAULT FALSE;
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE;
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMP WITH TIME ZONE;
      CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages (recipient, sender, is_read);

      CREATE TABLE IF NOT EXISTS contacts (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(100) NOT NULL,
        contact_username VARCHAR(100) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        initiated_by VARCHAR(100) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, contact_username)
      );

      CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts (user_id, status);
      CREATE INDEX IF NOT EXISTS idx_contacts_contact ON contacts (contact_username, status);

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

      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages (sender, recipient, created_at);
      CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages (recipient, created_at);
      CREATE INDEX IF NOT EXISTS idx_group_messages_group ON group_messages (group_id, created_at);

      INSERT INTO users (username, password, display_name, phone_number, avatar)
      VALUES 
      ('admin', '$2b$10$d8VWmTH1mS2PJSxzngQrmurxJ3i5I3xHKfTNRVxs5XJ2ZACW/wjTe', 'System Admin', '+910000000000', 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=150&auto=format&fit=crop&q=80')
      ON CONFLICT (username) DO NOTHING;
    `);

    // Auto-upgrade any legacy plaintext passwords to bcrypt hashes
    try {
      const unhashed = await pool.query<{ id: number; password: string }>(
        `SELECT id, password FROM users WHERE password IS NOT NULL AND password NOT LIKE '$2a$%' AND password NOT LIKE '$2b$%'`
      );
      for (const row of unhashed.rows) {
        if (row.password) {
          const hashed = await bcrypt.hash(row.password, 10);
          await pool.query(`UPDATE users SET password = $1 WHERE id = $2`, [hashed, row.id]);
        }
      }
      if (unhashed.rows.length > 0) {
        console.log(`🔒 Upgraded ${unhashed.rows.length} legacy plaintext user password(s) to bcrypt hashes in PostgreSQL.`);
      }
    } catch (upgradeErr: any) {
      console.warn('⚠️ Could not check/upgrade existing passwords:', upgradeErr.message);
    }

    console.log('✅ PostgreSQL database schema verified and migrated successfully.');
  } catch (err: any) {
    console.error('❌ Failed to initialize database schema:', err.message);
  }
}

export default {
  query,
  pool,
  initDb,
};
