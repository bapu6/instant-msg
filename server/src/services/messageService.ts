import db from '../db';
import { Message, SaveMessageInput, RecentConversationSummary } from '../types';
import signalingService from './signalingService';
import contactService from './contactService';

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

  const s = sender.toLowerCase();
  const r = recipient.toLowerCase();

  // Check if recipient has blocked sender
  const isBlocked = await contactService.isUserBlocked(r, s);
  if (isBlocked) {
    throw new Error('You cannot message this user');
  }

  // Check if recipient is currently online to set initial delivery status
  const isRecipientOnline = signalingService.isUserOnline(r);
  const isDelivered = isRecipientOnline;
  const deliveredAt = isDelivered ? new Date().toISOString() : null;

  // Auto-create pending contact record if not already established
  await contactService.ensureContactRecord(s, r);

  const query = `
    INSERT INTO messages (
      sender, recipient, body, message_type,
      media_url, media_name, media_size, media_mime,
      encryption_key, encryption_iv,
      is_delivered, delivered_at, is_read
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, FALSE)
    RETURNING *
  `;

  const values = [
    s,
    r,
    body || '',
    message_type || 'text',
    media_url,
    media_name,
    media_size ? parseInt(String(media_size), 10) : null,
    media_mime,
    encryption_key,
    encryption_iv,
    isDelivered,
    deliveredAt,
  ];

  const result = await db.query<Message>(query, values);
  const savedMsg = result.rows[0];

  // Send real-time notification to recipient via WebSocket
  signalingService.sendToUser(r, {
    type: 'new-message',
    message: savedMsg,
  });

  // If delivered immediately, notify sender
  if (isDelivered) {
    signalingService.sendToUser(s, {
      type: 'message-delivered',
      messageId: savedMsg.id,
      recipient: r,
    });
  }

  return savedMsg;
}

export async function markMessagesDelivered(recipient: string): Promise<number> {
  if (!recipient) return 0;
  const r = recipient.toLowerCase();

  const query = `
    UPDATE messages
    SET is_delivered = TRUE, delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP)
    WHERE LOWER(recipient) = $1 AND is_delivered = FALSE
    RETURNING id, sender
  `;

  const result = await db.query(query, [r]);
  if (result.rows.length > 0) {
    // Notify senders that their messages reached recipient
    const senders = new Set<string>();
    for (const row of result.rows) {
      senders.add(row.sender.toLowerCase());
    }

    for (const s of senders) {
      signalingService.sendToUser(s, {
        type: 'messages-delivered',
        recipient: r,
      });
    }
  }

  return result.rowCount || 0;
}

export async function markMessagesRead(reader: string, sender: string): Promise<{ success: boolean; updated: boolean; reason?: string }> {
  if (!reader || !sender) {
    return { success: false, updated: false, error: 'Reader and sender are required' } as any;
  }

  const r = reader.toLowerCase();
  const s = sender.toLowerCase();

  // Privacy protection: If the reader hasn't accepted the sender's message request,
  // DO NOT mark read or update read receipts!
  const { status } = await contactService.getContactStatus(r, s);
  if (status !== 'accepted') {
    return {
      success: true,
      updated: false,
      reason: 'contact_not_accepted',
    };
  }

  const query = `
    UPDATE messages
    SET 
      is_read = TRUE, 
      read_at = CURRENT_TIMESTAMP,
      is_delivered = TRUE,
      delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP)
    WHERE LOWER(recipient) = $1 
      AND LOWER(sender) = $2 
      AND is_read = FALSE
    RETURNING id
  `;

  const result = await db.query(query, [r, s]);
  const count = result.rowCount || 0;

  if (count > 0) {
    // Notify sender that reader has read the messages
    signalingService.sendToUser(s, {
      type: 'messages-read',
      reader: r,
      readAt: new Date().toISOString(),
    });
  }

  return { success: true, updated: count > 0 };
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
    WHERE (LOWER(sender) = $1 AND LOWER(recipient) = $2)
       OR (LOWER(sender) = $2 AND LOWER(recipient) = $1)
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
        LEAST(LOWER(sender), LOWER(recipient)),
        GREATEST(LOWER(sender), LOWER(recipient))
      )
        id, sender, recipient, body, message_type,
        media_url, media_name, media_size, created_at,
        is_delivered, is_read
      FROM messages
      WHERE LOWER(sender) = $1 OR LOWER(recipient) = $1
      ORDER BY 
        LEAST(LOWER(sender), LOWER(recipient)),
        GREATEST(LOWER(sender), LOWER(recipient)),
        created_at DESC
    )
    SELECT lm.*,
           u.display_name AS counterpart_name,
           u.avatar AS counterpart_avatar,
           c.status AS contact_status,
           c.initiated_by,
           CASE 
             WHEN LOWER(lm.sender) = $1 THEN lm.recipient 
             ELSE lm.sender 
           END AS counterpart_username
    FROM latest_messages lm
    LEFT JOIN users u 
      ON LOWER(u.username) = (CASE WHEN LOWER(lm.sender) = $1 THEN LOWER(lm.recipient) ELSE LOWER(lm.sender) END)
    LEFT JOIN contacts c
      ON LOWER(c.user_id) = $1 
     AND LOWER(c.contact_username) = (CASE WHEN LOWER(lm.sender) = $1 THEN LOWER(lm.recipient) ELSE LOWER(lm.sender) END)
    WHERE (c.status IS NULL OR c.status != 'blocked')
    ORDER BY lm.created_at DESC;
  `;

  const result = await db.query<RecentConversationSummary>(query, [u]);
  return result.rows;
}

export default {
  saveMessage,
  markMessagesDelivered,
  markMessagesRead,
  getConversation,
  getRecentConversations,
};
