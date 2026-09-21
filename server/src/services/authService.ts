import { exec } from 'child_process';
import db from '../db';
import { User, SafeUser, RegisterInput, LoginInput } from '../types';

const XMPP_DOMAIN = process.env.XMPP_DOMAIN || 'localhost';

/**
 * Register user in ejabberd container so they can connect via XMPP
 */
export function syncEjabberdUser(username: string, password: string): Promise<boolean> {
  return new Promise((resolve) => {
    const cmd = `docker exec instant_msg_xmpp ejabberdctl register ${username} ${XMPP_DOMAIN} "${password}"`;
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        // May already be registered in ejabberd, that's acceptable
        console.log(`[ejabberd sync] ${username}: ${(stderr || stdout || error.message).trim()}`);
      } else {
        console.log(`[ejabberd sync] Registered ${username}@${XMPP_DOMAIN} in ejabberd`);
      }
      resolve(true);
    });
  });
}

export async function registerUser({
  username,
  password,
  displayName,
  avatar,
}: RegisterInput): Promise<SafeUser> {
  if (!username || !password) {
    throw new Error('Username and password are required');
  }

  const cleanUsername = username.trim().toLowerCase();
  const name = displayName && displayName.trim() ? displayName.trim() : cleanUsername;
  const avatarUrl =
    avatar ||
    `https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80`;

  // Insert into PostgreSQL
  const query = `
    INSERT INTO users (username, password, display_name, avatar)
    VALUES ($1, $2, $3, $4)
    RETURNING id, username, display_name, avatar, created_at
  `;

  try {
    const result = await db.query<SafeUser>(query, [cleanUsername, password, name, avatarUrl]);
    const user = result.rows[0];

    // Sync with ejabberd XMPP server
    await syncEjabberdUser(cleanUsername, password);

    return user;
  } catch (err: any) {
    if (err.code === '23505') {
      // Unique violation
      throw new Error('Username already exists. Please choose a different username or log in.');
    }
    throw err;
  }
}

export async function loginUser({ username, password }: LoginInput): Promise<SafeUser> {
  if (!username || !password) {
    throw new Error('Username and password are required');
  }

  const cleanUsername = username.trim().toLowerCase();
  const query = `
    SELECT id, username, password, display_name, avatar, created_at
    FROM users
    WHERE username = $1
  `;
  const result = await db.query<User>(query, [cleanUsername]);
  if (result.rows.length === 0) {
    throw new Error('Invalid username or password');
  }

  const user = result.rows[0];
  if (user.password !== password) {
    throw new Error('Invalid username or password');
  }

  // Ensure user is also registered in ejabberd in case it was created directly in DB
  syncEjabberdUser(cleanUsername, password).catch(() => {});

  const { password: _, ...safeUser } = user;
  return safeUser;
}

/**
 * Merges two user profiles into one primary user:
 * - Reassigns all direct messages sent or received by secondaryUser to primaryUser
 * - Reassigns group memberships and group messages to primaryUser
 * - Deletes the secondary duplicate user record
 */
async function mergeUsers(primaryUser: SafeUser, secondaryUser: SafeUser): Promise<void> {
  if (primaryUser.id === secondaryUser.id) return;
  const pUsername = primaryUser.username;
  const sUsername = secondaryUser.username;

  console.log(`🔀 [AuthService] Merging user @${sUsername} (ID ${secondaryUser.id}) into @${pUsername} (ID ${primaryUser.id})...`);

  // 1. Migrate direct messages
  await db.query(`UPDATE messages SET sender = $1 WHERE sender = $2`, [pUsername, sUsername]);
  await db.query(`UPDATE messages SET recipient = $1 WHERE recipient = $2`, [pUsername, sUsername]);

  // 2. Migrate group messages
  await db.query(`UPDATE group_messages SET sender = $1 WHERE sender = $2`, [pUsername, sUsername]);

  // 3. Migrate group memberships (avoid unique key violation on group_id, username)
  await db.query(`
    UPDATE group_members 
    SET username = $1 
    WHERE username = $2 
    AND group_id NOT IN (SELECT group_id FROM group_members WHERE username = $1)
  `, [pUsername, sUsername]);
  await db.query(`DELETE FROM group_members WHERE username = $1`, [sUsername]);

  // 4. Delete the secondary user record
  await db.query(`DELETE FROM users WHERE id = $1`, [secondaryUser.id]);
}

