import db from '../db';
import { Message, SaveMessageInput, RecentConversationSummary } from '../types';

export async function saveMessage({
  sender,
  recipient,
  body = '',
  message_type = 'text',
  media_url = null,
  media_name = null,
  media_size = null,
  media_mime = null,
  encryption_key = null,
  encryption_iv = null,
}: SaveMessageInput): Promise<Message> {
  if (!sender || !recipient) {
    throw new Error('Sender and recipient are required');
  }

  const query = `
    INSERT INTO messages (
      sender, recipient, body, message_type,
      media_url, media_name, media_size, media_mime,
      encryption_key, encryption_iv
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *
  `;

  const values = [
    sender.toLowerCase(),
    recipient.toLowerCase(),
    body || '',
    message_type || 'text',
    media_url,
    media_name,
    media_size ? parseInt(String(media_size), 10) : null,
    media_mime,
    encryption_key,
    encryption_iv,
  ];

  const result = await db.query<Message>(query, values);
  return result.rows[0];
}

export async function getConversation(
  user1: string,
  user2: string,
  limit: number = 100,
  offset: number = 0
): Promise<Message[]> {
  if (!user1 || !user2) {
    throw new Error('Both user1 and user2 must be provided');
  }

  const u1 = user1.toLowerCase();
  const u2 = user2.toLowerCase();

  const query = `
    SELECT *
    FROM messages
    WHERE (sender = $1 AND recipient = $2)
       OR (sender = $2 AND recipient = $1)
    ORDER BY created_at ASC
    LIMIT $3 OFFSET $4
  `;

  const result = await db.query<Message>(query, [u1, u2, limit, offset]);
  return result.rows;
}

export async function getRecentConversations(username: string): Promise<RecentConversationSummary[]> {
  if (!username) return [];

  const u = username.toLowerCase();
  const query = `
    WITH latest_messages AS (
      SELECT DISTINCT ON (
        LEAST(sender, recipient),
        GREATEST(sender, recipient)
      )
        id, sender, recipient, body, message_type,
        media_url, media_name, media_size, created_at
      FROM messages
      WHERE sender = $1 OR recipient = $1
      ORDER BY 
        LEAST(sender, recipient),
        GREATEST(sender, recipient),
        created_at DESC
    )
    SELECT lm.*,
           u.display_name AS counterpart_name,
           u.avatar AS counterpart_avatar,
           CASE 
             WHEN lm.sender = $1 THEN lm.recipient 
             ELSE lm.sender 
           END AS counterpart_username
    FROM latest_messages lm
    LEFT JOIN users u 
      ON u.username = (CASE WHEN lm.sender = $1 THEN lm.recipient ELSE lm.sender END)
    ORDER BY lm.created_at DESC;
  `;

  const result = await db.query<RecentConversationSummary>(query, [u]);
  return result.rows;
}

export default {
  saveMessage,
  getConversation,
  getRecentConversations,
};
