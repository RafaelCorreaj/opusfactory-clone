import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { app } from 'electron';

export class CacheService {
  private cacheDir: string;

  constructor() {
    // Pasta de cache dentro dos dados do usuário
    this.cacheDir = path.join(app.getPath('userData'), 'cache');
    this.ensureCacheDir();
  }

  private ensureCacheDir() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
      console.log('📁 Pasta de cache criada:', this.cacheDir);
    }
  }

  /**
   * Gera um hash único para o vídeo baseado no caminho e data de modificação
   */
  private generateVideoHash(videoPath: string): string {
    const stats = fs.statSync(videoPath);
    const data = `${videoPath}_${stats.size}_${stats.mtimeMs}`;
    return crypto.createHash('md5').update(data).digest('hex');
  }

  /**
   * Gera caminho do arquivo de cache para transcrição
   */
  getTranscriptionCachePath(videoPath: string): string {
    const hash = this.generateVideoHash(videoPath);
    return path.join(this.cacheDir, `transcription_${hash}.json`);
  }

  /**
   * Gera caminho do arquivo de cache para análise viral
   */
  getAnalysisCachePath(videoPath: string): string {
    const hash = this.generateVideoHash(videoPath);
    return path.join(this.cacheDir, `analysis_${hash}.json`);
  }

  /**
   * Salva dados no cache
   */
  saveToCache(filePath: string, data: any): void {
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      console.log(`💾 Cache salvo: ${path.basename(filePath)}`);
    } catch (error) {
      console.error('❌ Erro ao salvar cache:', error);
    }
  }

  /**
   * Carrega dados do cache
   */
  loadFromCache(filePath: string): any | null {
    try {
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        console.log(`📦 Cache carregado: ${path.basename(filePath)}`);
        return data;
      }
    } catch (error) {
      console.error('❌ Erro ao carregar cache:', error);
    }
    return null;
  }

  /**
   * Verifica se o vídeo já foi processado
   */
  hasTranscription(videoPath: string): boolean {
    const cachePath = this.getTranscriptionCachePath(videoPath);
    return fs.existsSync(cachePath);
  }

  hasAnalysis(videoPath: string): boolean {
    const cachePath = this.getAnalysisCachePath(videoPath);
    return fs.existsSync(cachePath);
  }
}