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

export async function loginOrRegisterWithPhone({
  phoneNumber,
  displayName,
  avatar,
}: {
  phoneNumber: string;
  displayName?: string;
  avatar?: string;
}): Promise<SafeUser> {
  const cleanPhone = phoneNumber.trim().replace(/\s+/g, '');
  if (!cleanPhone || cleanPhone.length < 8) {
    throw new Error('Valid phone number is required');
  }

  // 1. Check if user already exists by phone_number or username
  const checkQuery = `
    SELECT id, username, display_name, phone_number, avatar, created_at
    FROM users
    WHERE phone_number = $1 OR username = $1
  `;
  const existingResult = await db.query<SafeUser>(checkQuery, [cleanPhone]);
  if (existingResult.rows.length > 0) {
    const user = existingResult.rows[0];
    if (displayName && (!user.display_name || user.display_name === user.username)) {
      await db.query(`UPDATE users SET display_name = $1 WHERE id = $2`, [displayName.trim(), user.id]);
      user.display_name = displayName.trim();
    }
    return user;
  }

  // 2. Otherwise create new user with phone
  const username = cleanPhone.replace(/[^a-zA-Z0-9]/g, '');
  const name = displayName && displayName.trim() ? displayName.trim() : cleanPhone;
  const avatarUrl =
    avatar ||
    `https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80`;
  const defaultPassword = `pass_${username}`;

  const insertQuery = `
    INSERT INTO users (username, password, display_name, phone_number, avatar)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, username, display_name, phone_number, avatar, created_at
  `;
  const insertResult = await db.query<SafeUser>(insertQuery, [
    username,
    defaultPassword,
    name,
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
}: {
  email: string;
  displayName?: string;
  avatar?: string;
}): Promise<SafeUser> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Valid email is required');
  }

  const defaultUsername = cleanEmail.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '');
  const checkQuery = `
    SELECT id, username, display_name, phone_number, avatar, created_at
    FROM users
    WHERE username = $1 OR username = $2
  `;
  const existingResult = await db.query<SafeUser>(checkQuery, [cleanEmail, defaultUsername]);
  if (existingResult.rows.length > 0) {
    const user = existingResult.rows[0];
    if (avatar && !user.avatar) {
      await db.query(`UPDATE users SET avatar = $1 WHERE id = $2`, [avatar, user.id]);
      user.avatar = avatar;
    }
    return user;
  }

  const username = defaultUsername || `user_${Date.now()}`;
  const name = displayName && displayName.trim() ? displayName.trim() : username;
  const avatarUrl =
    avatar ||
    `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80`;
  const defaultPassword = `pass_${username}`;

  const insertQuery = `
    INSERT INTO users (username, password, display_name, avatar)
    VALUES ($1, $2, $3, $4)
    RETURNING id, username, display_name, phone_number, avatar, created_at
  `;
  const insertResult = await db.query<SafeUser>(insertQuery, [
    username,
    defaultPassword,
    name,
    avatarUrl,
  ]);
  const newUser = insertResult.rows[0];

  syncEjabberdUser(username, defaultPassword).catch(() => {});
  return newUser;
}

export async function getAllUsers(excludeUsername: string | null = null): Promise<SafeUser[]> {
  let query = `
    SELECT id, username, display_name, phone_number, avatar, created_at
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
  getAllUsers,
  syncEjabberdUser,
};
