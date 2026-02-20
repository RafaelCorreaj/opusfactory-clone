import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';

export interface VideoRecord {
  id?: number;
  path: string;
  name: string;
  duration: number;
  size: number;
  status: string;
  created_at?: string;
}

export interface ClipRecord {
  id?: number;
  video_id: number;
  start_time: number;
  end_time: number;
  reason: string;
  output_path: string;
  semantic_score?: number;
  emotional_score?: number;
  narrative_score?: number;
  combined_score?: number;
  created_at?: string;
}

export class DatabaseService {
  private db: Database.Database;

  constructor() {
    const dbPath = path.join(app.getPath('userData'), 'opusfactory.db');
    this.db = new Database(dbPath);
    this.initialize();
  }

  private initialize() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS videos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        duration REAL NOT NULL,
        size INTEGER NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS clips (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        video_id INTEGER NOT NULL,
        start_time REAL NOT NULL,
        end_time REAL NOT NULL,
        reason TEXT,
        thumbnail_path TEXT,
        output_path TEXT NOT NULL,
        semantic_score REAL DEFAULT 0,
        emotional_score REAL DEFAULT 0,
        narrative_score REAL DEFAULT 0,
        combined_score REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE CASCADE
      )
    `);

        this.db.exec(`
    CREATE TABLE IF NOT EXISTS queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      progress REAL DEFAULT 0,
      error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE CASCADE
    )
  `);

      this.db.exec(`
    CREATE TABLE IF NOT EXISTS queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      progress REAL DEFAULT 0,
      error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE CASCADE
    )
  `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);

    console.log('✅ Banco de dados inicializado em:', app.getPath('userData'));
  }

  // ===== MÉTODOS PARA VÍDEOS =====
  saveVideo(video: Omit<VideoRecord, 'id' | 'created_at'>): number {
    const existing = this.getVideoByPath(video.path);
    if (existing) {
    console.log('📹 Vídeo já existe, retornando ID:', existing.id);
    return existing.id!;
    }
    const stmt = this.db.prepare(`
      INSERT INTO videos (path, name, duration, size, status)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(video.path, video.name, video.duration, video.size, video.status);
    console.log('📹 Novo vídeo inserido com ID:', result.lastInsertRowid);
    return result.lastInsertRowid as number;
  }

  getVideoByPath(path: string): VideoRecord | null {
    const stmt = this.db.prepare('SELECT * FROM videos WHERE path = ?');
    return stmt.get(path) as VideoRecord | null;
  }

  getVideoById(id: number): VideoRecord | null {
  const stmt = this.db.prepare('SELECT * FROM videos WHERE id = ?');
  return stmt.get(id) as VideoRecord | null;
}

  getAllVideos(): VideoRecord[] {
    const stmt = this.db.prepare('SELECT * FROM videos ORDER BY created_at DESC');
    return stmt.all() as VideoRecord[];
  }

  updateVideoStatus(id: number, status: string) {
    const stmt = this.db.prepare('UPDATE videos SET status = ? WHERE id = ?');
    stmt.run(status, id);
  }

  // ===== MÉTODOS PARA CLIPES =====
  saveClip(clip: Omit<ClipRecord, 'id' | 'created_at'>): number {
    const stmt = this.db.prepare(`
      INSERT INTO clips 
      (video_id, start_time, end_time, reason, output_path, semantic_score, emotional_score, narrative_score, combined_score)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      clip.video_id,
      clip.start_time,
      clip.end_time,
      clip.reason,
      clip.output_path,
      clip.semantic_score || 0,
      clip.emotional_score || 0,
      clip.narrative_score || 0,
      clip.combined_score || 0
    );
    return result.lastInsertRowid as number;
  }

  getClipsByVideoId(videoId: number): ClipRecord[] {
    const stmt = this.db.prepare('SELECT * FROM clips WHERE video_id = ? ORDER BY start_time');
    return stmt.all(videoId) as ClipRecord[];
  }

  getAllClips(): ClipRecord[] {
    const stmt = this.db.prepare('SELECT * FROM clips ORDER BY created_at DESC');
    return stmt.all() as ClipRecord[];
  }

  // Adicione este método temporariamente
  migrateThumbnailPaths() {
  const clips = this.getAllClips();
  const stmt = this.db.prepare('UPDATE clips SET thumbnail_path = ? WHERE id = ?');
  
  clips.forEach(clip => {
    // Constrói o caminho esperado baseado no output_path
    if (clip.output_path) {
      const basePath = clip.output_path.substring(0, clip.output_path.lastIndexOf('\\'));
      const fileName = clip.output_path.split('\\').pop()?.replace('.mp4', '.jpg');
      const thumbnailPath = `${basePath}\\thumbnails\\${fileName}`.replace(/\\/g, '/');
      
      stmt.run(thumbnailPath, clip.id);
      console.log(`✅ Migrado thumbnail do clipe ${clip.id}: ${thumbnailPath}`);
    }
  });
}

  // ===== MÉTODOS PARA CONFIGURAÇÕES =====
  getSetting(key: string): string | null {
    const stmt = this.db.prepare('SELECT value FROM settings WHERE key = ?');
    const result = stmt.get(key) as { value: string } | undefined;
    return result?.value || null;
  }

  setSetting(key: string, value: string) {
    const stmt = this.db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    stmt.run(key, value);
  }

  // ===== MÉTODOS PARA FILA =====
addToQueue(videoId: number): number {
  const stmt = this.db.prepare('INSERT INTO queue (video_id) VALUES (?)');
  const result = stmt.run(videoId);
  return result.lastInsertRowid as number;
}

updateQueueItem(id: number, status: string, progress?: number, error?: string) {
  const stmt = this.db.prepare(`
    UPDATE queue SET status = ?, progress = ?, error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `);
  stmt.run(status, progress || 0, error || null, id);
}

getPendingQueueItems(limit: number = 3): any[] {
  const stmt = this.db.prepare(`
    SELECT * FROM queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?
  `);
  return stmt.all(limit);
}

getQueueStatus(): any[] {
  const stmt = this.db.prepare(`
    SELECT q.*, v.name as video_name, v.path as video_path 
    FROM queue q
    JOIN videos v ON q.video_id = v.id
    ORDER BY q.created_at DESC
  `);
  return stmt.all();
}

  close() {
    this.db.close();
  }
}