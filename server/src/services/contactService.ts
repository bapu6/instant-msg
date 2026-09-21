import db from '../db';
import { Contact, PendingRequest, SafeUser } from '../types';
import signalingService from './signalingService';

export async function getContacts(userId: string): Promise<Contact[]> {
  if (!userId) return [];
  const u = userId.toLowerCase();

  const query = `
    SELECT 
      c.id,
      c.user_id,
      c.contact_username,
      c.status,
      c.initiated_by,
      c.created_at,
      c.updated_at,
      u.display_name,
      u.avatar,
      u.phone_number,
      u.email,
      u.last_seen,
      u.hide_presence
    FROM contacts c
    INNER JOIN users u ON LOWER(u.username) = LOWER(c.contact_username)
    WHERE LOWER(c.user_id) = $1 AND c.status = 'accepted'
    ORDER BY u.display_name ASC, c.contact_username ASC
  `;

  const result = await db.query(query, [u]);
  return result.rows.map((row: any) => ({
    id: row.id,
    user_id: row.user_id,
    contact_username: row.contact_username,
    status: row.status,
    initiated_by: row.initiated_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    display_name: row.display_name || row.contact_username,
    avatar: row.avatar,
    phone_number: row.phone_number,
    email: row.email,
    last_seen: row.last_seen,
    hide_presence: Boolean(row.hide_presence),
    is_online: Boolean(signalingService.isUserOnline(row.contact_username) && !row.hide_presence),
  }));
}

export async function getPendingRequests(userId: string): Promise<PendingRequest[]> {
  if (!userId) return [];
  const u = userId.toLowerCase();

  const query = `
    SELECT 
      c.id,
      c.contact_username AS username,
      u.display_name,
      u.avatar,
      c.initiated_by,
      c.created_at,
      (
        SELECT body 
        FROM messages m 
        WHERE (LOWER(m.sender) = LOWER(c.contact_username) AND LOWER(m.recipient) = $1)
           OR (LOWER(m.sender) = $1 AND LOWER(m.recipient) = LOWER(c.contact_username))
        ORDER BY m.created_at DESC 
        LIMIT 1
      ) AS last_message,
      (
        SELECT created_at 
        FROM messages m 
        WHERE (LOWER(m.sender) = LOWER(c.contact_username) AND LOWER(m.recipient) = $1)
           OR (LOWER(m.sender) = $1 AND LOWER(m.recipient) = LOWER(c.contact_username))
        ORDER BY m.created_at DESC 
        LIMIT 1
      ) AS last_message_time
    FROM contacts c
    INNER JOIN users u ON LOWER(u.username) = LOWER(c.contact_username)
    WHERE LOWER(c.user_id) = $1 
      AND c.status = 'pending' 
      AND LOWER(c.initiated_by) != $1
    ORDER BY c.created_at DESC
  `;

  const result = await db.query(query, [u]);
  return result.rows.map((row: any) => ({
    id: row.id,
    username: row.username,
    display_name: row.display_name || row.username,
    avatar: row.avatar,
    initiated_by: row.initiated_by,
    created_at: row.created_at,
    last_message: row.last_message || 'Message request',
    last_message_time: row.last_message_time || row.created_at,
  }));
}

export async function getContactStatus(user1: string, user2: string): Promise<{
  status: 'none' | 'pending' | 'accepted' | 'declined' | 'blocked';
  initiated_by?: string;
}> {
  if (!user1 || !user2) return { status: 'none' };
  const u1 = user1.toLowerCase();
  const u2 = user2.toLowerCase();

  const result = await db.query(
    'SELECT status, initiated_by FROM contacts WHERE LOWER(user_id) = $1 AND LOWER(contact_username) = $2',
    [u1, u2]
  );

  if (result.rows.length === 0) {
    return { status: 'none' };
  }

  return {
    status: result.rows[0].status,
    initiated_by: result.rows[0].initiated_by,
  };
}