export async function loginOrRegisterWithPhone({
  phoneNumber,
  displayName,
  email,
  avatar,
}: {
  phoneNumber: string;
  displayName?: string;
  email?: string;
  avatar?: string;
}): Promise<SafeUser> {
  const cleanPhone = phoneNumber.trim().replace(/\s+/g, '');
  if (!cleanPhone || cleanPhone.length < 8) {
    throw new Error('Valid phone number is required');
  }
  const cleanEmail = email ? email.trim().toLowerCase() : null;

  // 1. Check if user already exists by phone_number or username
  const phoneResult = await db.query<SafeUser>(
    `SELECT id, username, display_name, email, phone_number, avatar, created_at
     FROM users
     WHERE phone_number = $1 OR username = $1`,
    [cleanPhone]
  );
  let phoneUser = phoneResult.rows[0] || null;

  // 2. Check if user exists by email (if email provided)
  let emailUser: SafeUser | null = null;
  if (cleanEmail) {
    const emailResult = await db.query<SafeUser>(
      `SELECT id, username, display_name, email, phone_number, avatar, created_at
       FROM users
       WHERE email = $1`,
      [cleanEmail]
    );
    emailUser = emailResult.rows[0] || null;
  }

  // 3. MERGE SCENARIO: If both exist and are different rows, merge them!
  if (phoneUser && emailUser && phoneUser.id !== emailUser.id) {
    const primary = phoneUser;
    const secondary = emailUser;
    await mergeUsers(primary, secondary);
    primary.email = cleanEmail;
    await db.query(`UPDATE users SET email = $1 WHERE id = $2`, [cleanEmail, primary.id]);
    return primary;
  }

  // 4. If user exists with this email, link the phone to this email user
  if (emailUser && !phoneUser) {
    await db.query(`UPDATE users SET phone_number = $1 WHERE id = $2`, [cleanPhone, emailUser.id]);
    emailUser.phone_number = cleanPhone;
    if (displayName && (!emailUser.display_name || emailUser.display_name === emailUser.username)) {
      await db.query(`UPDATE users SET display_name = $1 WHERE id = $2`, [displayName.trim(), emailUser.id]);
      emailUser.display_name = displayName.trim();
    }
    return emailUser;
  }

  // 5. If phone user exists, update email/displayName if provided
  if (phoneUser) {
    if (cleanEmail && !phoneUser.email) {
      await db.query(`UPDATE users SET email = $1 WHERE id = $2`, [cleanEmail, phoneUser.id]);
      phoneUser.email = cleanEmail;
    }
    if (displayName && (!phoneUser.display_name || phoneUser.display_name === phoneUser.username)) {
      await db.query(`UPDATE users SET display_name = $1 WHERE id = $2`, [displayName.trim(), phoneUser.id]);
      phoneUser.display_name = displayName.trim();
    }
    return phoneUser;
  }

  // 6. Otherwise create new user
  const username = cleanPhone.replace(/[^a-zA-Z0-9]/g, '');
  const name = displayName && displayName.trim() ? displayName.trim() : cleanPhone;
  const avatarUrl =
    avatar ||
    `https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80`;
  const defaultPassword = `pass_${username}`;

  const insertQuery = `
    INSERT INTO users (username, password, display_name, email, phone_number, avatar)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, username, display_name, email, phone_number, avatar, created_at
  `;
  const insertResult = await db.query<SafeUser>(insertQuery, [
    username,
    defaultPassword,
    name,
    cleanEmail,
    cleanPhone,
    avatarUrl,
  ]);
  const newUser = insertResult.rows[0];

  syncEjabberdUser(username, defaultPassword).catch(() => {});
  return newUser;
}

