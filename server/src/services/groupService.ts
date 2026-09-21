import db from '../db';
import {
  ChatGroup,
  GroupMember,
  GroupMessage,
  CreateGroupInput,
  SaveGroupMessageInput,
} from '../types';

export async function createGroup({
  name,
  avatar,
  description,
  created_by,
  members,
}: CreateGroupInput): Promise<ChatGroup> {
  if (!name || !created_by) {
    throw new Error('Group name and creator are required');
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Insert chat_group
    const groupResult = await client.query<ChatGroup>(
      `INSERT INTO chat_groups (name, avatar, description, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        name,
        avatar || 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=150&auto=format&fit=crop&q=80',
        description || '',
        created_by.toLowerCase(),
      ]
    );
    const newGroup = groupResult.rows[0];

    // 2. Add creator as admin
    await client.query(
      `INSERT INTO group_members (group_id, username, role)
       VALUES ($1, $2, 'admin')`,
      [newGroup.id, created_by.toLowerCase()]
    );

    // 3. Add members
    const uniqueMembers = Array.from(new Set(members.map((m) => m.toLowerCase())));
    for (const member of uniqueMembers) {
      if (member !== created_by.toLowerCase()) {
        await client.query(
          `INSERT INTO group_members (group_id, username, role)
           VALUES ($1, $2, 'member')
           ON CONFLICT (group_id, username) DO NOTHING`,
          [newGroup.id, member]
        );
      }
    }

    await client.query('COMMIT');
    return newGroup;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getUserGroups(username: string): Promise<ChatGroup[]> {
  if (!username) return [];

  const query = `
    SELECT 
      g.id,
      g.name,
      g.avatar,
      g.description,
      g.created_by,
      g.created_at,
      (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id)::int AS member_count,
      last_msg.body AS last_message,
      last_msg.created_at AS last_message_time
    FROM chat_groups g
    JOIN group_members m ON m.group_id = g.id
    LEFT JOIN LATERAL (
      SELECT body, created_at 
      FROM group_messages 
      WHERE group_id = g.id 
      ORDER BY created_at DESC 
      LIMIT 1
    ) last_msg ON TRUE
    WHERE m.username = $1
    ORDER BY COALESCE(last_msg.created_at, g.created_at) DESC
  `;

  const result = await db.query<ChatGroup>(query, [username.toLowerCase()]);
  return result.rows;
}

export async function getGroupMessages(
  groupId: number,
  limit: number = 100,
  offset: number = 0
): Promise<GroupMessage[]> {
  const query = `
    SELECT 
      gm.*,
      u.display_name AS sender_name,
      u.avatar AS sender_avatar
    FROM group_messages gm
    LEFT JOIN users u ON u.username = gm.sender
    WHERE gm.group_id = $1
    ORDER BY gm.created_at ASC
    LIMIT $2 OFFSET $3
  `;

  const result = await db.query<GroupMessage>(query, [groupId, limit, offset]);
  return result.rows;
}

export async function saveGroupMessage({
  group_id,
  sender,
  body = '',
  message_type = 'text',
  media_url = null,
  media_name = null,
  media_size = null,
  media_mime = null,
  encryption_key = null,
  encryption_iv = null,
}: SaveGroupMessageInput): Promise<GroupMessage> {
  if (!group_id || !sender) {
    throw new Error('Group ID and sender are required');
  }

  const query = `
    INSERT INTO group_messages (
      group_id, sender, body, message_type,
      media_url, media_name, media_size, media_mime,
      encryption_key, encryption_iv
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *
  `;

  const values = [
    group_id,
    sender.toLowerCase(),
    body || '',
    message_type || 'text',
    media_url,
    media_name,
    media_size ? parseInt(String(media_size), 10) : null,
    media_mime,
    encryption_key,
    encryption_iv,
  ];

  const result = await db.query<GroupMessage>(query, values);
  const msg = result.rows[0];

  // Populate sender display details
  const userResult = await db.query(`SELECT display_name, avatar FROM users WHERE username = $1`, [sender.toLowerCase()]);
  if (userResult.rows.length > 0) {
    msg.sender_name = userResult.rows[0].display_name;
    msg.sender_avatar = userResult.rows[0].avatar;
  }

  return msg;
}

export async function getGroupMembers(groupId: number): Promise<GroupMember[]> {
  const query = `
    SELECT 
      gm.id,
      gm.group_id,
      gm.username,
      gm.role,
      gm.joined_at,
      u.display_name,
      u.avatar
    FROM group_members gm
    LEFT JOIN users u ON u.username = gm.username
    WHERE gm.group_id = $1
    ORDER BY gm.role DESC, gm.joined_at ASC
  `;

  const result = await db.query<GroupMember>(query, [groupId]);
  return result.rows;
}

export async function addMemberToGroup(
  groupId: number,
  username: string,
  role: string = 'member'
): Promise<void> {
  await db.query(
    `INSERT INTO group_members (group_id, username, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (group_id, username) DO NOTHING`,
    [groupId, username.toLowerCase(), role]
  );
}

export async function deleteGroup(
  groupId: number,
  requestedBy?: string
): Promise<boolean> {
  if (!groupId) {
    throw new Error('Group ID is required');
  }

  // If requestedBy is provided and not admin bypass, check permissions
  if (requestedBy && requestedBy.toLowerCase() !== 'admin') {
    const groupRes = await db.query<ChatGroup>(
      `SELECT * FROM chat_groups WHERE id = $1`,
      [groupId]
    );
    if (groupRes.rows.length === 0) {
      throw new Error('Group not found');
    }

    const group = groupRes.rows[0];
    const isCreator = group.created_by.toLowerCase() === requestedBy.toLowerCase();

    if (!isCreator) {
      const memberRes = await db.query(
        `SELECT role FROM group_members WHERE group_id = $1 AND username = $2`,
        [groupId, requestedBy.toLowerCase()]
      );
      const isAdmin = memberRes.rows.length > 0 && memberRes.rows[0].role === 'admin';
      if (!isAdmin) {
        throw new Error('Only the group creator or an admin can delete this group');
      }
    }
  }

  // Delete chat group (cascades to group_members and group_messages)
  await db.query(`DELETE FROM chat_groups WHERE id = $1`, [groupId]);
  return true;
}

export default {
  createGroup,
  getUserGroups,
  getGroupMessages,
  saveGroupMessage,
  getGroupMembers,
  addMemberToGroup,
  deleteGroup,
};
