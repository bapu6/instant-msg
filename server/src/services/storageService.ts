import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export interface StorageUploadResult {
  url: string;
  filename: string;
}

class StorageService {
  private s3Client: S3Client | null = null;
  private bucket: string = '';
  private region: string = 'eu-central-1';
  private publicUrlBase: string = '';
  private isS3Enabled: boolean = false;
  private localUploadDir: string;

  constructor() {
    this.localUploadDir = path.resolve(__dirname, '../../uploads');
    if (!fs.existsSync(this.localUploadDir)) {
      fs.mkdirSync(this.localUploadDir, { recursive: true });
    }
    this.init();
  }

  private init() {
    this.bucket = process.env.AWS_S3_BUCKET || '';
    this.region = process.env.AWS_REGION || 'eu-central-1';
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID || '';
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || '';
    const endpoint = process.env.AWS_S3_ENDPOINT; // Optional (e.g. for Cloudflare R2 or MinIO)
    this.publicUrlBase = process.env.AWS_S3_PUBLIC_URL || '';

    const provider = (process.env.STORAGE_PROVIDER || '').toLowerCase();
    const shouldEnableS3 = provider === 's3' || (this.bucket && accessKeyId && secretAccessKey);

    if (shouldEnableS3 && this.bucket) {
      this.s3Client = new S3Client({
        region: this.region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
        ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
      });
      this.isS3Enabled = true;
      console.log(`[StorageService] S3 storage initialized for bucket "${this.bucket}" in region "${this.region}"`);
    } else {
      this.isS3Enabled = false;
      console.log(`[StorageService] Using local disk storage at ${this.localUploadDir}`);
    }
  }

  public getIsS3Enabled(): boolean {
    return this.isS3Enabled;
  }

  /**
   * Uploads a multer file (either from buffer or local disk) to S3 or local storage
   */
  public async upload(file: Express.Multer.File, hostWithProtocol?: string): Promise<StorageUploadResult> {
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const filename = `${baseName}-${uniqueSuffix}${ext}`;

    if (this.isS3Enabled && this.s3Client) {
      // Determine file buffer
      let buffer: Buffer;
      if (file.buffer) {
        buffer = file.buffer;
      } else if (file.path) {
        buffer = fs.readFileSync(file.path);
        // Clean up temporary local file if created by multer diskStorage
        try {
          fs.unlinkSync(file.path);
        } catch {
          // ignore cleanup errors
        }
      } else {
        throw new Error('File buffer or path not found');
      }

      const key = `uploads/${filename}`;
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: file.mimetype,
      });

      await this.s3Client.send(command);

      const baseUrl = hostWithProtocol || 'http://localhost:5000';
      const fileUrl = `${baseUrl.replace(/\/+$/, '')}/api/files/${filename}`;

      return {
        url: fileUrl,
        filename,
      };
    }

    // Fallback: local disk storage
    let finalPath = path.join(this.localUploadDir, filename);
    if (file.buffer) {
      fs.writeFileSync(finalPath, file.buffer);
    } else if (file.path && file.path !== finalPath) {
      fs.renameSync(file.path, finalPath);
    }

    const baseUrl = hostWithProtocol || 'http://localhost:5000';
    const localUrl = `${baseUrl.replace(/\/+$/, '')}/api/files/${filename}`;

    return {
      url: localUrl,
      filename,
    };
  }

  /**
   * Retrieves a readable stream for a file from S3 or local storage
   */
  public async getFileStream(filename: string): Promise<any> {
    if (this.isS3Enabled && this.s3Client) {
      try {
        const key = `uploads/${filename}`;
        const command = new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        });
        const response = await this.s3Client.send(command);
        return response.Body;
      } catch (err: any) {
        console.warn(`[StorageService] S3 get error for ${filename}:`, err.message);
      }
    }

    const localPath = path.join(this.localUploadDir, filename);
    if (fs.existsSync(localPath)) {
      return fs.createReadStream(localPath);
    }
    return null;
  }
}

export default new StorageService();