export async function loginOrRegisterWithGoogle({
  email,
  displayName,
  avatar,
  phoneNumber,
}: {
  email: string;
  displayName?: string;
  avatar?: string;
  phoneNumber?: string;
}): Promise<SafeUser> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Valid email is required');
  }
  const cleanPhone = phoneNumber ? phoneNumber.trim().replace(/\s+/g, '') : null;
  const defaultUsername = cleanEmail.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '');

  // 1. Find user by email or defaultUsername
  const emailUserRes = await db.query<SafeUser>(
    `SELECT id, username, display_name, email, phone_number, avatar, created_at
     FROM users
     WHERE email = $1 OR username = $2`,
    [cleanEmail, defaultUsername]
  );
  let emailUser = emailUserRes.rows[0] || null;

  // 2. Find user by phone_number (if phone is present)
  let phoneUser: SafeUser | null = null;
  if (cleanPhone) {
    const phoneUserRes = await db.query<SafeUser>(
      `SELECT id, username, display_name, email, phone_number, avatar, created_at
       FROM users
       WHERE phone_number = $1 OR username = $1`,
      [cleanPhone]
    );
    phoneUser = phoneUserRes.rows[0] || null;
  }

  // 3. MERGE SCENARIO: If both exist and are distinct records, merge them into one profile!
  if (emailUser && phoneUser && emailUser.id !== phoneUser.id) {
    const primary = phoneUser;
    const secondary = emailUser;
    await mergeUsers(primary, secondary);

    const finalName = displayName?.trim() || primary.display_name || secondary.display_name || defaultUsername;
    const finalAvatar = avatar || primary.avatar || secondary.avatar;
    await db.query(
      `UPDATE users SET email = $1, display_name = $2, avatar = $3 WHERE id = $4`,
      [cleanEmail, finalName, finalAvatar, primary.id]
    );
    primary.email = cleanEmail;
    primary.display_name = finalName;
    primary.avatar = finalAvatar;
    return primary;
  }

  // 4. If user was found by phone_number, attach email to it
  if (phoneUser) {
    const finalName = displayName?.trim() || phoneUser.display_name || defaultUsername;
    const finalAvatar = avatar || phoneUser.avatar;
    await db.query(
      `UPDATE users SET email = $1, display_name = $2, avatar = $3 WHERE id = $4`,
      [cleanEmail, finalName, finalAvatar, phoneUser.id]
    );
    phoneUser.email = cleanEmail;
    phoneUser.display_name = finalName;
    phoneUser.avatar = finalAvatar;
    return phoneUser;
  }

  // 5. If user found by email, attach phone if available
  if (emailUser) {
    let updateQuery = `UPDATE users SET email = $1`;
    const params: any[] = [cleanEmail];
    let pIndex = 2;

    if (cleanPhone && !emailUser.phone_number) {
      updateQuery += `, phone_number = $${pIndex++}`;
      params.push(cleanPhone);
      emailUser.phone_number = cleanPhone;
    }
    if (avatar && (!emailUser.avatar || emailUser.avatar.includes('unsplash'))) {
      updateQuery += `, avatar = $${pIndex++}`;
      params.push(avatar);
      emailUser.avatar = avatar;
    }
    if (displayName && (!emailUser.display_name || emailUser.display_name === emailUser.username)) {
      updateQuery += `, display_name = $${pIndex++}`;
      params.push(displayName.trim());
      emailUser.display_name = displayName.trim();
    }
    updateQuery += ` WHERE id = $${pIndex}`;
    params.push(emailUser.id);
    await db.query(updateQuery, params);
    emailUser.email = cleanEmail;
    return emailUser;
  }

  // 6. Otherwise create new combined user
  const username = defaultUsername || `user_${Date.now()}`;
  const name = displayName && displayName.trim() ? displayName.trim() : username;
  const avatarUrl =
    avatar ||
    `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80`;
  const defaultPassword = `pass_${username}`;

  const insertQuery = `
    INSERT INTO users (username, password, display_name, email, phone_number, avatar)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, username, display_name, email, phone_number, avatar, created_at
  `;
  const insertResult = await db.query<SafeUser>(insertQuery, [
    username,
    defaultPassword,
    name,
    cleanEmail,
    cleanPhone,
    avatarUrl,
  ]);
  const newUser = insertResult.rows[0];

  syncEjabberdUser(username, defaultPassword).catch(() => {});
  return newUser;
}