export async function isMutualContact(user1: string, user2: string): Promise<boolean> {
  const { status } = await getContactStatus(user1, user2);
  return status === 'accepted';
}

export async function ensureContactRecord(sender: string, recipient: string): Promise<string> {
  const s = sender.toLowerCase();
  const r = recipient.toLowerCase();

  // Check if contact entry exists for recipient
  const check = await db.query(
    'SELECT status, initiated_by FROM contacts WHERE LOWER(user_id) = $1 AND LOWER(contact_username) = $2',
    [r, s]
  );

  if (check.rows.length > 0) {
    return check.rows[0].status;
  }

  // Create pending contact records for both sides
  await db.query(
    `INSERT INTO contacts (user_id, contact_username, status, initiated_by)
     VALUES ($1, $2, 'pending', $3)
     ON CONFLICT (user_id, contact_username) DO NOTHING`,
    [r, s, s]
  );

  await db.query(
    `INSERT INTO contacts (user_id, contact_username, status, initiated_by)
     VALUES ($1, $2, 'pending', $3)
     ON CONFLICT (user_id, contact_username) DO NOTHING`,
    [s, r, s]
  );

  // Notify recipient via websocket if online
  signalingService.sendToUser(r, {
    type: 'contact-request',
    from: s,
    initiated_by: s,
  });

  return 'pending';
}

export async function acceptContactRequest(userId: string, contactUsername: string): Promise<boolean> {
  const u = userId.toLowerCase();
  const c = contactUsername.toLowerCase();

  await db.query(
    `UPDATE contacts 
     SET status = 'accepted', updated_at = CURRENT_TIMESTAMP 
     WHERE (LOWER(user_id) = $1 AND LOWER(contact_username) = $2)
        OR (LOWER(user_id) = $2 AND LOWER(contact_username) = $1)`,
    [u, c]
  );

  // Mark all unread messages from contact as delivered/read if appropriate
  await db.query(
    `UPDATE messages 
     SET is_read = TRUE, read_at = CURRENT_TIMESTAMP, is_delivered = TRUE, delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP)
     WHERE LOWER(sender) = $1 AND LOWER(recipient) = $2 AND is_read = FALSE`,
    [c, u]
  );

  // Notify both parties via websocket
  signalingService.sendToUser(c, {
    type: 'contact-request-accepted',
    username: u,
  });

  signalingService.sendToUser(u, {
    type: 'contact-request-accepted',
    username: c,
  });

  // Notify sender that their messages are now read
  signalingService.sendToUser(c, {
    type: 'messages-read',
    reader: u,
  });

  return true;
}

export async function deleteContactRequest(userId: string, contactUsername: string): Promise<boolean> {
  const u = userId.toLowerCase();
  const c = contactUsername.toLowerCase();

  // Mark status as declined so it no longer appears in pending requests
  await db.query(
    `UPDATE contacts 
     SET status = 'declined', updated_at = CURRENT_TIMESTAMP 
     WHERE (LOWER(user_id) = $1 AND LOWER(contact_username) = $2)
        OR (LOWER(user_id) = $2 AND LOWER(contact_username) = $1)`,
    [u, c]
  );

  // Remove messages received from that contact to clear from inbox
  await db.query(
    `DELETE FROM messages 
     WHERE LOWER(recipient) = $1 AND LOWER(sender) = $2`,
    [u, c]
  );

  return true;
}

export async function blockUser(userId: string, targetUsername: string): Promise<boolean> {
  const u = userId.toLowerCase();
  const t = targetUsername.toLowerCase();

  // Upsert blocked status for user -> target
  await db.query(
    `INSERT INTO contacts (user_id, contact_username, status, initiated_by, updated_at)
     VALUES ($1, $2, 'blocked', $1, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id, contact_username)
     DO UPDATE SET status = 'blocked', initiated_by = $1, updated_at = CURRENT_TIMESTAMP`,
    [u, t]
  );

  // Clear pending/accepted status for reciprocal entry
  await db.query(
    `UPDATE contacts
     SET status = 'declined', updated_at = CURRENT_TIMESTAMP
     WHERE LOWER(user_id) = $1 AND LOWER(contact_username) = $2 AND status != 'blocked'`,
    [t, u]
  );

  // End any active calls via signaling
  signalingService.sendToUser(t, {
    type: 'call-ended',
    from: u,
    reason: 'blocked',
  });

  return true;
}

