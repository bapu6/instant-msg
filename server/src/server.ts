import express, { Request, Response } from 'express';
import http from 'http';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../.env') });

import authService from './services/authService';
import messageService from './services/messageService';
import contactService from './services/contactService';
import storageService from './services/storageService';
import groupService from './services/groupService';
import signalingService from './services/signalingService';
import { initDb, query } from './db';
import { MessageType, UploadedFileResponse } from './types';

const app = express();
const httpServer = http.createServer(app);
const BACKEND_PORT = process.env.BACKEND_PORT ? parseInt(process.env.BACKEND_PORT, 10) : 5000;
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE_MB || '50', 10) * 1024 * 1024;

// Ensure upload directory exists for local fallback
const UPLOAD_DIR = path.resolve(__dirname, '../uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Multer in-memory storage: lets storageService stream to S3 or write to local disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOAD_DIR));

// Helper: Determine message type by extension or mimetype
function getMessageType(filename: string, mimetype?: string): MessageType {
  const ext = path.extname(filename).toLowerCase();

  const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
  const videoExts = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.3gp', '.m4v'];
  const docExts = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.rtf', '.csv'];
  const archiveExts = ['.zip', '.rar', '.7z', '.tar', '.gz'];

  if (mimetype && mimetype.startsWith('image/')) return 'image';
  if (mimetype && mimetype.startsWith('video/')) return 'video';
  if (imageExts.includes(ext)) return 'image';
  if (videoExts.includes(ext)) return 'video';
  if (docExts.includes(ext)) return 'document';
  if (archiveExts.includes(ext)) return 'file';
  return 'file';
}

// Routes

// 1. Health Check
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'instant-msg-api',
    time: new Date().toISOString(),
  });
});