/**
 * Link or update profile details (Email, Phone, Name, Avatar)
 * and merge accounts if the phone or email already belongs to another user.
 */
export async function linkOrUpdateProfile({
  userId,
  email,
  phoneNumber,
  displayName,
  avatar,
}: {
  userId: number;
  email?: string;
  phoneNumber?: string;
  displayName?: string;
  avatar?: string;
}): Promise<SafeUser> {
  const currentRes = await db.query<SafeUser>(
    `SELECT id, username, display_name, email, phone_number, avatar, created_at FROM users WHERE id = $1`,
    [userId]
  );
  if (currentRes.rows.length === 0) {
    throw new Error('User not found');
  }
  let currentUser = currentRes.rows[0];
  const cleanEmail = email ? email.trim().toLowerCase() : null;
  const cleanPhone = phoneNumber ? phoneNumber.trim().replace(/\s+/g, '') : null;

  // Check if phone belongs to another user -> merge!
  if (cleanPhone) {
    const existingPhone = await db.query<SafeUser>(
      `SELECT id, username, display_name, email, phone_number, avatar, created_at FROM users WHERE (phone_number = $1 OR username = $1) AND id != $2`,
      [cleanPhone, userId]
    );
    if (existingPhone.rows.length > 0) {
      await mergeUsers(currentUser, existingPhone.rows[0]);
    }
  }

  // Check if email belongs to another user -> merge!
  if (cleanEmail) {
    const existingEmail = await db.query<SafeUser>(
      `SELECT id, username, display_name, email, phone_number, avatar, created_at FROM users WHERE email = $1 AND id != $2`,
      [cleanEmail, userId]
    );
    if (existingEmail.rows.length > 0) {
      await mergeUsers(currentUser, existingEmail.rows[0]);
    }
  }

  const finalEmail = cleanEmail || currentUser.email;
  const finalPhone = cleanPhone || currentUser.phone_number;
  const finalName = displayName?.trim() || currentUser.display_name;
  const finalAvatar = avatar || currentUser.avatar;

  const updateRes = await db.query<SafeUser>(
    `UPDATE users 
     SET email = $1, phone_number = $2, display_name = $3, avatar = $4 
     WHERE id = $5 
     RETURNING id, username, display_name, email, phone_number, avatar, created_at`,
    [finalEmail, finalPhone, finalName, finalAvatar, userId]
  );
  return updateRes.rows[0];
}

export async function getAllUsers(excludeUsername: string | null = null): Promise<SafeUser[]> {
  let query = `
    SELECT id, username, display_name, email, phone_number, avatar, created_at
    FROM users
  `;
  const params: string[] = [];
  if (excludeUsername) {
    query += ` WHERE username != $1`;
    params.push(excludeUsername.toLowerCase());
  }
  query += ` ORDER BY display_name ASC`;

  const result = await db.query<SafeUser>(query, params);
  return result.rows;
}

export default {
  registerUser,
  loginUser,
  loginOrRegisterWithPhone,
  loginOrRegisterWithGoogle,
  linkOrUpdateProfile,
  getAllUsers,
  syncEjabberdUser,
};