export async function unblockUser(userId: string, targetUsername: string): Promise<boolean> {
  const u = userId.toLowerCase();
  const t = targetUsername.toLowerCase();

  await db.query(
    `DELETE FROM contacts 
     WHERE LOWER(user_id) = $1 AND LOWER(contact_username) = $2 AND status = 'blocked'`,
    [u, t]
  );

  return true;
}

export async function isUserBlocked(recipient: string, sender: string): Promise<boolean> {
  if (!recipient || !sender) return false;
  const r = recipient.toLowerCase();
  const s = sender.toLowerCase();

  const res = await db.query(
    `SELECT 1 FROM contacts 
     WHERE LOWER(user_id) = $1 AND LOWER(contact_username) = $2 AND status = 'blocked'
     LIMIT 1`,
    [r, s]
  );

  return res.rows.length > 0;
}

export async function getBlockedUsers(userId: string): Promise<SafeUser[]> {
  if (!userId) return [];
  const u = userId.toLowerCase();

  const query = `
    SELECT u.id, u.username, u.display_name, u.email, u.phone_number, u.avatar, u.created_at
    FROM contacts c
    INNER JOIN users u ON LOWER(u.username) = LOWER(c.contact_username)
    WHERE LOWER(c.user_id) = $1 AND c.status = 'blocked'
    ORDER BY c.updated_at DESC
  `;

  const res = await db.query(query, [u]);
  return res.rows;
}

export async function declineContactRequest(userId: string, contactUsername: string): Promise<boolean> {
  return deleteContactRequest(userId, contactUsername);
}

export async function searchUsers(
  searchTerm: string,
  currentUsername: string
): Promise<(SafeUser & { contact_status: string | null; is_mutual: boolean })[]> {
  if (!searchTerm || searchTerm.trim().length === 0) return [];
  const queryText = `%${searchTerm.trim().toLowerCase()}%`;
  const curr = currentUsername.toLowerCase();

  const query = `
    SELECT 
      u.id,
      u.username,
      u.display_name,
      u.email,
      u.phone_number,
      u.avatar,
      u.last_seen,
      u.hide_presence,
      u.created_at,
      c.status AS contact_status
    FROM users u
    LEFT JOIN contacts c 
      ON LOWER(c.user_id) = $1 AND LOWER(c.contact_username) = LOWER(u.username)
    WHERE LOWER(u.username) != $1
      AND (
        LOWER(u.username) LIKE $2
        OR LOWER(u.display_name) LIKE $2
        OR LOWER(COALESCE(u.email, '')) LIKE $2
        OR LOWER(COALESCE(u.phone_number, '')) LIKE $2
      )
    ORDER BY 
      CASE WHEN LOWER(u.username) = LOWER($3) THEN 0 ELSE 1 END,
      u.display_name ASC
    LIMIT 20
  `;

  const result = await db.query(query, [curr, queryText, searchTerm.trim().toLowerCase()]);
  return result.rows.map((row: any) => ({
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    email: row.email,
    phone_number: row.phone_number,
    avatar: row.avatar,
    last_seen: row.last_seen,
    hide_presence: Boolean(row.hide_presence),
    created_at: row.created_at,
    contact_status: row.contact_status || null,
    is_mutual: row.contact_status === 'accepted',
  }));
}

export default {
  getContacts,
  getPendingRequests,
  getContactStatus,
  isMutualContact,
  ensureContactRecord,
  acceptContactRequest,
  declineContactRequest,
  deleteContactRequest,
  blockUser,
  unblockUser,
  isUserBlocked,
  getBlockedUsers,
  searchUsers,
};