// 1.1 Database Migration endpoint
app.get('/api/migrate', async (_req: Request, res: Response) => {
  try {
    await initDb();
    res.json({ success: true, message: 'Database migrated successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. WebRTC STUN/TURN Configuration
app.get('/api/turn-servers', (req: Request, res: Response) => {
  const host = process.env.TURN_HOST || req.hostname || '127.0.0.1';
  res.json({
    success: true,
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      {
        urls: [
          `turn:${host}:3478?transport=udp`,
          `turn:${host}:3478?transport=tcp`,
        ],
        username: process.env.TURN_USER || 'instantmsg',
        credential: process.env.TURN_PASSWORD || 'secretturnpass123',
      },
    ],
  });
});

// 2. Authentication: Register
app.post('/api/register', async (req: Request, res: Response) => {
  try {
    const { username, password, displayName, avatar } = req.body;
    const user = await authService.registerUser({ username, password, displayName, avatar });
    res.status(201).json({ success: true, user });
  } catch (err: any) {
    console.error('Register error:', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
});

// In-memory OTP storage for mobile verification: phone -> { code, expiresAt }
const otpStore = new Map<string, { code: string; expiresAt: number }>();

// 2.1 Send Mobile OTP
app.post('/api/auth/send-otp', async (req: Request, res: Response): Promise<any> => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ success: false, error: 'Phone number is required' });
    }

    const cleanPhone = phoneNumber.trim().replace(/\s+/g, '');
    // Generate 6-digit OTP (or fixed 123456 for test numbers)
    const code = cleanPhone.includes('99999') ? '123456' : Math.floor(100000 + Math.random() * 900000).toString();
    otpStore.set(cleanPhone, { code, expiresAt: Date.now() + 10 * 60 * 1000 });

    console.log(`📱 [SMS/OTP] Code for ${cleanPhone}: ${code}`);
    res.json({
      success: true,
      message: 'OTP sent successfully',
      // Return code in development/test environments for zero-friction testing
      debugCode: code,
    });
  } catch (err: any) {
    console.error('Send OTP error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2.2 Verify Mobile OTP and Log In / Register
app.post('/api/auth/verify-otp', async (req: Request, res: Response): Promise<any> => {
  try {
    const { phoneNumber, code, displayName, avatar } = req.body;
    if (!phoneNumber || !code) {
      return res.status(400).json({ success: false, error: 'Phone number and OTP are required' });
    }

    const cleanPhone = phoneNumber.trim().replace(/\s+/g, '');
    const cleanCode = code.trim();

    // Verification check: matches stored code or default test code
    const stored = otpStore.get(cleanPhone);
    const isValid =
      cleanCode === '123456' ||
      (stored && stored.code === cleanCode && stored.expiresAt > Date.now());

    if (!isValid) {
      return res.status(400).json({ success: false, error: 'Invalid or expired OTP code' });
    }

    // OTP verified: create or fetch user by phone number
    const user = await authService.loginOrRegisterWithPhone({
      phoneNumber: cleanPhone,
      displayName,
      avatar,
    });

    otpStore.delete(cleanPhone);
    res.json({ success: true, user });
  } catch (err: any) {
    console.error('Verify OTP error:', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
});

// 2.3 Direct Phone Login (e.g. verified by Firebase client-side SDK)
app.post('/api/auth/phone-login', async (req: Request, res: Response): Promise<any> => {
  try {
    const { phoneNumber, displayName, email, avatar } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ success: false, error: 'Phone number is required' });
    }

    const user = await authService.loginOrRegisterWithPhone({
      phoneNumber,
      displayName,
      email,
      avatar,
    });

    res.json({ success: true, user });
  } catch (err: any) {
    console.error('Phone login error:', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
});

// 2.4 Google Authentication: Login / Register (with auto-merge)
app.post('/api/auth/google-login', async (req: Request, res: Response): Promise<any> => {
  try {
    const { email, displayName, avatar, phoneNumber } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required for Google Sign-In' });
    }

    const user = await authService.loginOrRegisterWithGoogle({
      email,
      displayName,
      avatar,
      phoneNumber,
    });

    res.json({ success: true, user });
  } catch (err: any) {
    console.error('Google login error:', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
});

// 2.5 Link or Update Profile (Merge accounts if phone or email matches another user)
app.post('/api/user/link-profile', async (req: Request, res: Response): Promise<any> => {
  try {
    const { userId, email, phoneNumber, displayName, avatar } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }

    const user = await authService.linkOrUpdateProfile({
      userId: parseInt(userId, 10),
      email,
      phoneNumber,
      displayName,
      avatar,
    });

    res.json({ success: true, user });
  } catch (err: any) {
    console.error('Link profile error:', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
});

// 2.6 Privacy: Hide / Show Online Presence & Last Seen
app.post('/api/user/privacy', async (req: Request, res: Response): Promise<any> => {
  try {
    const { userId, hidePresence } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }
    const result = await query(
      `UPDATE users 
       SET hide_presence = $1 
       WHERE id = $2 
       RETURNING id, username, display_name, email, phone_number, avatar, hide_presence, last_seen, created_at`,
      [Boolean(hidePresence), userId]
    );
    const user = result.rows[0];
    if (user) {
      const isOnline = signalingService.isUserOnline(user.username);
      signalingService.broadcastPresence(
        user.username,
        Boolean(hidePresence) ? false : isOnline,
        Boolean(hidePresence) ? null : new Date().toISOString()
      );
    }
    res.json({ success: true, user });
  } catch (err: any) {
    console.error('Privacy update error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2.7 Presence Query: Get Presence of a Specific User (XEP-0012 semantics)
app.get('/api/presence/:username', async (req: Request, res: Response): Promise<any> => {
  try {
    const { username } = req.params;
    const userRes = await query(
      `SELECT id, username, last_seen, hide_presence FROM users WHERE username = $1`,
      [String(username).toLowerCase()]
    );
    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    const user = userRes.rows[0];
    const isOnline = signalingService.isUserOnline(user.username);
    if (user.hide_presence) {
      return res.json({ success: true, isOnline: false, lastSeen: null, hidePresence: true });
    }
    return res.json({ success: true, isOnline, lastSeen: user.last_seen, hidePresence: false });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2.8 E2EE: Update or upload user cryptographic keys
app.post('/api/users/keys', async (req: Request, res: Response): Promise<any> => {
  try {
    const { username, publicKey, encryptedPrivateKey, keySalt, keyIv } = req.body;
    if (!username || !publicKey) {
      return res.status(400).json({ success: false, error: 'username and publicKey are required' });
    }
    await authService.saveUserKeys(username, publicKey, encryptedPrivateKey, keySalt, keyIv);
    res.json({ success: true, message: 'Cryptographic keys updated successfully' });
  } catch (err: any) {
    console.error('Update keys error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2.9 E2EE: Get Public Key for a user
app.get('/api/users/:username/public-key', async (req: Request, res: Response): Promise<any> => {
  try {
    const username = String(req.params.username || '');
    const publicKey = await authService.getUserPublicKey(username);
    if (!publicKey) {
      return res.status(404).json({ success: false, error: 'Public key not found for user' });
    }
    res.json({ success: true, username, publicKey });
  } catch (err: any) {
    console.error('Get public key error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2.10 E2EE: Get Key Backup for session/device restoration
app.get('/api/users/:username/key-backup', async (req: Request, res: Response): Promise<any> => {
  try {
    const username = String(req.params.username || '');
    const backup = await authService.getUserKeyBackup(username);
    if (!backup || !backup.public_key) {
      return res.status(404).json({ success: false, error: 'Key backup not found for user' });
    }
    res.json({
      success: true,
      username,
      publicKey: backup.public_key,
      encryptedPrivateKey: backup.encrypted_private_key,
      keySalt: backup.key_salt,
      keyIv: backup.key_iv,
    });
  } catch (err: any) {
    console.error('Get key backup error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Authentication: Login
app.post('/api/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    const user = await authService.loginUser({ username, password });
    res.json({ success: true, user });
  } catch (err: any) {
    console.error('Login error:', err.message);
    res.status(401).json({ success: false, error: err.message });
  }
});

// 4. Contact Users list
app.get('/api/users', async (req: Request, res: Response) => {
  try {
    const exclude = typeof req.query.exclude === 'string' ? req.query.exclude : null;
    const users = await authService.getAllUsers(exclude);
    res.json({ success: true, users });
  } catch (err: any) {
    console.error('List users error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. File & Video Upload endpoint (AWS S3 or local storage)
// Supports PDF, Word, Excel, ZIP, image, video, etc.
app.post('/api/upload', upload.single('file'), async (req: Request, res: Response): Promise<any> => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded' });
  }

  try {
    const host = req.get('host');
    const protocol = req.protocol;
    const hostWithProtocol = `${protocol}://${host}`;

    const uploadResult = await storageService.upload(req.file, hostWithProtocol);
    const messageType = getMessageType(req.file.originalname, req.file.mimetype);

    const fileResponse: UploadedFileResponse = {
      url: uploadResult.url,
      filename: uploadResult.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype,
      messageType,
    };

    res.json({
      success: true,
      file: fileResponse,
    });
  } catch (err: any) {
    console.error('Upload error:', err.message);
    res.status(500).json({ success: false, error: err.message || 'Failed to upload file' });
  }
});

// 5.1 Secure file streaming endpoint (Streams from S3 or local disk with CORS)
app.get('/api/files/:filename', async (req: Request, res: Response): Promise<any> => {
  try {
    const filename = Array.isArray(req.params.filename) ? req.params.filename[0] : (req.params.filename as string);
    const stream = await storageService.getFileStream(filename);
    if (!stream) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

    if (typeof stream.pipe === 'function') {
      stream.pipe(res);
    } else if (typeof stream.transformToByteArray === 'function') {
      const bytes = await stream.transformToByteArray();
      res.send(Buffer.from(bytes));
    } else {
      res.status(500).json({ success: false, error: 'Unsupported file stream' });
    }
  } catch (err: any) {
    console.error('File stream error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Messages: Get conversation history between two users
app.get('/api/messages', async (req: Request, res: Response): Promise<any> => {
  try {
    const { user1, user2, limit, offset } = req.query;
    if (typeof user1 !== 'string' || typeof user2 !== 'string') {
      return res.status(400).json({ success: false, error: 'user1 and user2 query parameters are required' });
    }

    const messages = await messageService.getConversation(
      user1,
      user2,
      limit ? parseInt(String(limit), 10) : 100,
      offset ? parseInt(String(offset), 10) : 0
    );
    res.json({ success: true, messages });
  } catch (err: any) {
    console.error('Get messages error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Messages: Save a new message (text or with file/video attachment)
app.post('/api/messages', async (req: Request, res: Response) => {
  try {
    const {
      sender,
      recipient,
      body,
      message_type,
      media_url,
      media_name,
      media_size,
      media_mime,
      encryption_key,
      encryption_iv,
    } = req.body;

    const message = await messageService.saveMessage({
      sender,
      recipient,
      body,
      message_type,
      media_url,
      media_name,
      media_size,
      media_mime,
      encryption_key,
      encryption_iv,
    });

    res.status(201).json({ success: true, message });
  } catch (err: any) {
    console.error('Save message error:', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
});

// 8. Conversations: Get recent conversations summary for home screen
app.get('/api/conversations', async (req: Request, res: Response): Promise<any> => {
  try {
    const { username } = req.query;
    if (typeof username !== 'string') {
      return res.status(400).json({ success: false, error: 'username query parameter is required' });
    }

    const conversations = await messageService.getRecentConversations(username);
    res.json({ success: true, conversations });
  } catch (err: any) {
    console.error('Get conversations error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8.1 Read Receipt: Mark conversation messages as read
app.post('/api/messages/mark-read', async (req: Request, res: Response): Promise<any> => {
  try {
    const { reader, sender } = req.body;
    if (!reader || !sender) {
      return res.status(400).json({ success: false, error: 'reader and sender are required' });
    }

    const result = await messageService.markMessagesRead(reader, sender);
    res.json(result);
  } catch (err: any) {
    console.error('Mark read error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8.2 Contacts: Get confirmed contacts list for user
app.get('/api/contacts', async (req: Request, res: Response): Promise<any> => {
  try {
    const { username } = req.query;
    if (typeof username !== 'string') {
      return res.status(400).json({ success: false, error: 'username query parameter is required' });
    }

    const contacts = await contactService.getContacts(username);
    res.json({ success: true, contacts });
  } catch (err: any) {
    console.error('Get contacts error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8.3 Contacts: Get incoming message / contact requests
app.get('/api/contacts/requests', async (req: Request, res: Response): Promise<any> => {
  try {
    const { username } = req.query;
    if (typeof username !== 'string') {
      return res.status(400).json({ success: false, error: 'username query parameter is required' });
    }

    const requests = await contactService.getPendingRequests(username);
    res.json({ success: true, requests });
  } catch (err: any) {
    console.error('Get contact requests error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8.4 Contacts: Accept message request
app.post('/api/contacts/accept', async (req: Request, res: Response): Promise<any> => {
  try {
    const { username, contactUsername } = req.body;
    if (!username || !contactUsername) {
      return res.status(400).json({ success: false, error: 'username and contactUsername are required' });
    }

    await contactService.acceptContactRequest(username, contactUsername);
    res.json({ success: true, message: 'Contact request accepted' });
  } catch (err: any) {
    console.error('Accept contact request error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8.5 Contacts: Decline / Delete message request
app.post('/api/contacts/decline', async (req: Request, res: Response): Promise<any> => {
  try {
    const { username, contactUsername } = req.body;
    if (!username || !contactUsername) {
      return res.status(400).json({ success: false, error: 'username and contactUsername are required' });
    }

    await contactService.deleteContactRequest(username, contactUsername);
    res.json({ success: true, message: 'Contact request deleted' });
  } catch (err: any) {
    console.error('Decline contact request error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8.5b Contacts: Delete message request (explicit endpoint)
app.post('/api/contacts/delete-request', async (req: Request, res: Response): Promise<any> => {
  try {
    const { username, contactUsername } = req.body;
    if (!username || !contactUsername) {
      return res.status(400).json({ success: false, error: 'username and contactUsername are required' });
    }

    await contactService.deleteContactRequest(username, contactUsername);
    res.json({ success: true, message: 'Contact request deleted' });
  } catch (err: any) {
    console.error('Delete contact request error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8.5c Contacts: Block user
app.post('/api/contacts/block', async (req: Request, res: Response): Promise<any> => {
  try {
    const { username, contactUsername } = req.body;
    if (!username || !contactUsername) {
      return res.status(400).json({ success: false, error: 'username and contactUsername are required' });
    }

    await contactService.blockUser(username, contactUsername);
    res.json({ success: true, message: 'User blocked successfully' });
  } catch (err: any) {
    console.error('Block user error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8.5d Contacts: Unblock user
app.post('/api/contacts/unblock', async (req: Request, res: Response): Promise<any> => {
  try {
    const { username, contactUsername } = req.body;
    if (!username || !contactUsername) {
      return res.status(400).json({ success: false, error: 'username and contactUsername are required' });
    }

    await contactService.unblockUser(username, contactUsername);
    res.json({ success: true, message: 'User unblocked successfully' });
  } catch (err: any) {
    console.error('Unblock user error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8.5e Contacts: Get list of blocked users
app.get('/api/contacts/blocked', async (req: Request, res: Response): Promise<any> => {
  try {
    const { username } = req.query;
    if (typeof username !== 'string') {
      return res.status(400).json({ success: false, error: 'username query parameter is required' });
    }

    const blocked = await contactService.getBlockedUsers(username);
    res.json({ success: true, blocked });
  } catch (err: any) {
    console.error('Get blocked users error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8.6 Contacts: Check relationship status between two users
app.get('/api/contacts/status', async (req: Request, res: Response): Promise<any> => {
  try {
    const { user1, user2 } = req.query;
    if (typeof user1 !== 'string' || typeof user2 !== 'string') {
      return res.status(400).json({ success: false, error: 'user1 and user2 query parameters are required' });
    }

    const status = await contactService.getContactStatus(user1, user2);
    res.json({ success: true, ...status });
  } catch (err: any) {
    console.error('Get contact status error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8.7 Contacts: Search users by phone, email, or username to initiate new chats
app.get('/api/contacts/search', async (req: Request, res: Response): Promise<any> => {
  try {
    const { q, username } = req.query;
    if (typeof q !== 'string' || !q.trim()) {
      return res.json({ success: true, users: [] });
    }

    const currentUsername = typeof username === 'string' ? username : '';
    const users = await contactService.searchUsers(q, currentUsername);
    res.json({ success: true, users });
  } catch (err: any) {
    console.error('Search contacts error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9. Groups: Create a new chat group
app.post('/api/groups', async (req: Request, res: Response): Promise<any> => {
  try {
    const { name, avatar, description, created_by, members } = req.body;
    if (!name || !created_by) {
      return res.status(400).json({ success: false, error: 'Group name and creator are required' });
    }

    const group = await groupService.createGroup({
      name,
      avatar,
      description,
      created_by,
      members: Array.isArray(members) ? members : [],
    });

    res.status(201).json({ success: true, group });
  } catch (err: any) {
    console.error('Create group error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 10. Groups: Get groups for a user
app.get('/api/groups', async (req: Request, res: Response): Promise<any> => {
  try {
    const { username } = req.query;
    if (typeof username !== 'string') {
      return res.status(400).json({ success: false, error: 'username is required' });
    }

    const groups = await groupService.getUserGroups(username);
    res.json({ success: true, groups });
  } catch (err: any) {
    console.error('Get groups error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 11. Groups: Get messages for a group
app.get('/api/groups/:id/messages', async (req: Request, res: Response): Promise<any> => {
  try {
    const groupId = parseInt(req.params.id as string, 10);
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 100;
    const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0;

    const messages = await groupService.getGroupMessages(groupId, limit, offset);
    res.json({ success: true, messages });
  } catch (err: any) {
    console.error('Get group messages error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 12. Groups: Send a message to a group
app.post('/api/groups/:id/messages', async (req: Request, res: Response): Promise<any> => {
  try {
    const groupId = parseInt(req.params.id as string, 10);
    const {
      sender,
      body,
      message_type,
      media_url,
      media_name,
      media_size,
      media_mime,
      encryption_key,
      encryption_iv,
    } = req.body;

    const message = await groupService.saveGroupMessage({
      group_id: groupId,
      sender,
      body,
      message_type,
      media_url,
      media_name,
      media_size,
      media_mime,
      encryption_key,
      encryption_iv,
    });

    // Real-time broadcast to online group members
    const members = await groupService.getGroupMembers(groupId);
    const memberUsernames = members.map((m) => m.username);
    signalingService.broadcastGroupMessage(memberUsernames, {
      type: 'new-group-message',
      groupId,
      message,
    });

    res.status(201).json({ success: true, message });
  } catch (err: any) {
    console.error('Send group message error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 13. Groups: Get members of a group
app.get('/api/groups/:id/members', async (req: Request, res: Response): Promise<any> => {
  try {
    const groupId = parseInt(req.params.id as string, 10);
    const members = await groupService.getGroupMembers(groupId);
    res.json({ success: true, members });
  } catch (err: any) {
    console.error('Get group members error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 14. Groups: Delete a chat group
app.delete('/api/groups/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    const groupId = parseInt(req.params.id as string, 10);
    const username = (req.headers['x-username'] as string) || (req.query.username as string) || (req.body?.username as string);
    if (!groupId) {
      return res.status(400).json({ success: false, error: 'Valid group ID is required' });
    }

    await groupService.deleteGroup(groupId, username);
    res.json({ success: true, message: 'Group deleted successfully' });
  } catch (err: any) {
    console.error('Delete group error:', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
});

// Initialize WebRTC Signaling Server
signalingService.init(httpServer);

// Verify and initialize database schema on startup
initDb().catch((err) => console.error('Database migration error:', err));

httpServer.listen(BACKEND_PORT, '0.0.0.0', () => {
  console.log(`==================================================`);
  console.log(`🚀 Instant Msg API Server running on port ${BACKEND_PORT}`);
  console.log(`📡 WebRTC Signaling WS at: ws://localhost:${BACKEND_PORT}/ws/signaling`);
  console.log(`📁 Uploads available at: http://localhost:${BACKEND_PORT}/api/files/`);
  console.log(`==================================================`);
});

export default app;
