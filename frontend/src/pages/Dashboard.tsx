import React, { useState, useEffect, useMemo } from 'react';
import '../App.css';
import { useApp } from '../contexts/AppContext';
import { OpenAIService } from '../services/openai';
import { useSettings } from '../contexts/SettingsContext';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface VideoInfo {
  path: string;
  name: string;
  duration: number;
  size: number;
  status: 'pending' | 'processing' | 'processed' | 'error' | 'queued';
  progress?: number;
  error?: string;
}

interface ClipInfo {
  videoName: string;
  start: number;
  end: number;
  reason: string;
  outputPath: string;
  thumbnailPath?: string;
  scores?: {
    semantic: number;
    emotional: number;
    narrative: number;
  };
}

interface QueueItem {
  id: number;
  video_id: number;
  status: string;
  progress: number;
  error: string | null;
}

declare global {
  interface Window {
    electron?: {
      selectVideos: () => Promise<string[]>;
      readFile: (path: string) => Promise<Buffer>;
      getVideosPath: () => Promise<string>;
      ffmpeg: {
        getDuration: (path: string) => Promise<number>;
        extractAudio: (path: string) => Promise<string>;
        getFileSize: (path: string) => Promise<number>;
        getMetadata: (path: string) => Promise<any>;
        cutClip: (path: string, start: number, end: number, outputPath: string) => Promise<string>;
        generateThumbnail: (path: string, time: number, outputPath: string) => Promise<string>;
        onProgress: (callback: (progress: number) => void) => void;
      };
      db: {
        saveVideo: (video: any) => Promise<number>;
        saveClip: (clip: any) => Promise<number>;
        getHistory: () => Promise<any>;
        getClipsByVideo: (videoId: number) => Promise<any[]>;
      };
    };
  }
}

const formatDuration = (seconds: number): string => {
  if (!seconds || isNaN(seconds)) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const Dashboard: React.FC = () => {
  const { settings } = useSettings();
  const { videos, setVideos, clips, setClips, isProcessing, setIsProcessing } = useApp();
  
  // Estados
  const [videosPath, setVideosPath] = useState('');
  const [thumbnailsPath, setThumbnailsPath] = useState('');
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [scoreDistribution, setScoreDistribution] = useState<any[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [previewClip, setPreviewClip] = useState<ClipInfo | null>(null);

  // Cria o serviço OpenAI apenas se houver chave e não estiver no modo mock
  const openAIService = useMemo(() => {
    if (settings.openAIKey && !settings.useMock) {
      return new OpenAIService(settings.openAIKey);
    }
    return null;
  }, [settings.openAIKey, settings.useMock]);

    // Carregar caminhos das pastas
    useEffect(() => {
      const loadPaths = async () => {
        try {
          const basePath = await window.electron.getVideosPath();
          console.log('📁 Base path:', basePath);
          setVideosPath(basePath);
          setThumbnailsPath(`${basePath}/thumbnails`);
        } catch (error) {
          console.error('Erro ao obter caminho de vídeos:', error);
          
          // Fallback DINÂMICO via Electron
          try {
            const homeDir = await window.electron.getHomeDir();
            const fallback = `${homeDir.replace(/\\/g, '/')}/Videos`;
            console.log('📁 Fallback dinâmico:', fallback);
            setVideosPath(fallback);
            setThumbnailsPath(`${fallback}/thumbnails`);
          } catch (homeError) {
            console.error('Erro ao obter home dir:', homeError);
            // Último recurso
            setVideosPath('C:/Users/Rafael/Videos');
            setThumbnailsPath('C:/Users/Rafael/Videos/thumbnails');
          }
        }
      };
      loadPaths();
    }, []);

// Carregar vídeos e clipes do banco ao iniciar
useEffect(() => {
  const loadInitialData = async () => {
    try {
      const history = await window.electron.db.getHistory();
      
      console.log('📦 Dados brutos do banco:', history);
      console.log('📦 thumbnails_path nos clipes:', history.clips.map((c: any) => c.thumbnail_path));
      
      // Converte os dados do banco para o formato do Dashboard
      const loadedVideos = history.videos.map((v: any) => ({
        path: v.path,
        name: v.name,
        duration: v.duration,
        size: v.size,
        status: v.status,
        progress: 100
      }));
      
      const loadedClips = history.clips.map((c: any) => ({
        videoName: history.videos.find((v: any) => v.id === c.video_id)?.name || '',
        start: c.start_time,
        end: c.end_time,
        reason: c.reason,
        outputPath: c.output_path,
        // 👇 NORMALIZA O CAMINHO
        thumbnailPath: c.thumbnail_path?.replace(/\\/g, '/'),
        scores: {
          semantic: c.semantic_score,
          emotional: c.emotional_score,
          narrative: c.narrative_score
        }
      }));

      console.log('🎬 loadedClips após conversão:', loadedClips.map(c => ({
        videoName: c.videoName,
        thumbnailPath: c.thumbnailPath
      })));

      setVideos(loadedVideos);
      setClips(loadedClips);
      
      console.log('📊 Dados carregados do banco:', { videos: loadedVideos.length, clips: loadedClips.length });
    } catch (error) {
      console.error('❌ Erro ao carregar dados iniciais:', error);
    }
  };

  loadInitialData();
}, [setVideos, setClips]);

  // ========== ESTATÍSTICAS ==========
  const stats = {
    totalVideos: videos.length,
    processedVideos: videos.filter(v => v.status === 'processed').length,
    totalClips: clips.length,
    avgScore: clips.length > 0 
      ? (clips.reduce((acc, c) => {
          const avg = c.scores ? (c.scores.semantic + c.scores.emotional + c.scores.narrative) / 3 : 0;
          return acc + avg;
        }, 0) / clips.length).toFixed(2)
      : '0.00'
  };

  // ========== HANDLERS ==========
  const handleSelectVideos = async () => {
    try {
      if (!window.electron) {
        alert('Electron não disponível');
        return;
      }

      const selected = await window.electron.selectVideos();
      
      if (selected && selected.length > 0) {
        const videoDetails = await Promise.all(
          selected.map(async (path: string) => {
            try {
              const [duration, fileSize] = await Promise.all([
                window.electron.ffmpeg.getDuration(path),
                window.electron.ffmpeg.getFileSize(path)
              ]);
              
              return {
                path,
                name: path.split('\\').pop() || path,
                duration: duration || 0,
                size: fileSize || 0,
                status: 'queued' as const,
                progress: 0
              };
            } catch (error) {
              console.error('Erro ao processar vídeo:', path, error);
              return {
                path,
                name: path.split('\\').pop() || path,
                duration: 0,
                size: 0,
                status: 'error' as const,
                error: 'Falha ao ler vídeo'
              };
            }
          })
        );
        
        setVideos(prev => [...prev, ...videoDetails]);
      }
    } catch (error) {
      console.error('Erro geral:', error);
    }
  };

  const handleProcessVideos = async () => {
    try {
      if (videos.length === 0) return;

      // Verifica se é modo real e se há serviço OpenAI disponível
      if (settings.selectedMode === 'openai' && !settings.useMock && !openAIService) {
        alert('Chave da OpenAI não configurada ou inválida. Vá para Configurações.');
        return;
      }

      console.log(`🎬 Iniciando processamento em modo: ${settings.useMock ? 'MOCK' : 'REAL'}`);
      setIsProcessing(true);
      setClips([]);

      for (let i = 0; i < videos.length; i++) {
        const video = videos[i];

        setVideos(prev => prev.map((v, idx) => idx === i ? { ...v, status: 'processing' } : v));

        try {
          let transcription = '';
          let analysis: any = {};

          if (settings.useMock) {
            // ===== MODO MOCK =====
            console.log('🧪 Usando MOCK local (sem API)');
            const audioPath = await window.electron.ffmpeg.extractAudio(video.path);
            console.log('✅ Áudio extraído (mock):', audioPath);
            await new Promise(resolve => setTimeout(resolve, 1000));
            transcription = "Este é um texto simulado para teste local. Não foi usado OpenAI.";
            console.log('📝 Transcrição MOCK:', transcription);
            await new Promise(resolve => setTimeout(resolve, 1000));
            analysis = {
              highlights: [
                { start: 5, end: 20, reason: "momento importante (mock)", scores: { semantic: 0.8, emotional: 0.7, narrative: 0.6 } },
                { start: 30, end: 45, reason: "dica relevante (mock)", scores: { semantic: 0.9, emotional: 0.6, narrative: 0.7 } }
              ],
              keywords: ["teste", "local", "mock"],
              sentiment: "neutro"
            };
            console.log('📊 Análise MOCK:', analysis);
          } else {
            // ===== MODO REAL COM API =====
            if (!openAIService) throw new Error('OpenAI não configurado');

            console.log('🎵 Extraindo áudio de:', video.name);
            const audioPath = await window.electron.ffmpeg.extractAudio(video.path);
            const audioBuffer = await window.electron.readFile(audioPath);
            const audioFile = new File([audioBuffer], 'audio.mp3', { type: 'audio/mp3' });

            console.log('🤖 Transcrevendo com Whisper...');
            transcription = await openAIService.transcribeAudio(audioFile);
            console.log('📝 Transcrição:', transcription);

            console.log('🔍 Analisando com GPT...');
            analysis = await openAIService.analyzeTranscript(transcription);
            console.log('📊 Análise completa:', analysis);
          }

          // Extrair highlights
          const highlights = analysis?.highlights || [];
          console.log('🎯 Highlights extraídos:', highlights);

          // Ordenar e selecionar top 5
          const sortedHighlights = highlights.sort((a: any, b: any) => {
            const scoreA = (a.scores?.semantic + a.scores?.emotional + a.scores?.narrative) / 3;
            const scoreB = (b.scores?.semantic + b.scores?.emotional + b.scores?.narrative) / 3;
            return scoreB - scoreA;
          });

          const topHighlights = sortedHighlights.slice(0, 5);

          if (topHighlights.length > 0) {
            const novosClips = [];

            for (let j = 0; j < topHighlights.length; j++) {
              const highlight = topHighlights[j];
              const videoName = video?.name || 'video';
              const safeName = videoName.replace(/\.[^/.]+$/, '') || 'clip';
             
              // ✅ CAMINHOS DINÂMICOS (baseados no usuário)
              const clipPath = `${videosPath}/${safeName}_clip_${j+1}.mp4`;
              const thumbnailPath = `${videosPath}/thumbnails/${safeName}_clip_${j+1}.jpg`.replace(/\\/g, '/');

              console.log(`📁 clipPath: ${clipPath}`);
              console.log(`📁 thumbnailPath: ${thumbnailPath}`);

              console.log(`✂️ Gerando clipe ${j+1} de ${highlight.start}s a ${highlight.end}s...`);
              await window.electron.ffmpeg.cutClip(video.path, highlight.start, highlight.end, clipPath);
              console.log(`✅ Clipe salvo: ${clipPath}`);

              // Antes de salvar o vídeo
              let videoId;
              const existingVideo = await window.electron.db.getVideoByPath(video.path);

              if (existingVideo) {
                videoId = existingVideo.id;
                console.log('📹 Vídeo já existe, usando ID:', videoId);
              } else {
                videoId = await window.electron.db.saveVideo({
                  path: video.path,
                  name: video.name,
                  duration: video.duration,
                  size: video.size,
                  status: 'processed'
                });
                console.log('📹 Novo vídeo salvo com ID:', videoId);
              }
              
              // Gerar thumbnail com timestamp válido
              const thumbnailTime = Math.min(
                (highlight.start + highlight.end) / 2,
                video.duration - 0.1
              );
              await window.electron.ffmpeg.generateThumbnail(video.path, thumbnailTime, thumbnailPath);
              console.log(`🖼️ Thumbnail salva: ${thumbnailPath}`);

              // Atualizar estado
              setClips(prev => [...prev, {
                videoName: video.name,
                start: highlight.start,
                end: highlight.end,
                reason: highlight.reason,
                outputPath: clipPath,
                thumbnailPath: thumbnailPath,
                scores: highlight.scores
              }]);

              novosClips.push({
                start: highlight.start,
                end: highlight.end,
                reason: highlight.reason,
                outputPath: clipPath,
                thumbnailPath: thumbnailPath,
                scores: highlight.scores
              });
            }

            // Salvar no banco (modo real)
            if (!settings.useMock) {
              try {
                const videoId = await window.electron.db.saveVideo({
                  path: video.path,
                  name: video.name,
                  duration: video.duration,
                  size: video.size,
                  status: 'processed'
                });
                console.log('📹 Vídeo salvo/recuperado com ID:', videoId);

                for (const clip of novosClips) {
                  console.log('💾 Salvando clipe com thumbnail:', clip.thumbnailPath);
                  await window.electron.db.saveClip({
                    video_id: videoId,
                    start_time: clip.start,
                    end_time: clip.end,
                    reason: clip.reason,
                    output_path: clip.outputPath,
                    thumbnail_path: clip.thumbnailPath,
                    semantic_score: clip.scores?.semantic || 0,
                    emotional_score: clip.scores?.emotional || 0,
                    narrative_score: clip.scores?.narrative || 0,
                    combined_score: (clip.scores?.semantic + clip.scores?.emotional + clip.scores?.narrative) / 3 || 0
                  });
                }
                console.log('💾 Dados salvos no banco!');
              } catch (dbError) {
                console.error('Erro ao salvar no banco:', dbError);
              }
            }
          } else {
            console.log('⚠️ Nenhum highlight encontrado na análise');
          }

          setVideos(prev => prev.map((v, idx) => idx === i ? { ...v, status: 'processed' } : v));

        } catch (videoError) {
          console.error(`❌ Erro no vídeo ${video.name}:`, videoError);
          setVideos(prev => prev.map((v, idx) => idx === i ? { ...v, status: 'error' } : v));
        }
      }

      setIsProcessing(false);
      alert(`✅ Processamento ${settings.useMock ? 'MOCK' : 'REAL'} concluído! ${clips.length} clipe(s) gerado(s).`);

    } catch (error) {
      console.error('❌ Erro geral:', error);
      setIsProcessing(false);
    }
  };

  const handleRemoveVideo = (indexToRemove: number) => {
    setVideos(videos.filter((_, i) => i !== indexToRemove));
  };

  const getStatusIcon = (status: string) => {
    switch(status) {
      case 'processed': return '✅';
      case 'processing': return '⚙️';
      case 'queued': return '⏳';
      case 'error': return '❌';
      default: return '⏳';
    }
  };

  // ========== RENDER ==========
  return (
    <div className="main-card">
      <header className="app-header">
        <h1 className="app-title">OpusFactory</h1>
        <p className="app-subtitle">Clone do OpusClip com IA</p>
      </header>

      {/* Cards de estatísticas */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(4, 1fr)', 
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div style={{
          backgroundColor: '#1E293B',
          padding: '16px',
          borderRadius: '12px',
          border: '1px solid #334155'
        }}>
          <div style={{ color: '#94A3B8', fontSize: '14px' }}>Total de vídeos</div>
          <div style={{ color: '#F1F5F9', fontSize: '28px', fontWeight: 600 }}>{stats.totalVideos}</div>
        </div>
        <div style={{
          backgroundColor: '#1E293B',
          padding: '16px',
          borderRadius: '12px',
          border: '1px solid #334155'
        }}>
          <div style={{ color: '#94A3B8', fontSize: '14px' }}>Processados</div>
          <div style={{ color: '#F1F5F9', fontSize: '28px', fontWeight: 600 }}>{stats.processedVideos}</div>
        </div>
        <div style={{
          backgroundColor: '#1E293B',
          padding: '16px',
          borderRadius: '12px',
          border: '1px solid #334155'
        }}>
          <div style={{ color: '#94A3B8', fontSize: '14px' }}>Clipes gerados</div>
          <div style={{ color: '#F1F5F9', fontSize: '28px', fontWeight: 600 }}>{stats.totalClips}</div>
        </div>
        <div style={{
          backgroundColor: '#1E293B',
          padding: '16px',
          borderRadius: '12px',
          border: '1px solid #334155'
        }}>
          <div style={{ color: '#94A3B8', fontSize: '14px' }}>Score médio</div>
          <div style={{ color: '#F1F5F9', fontSize: '28px', fontWeight: 600 }}>{stats.avgScore}</div>
        </div>
      </div>
      
      {/* Gráficos */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
        <div style={{ backgroundColor: '#1E293B', borderRadius: '12px', padding: '16px', border: '1px solid #334155' }}>
          <h4 style={{ color: '#F1F5F9', marginBottom: '16px' }}>Atividade nos últimos 7 dias</h4>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={historyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" tick={{ fill: '#94A3B8' }} />
              <YAxis tick={{ fill: '#94A3B8' }} />
              <Tooltip contentStyle={{ backgroundColor: '#0F172A', border: '1px solid #334155' }} />
              <Legend />
              <Line type="monotone" dataKey="videos" stroke="#3B82F6" name="Vídeos" />
              <Line type="monotone" dataKey="clips" stroke="#10B981" name="Clipes" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div style={{ backgroundColor: '#1E293B', borderRadius: '12px', padding: '16px', border: '1px solid #334155' }}>
          <h4 style={{ color: '#F1F5F9', marginBottom: '16px' }}>Distribuição de Scores</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={scoreDistribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="range" tick={{ fill: '#94A3B8' }} />
              <YAxis tick={{ fill: '#94A3B8' }} />
              <Tooltip contentStyle={{ backgroundColor: '#0F172A', border: '1px solid #334155' }} />
              <Bar dataKey="count" fill="#3B82F6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Botão Selecionar Vídeos - SEMPRE VISÍVEL */}
      <button 
        className="primary-button" 
        onClick={handleSelectVideos}
        style={{ marginBottom: '24px' }}
      >
        <span>📂</span>
        Selecionar Vídeos
      </button>
      
      {/* Fila de processamento (só aparece se houver vídeos) */}
      {videos.length > 0 && (
        <>
          <h3 style={{ color: '#F1F5F9', marginBottom: '16px' }}>📋 Fila de processamento</h3>
          <div style={{ 
            backgroundColor: '#0F172A',
            borderRadius: '16px',
            padding: '16px',
            border: '1px solid #334155',
            marginBottom: '24px'
          }}>
            {videos.map((video, index) => (
              <div
                key={index}
                style={{
                  backgroundColor: '#1E293B',
                  borderRadius: '8px',
                  padding: '16px',
                  marginBottom: '8px',
                  border: '1px solid #334155'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '24px' }}>{getStatusIcon(video.status)}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#F1F5F9', fontWeight: 500 }}>{video.name}</div>
                    <div style={{ display: 'flex', gap: '20px', color: '#94A3B8', fontSize: '13px' }}>
                      <span>📦 {formatFileSize(video.size)}</span>
                      <span>⏱️ {formatDuration(video.duration)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveVideo(index)}
                    disabled={video.status === 'processing'}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: video.status === 'processing' ? '#4B5563' : '#EF4444',
                      fontSize: '20px',
                      cursor: video.status === 'processing' ? 'not-allowed' : 'pointer'
                    }}
                  >
                    🗑️
                  </button>
                </div>
                
                {/* Barra de progresso */}
                {video.status === 'processing' && (
                  <div style={{ marginTop: '12px' }}>
                    <div style={{ height: '6px', backgroundColor: '#0F172A', borderRadius: '3px' }}>
                      <div style={{
                        width: `${video.progress || 0}%`,
                        height: '100%',
                        backgroundColor: '#3B82F6',
                        borderRadius: '3px',
                        transition: 'width 0.3s'
                      }} />
                    </div>
                  </div>
                )}

                {/* Mensagem de erro */}
                {video.error && (
                  <div style={{ marginTop: '8px', color: '#EF4444', fontSize: '13px' }}>
                    ❌ {video.error}
                  </div>
                )}
              </div>
            ))}

            {/* Botão de processar */}
            <button
              onClick={handleProcessVideos}
              disabled={isProcessing || videos.length === 0}
              style={{
                width: '100%',
                height: '48px',
                backgroundColor: isProcessing ? '#4B5563' : '#10B981',
                border: 'none',
                borderRadius: '8px',
                color: 'white',
                fontSize: '15px',
                fontWeight: 600,
                marginTop: '16px',
                cursor: isProcessing ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <span>{isProcessing ? '⚙️' : '▶️'}</span>
              {isProcessing ? 'Processando...' : 'Iniciar Processamento'}
            </button>
          </div>
        </>
      )}

      {/* Últimos clipes gerados */}
      {clips.length > 0 && (
        <div>
          <h3 style={{ color: '#F1F5F9', marginBottom: '16px' }}>🔥 Últimos clipes gerados</h3>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', 
            gap: '16px' 
          }}>
            {clips.slice(0, 6).map((clip, index) => (
              <div
                key={index}
                onClick={() => setPreviewClip(clip)}
                style={{
                  backgroundColor: '#1E293B',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  border: '1px solid #334155',
                  position: 'relative',
                  transition: 'transform 0.2s',
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.05)';
                  e.currentTarget.style.zIndex = '10';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.zIndex = '1';
                }}
              >
                
              {clip.thumbnailPath ? (
                <img 
                  src={`video://${encodeURIComponent(clip.thumbnailPath)}`}
                  alt="thumbnail"
                  style={{ width: '100%', height: '112px', objectFit: 'cover' }}
                  onError={(e) => {
                    console.error('❌ Erro thumbnail no Dashboard:', clip.thumbnailPath);
                    e.currentTarget.style.display = 'none';
                    const parent = e.currentTarget.parentElement;
                    if (parent) {
                      parent.style.background = 'linear-gradient(135deg, #3B82F6, #1E293B)';
                      parent.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:112px;font-size:48px;">🎬</div>';
                    }
                  }}
                />
              ) : (
                <div style={{
                  height: '112px',
                  background: 'linear-gradient(135deg, #3B82F6, #1E293B)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '32px'
                }}>
                  🎬
                </div>
              )}
                
                <div style={{ padding: '12px' }}>
                  <div style={{ color: '#94A3B8', fontSize: '12px' }}>
                    {clip.videoName.substring(0, 30)}...
                  </div>
                  <div style={{ color: '#F1F5F9', fontSize: '13px', marginTop: '4px' }}>
                    {clip.start}s - {clip.end}s
                  </div>
                  {clip.scores && (
                    <div style={{ 
                      display: 'flex', 
                      gap: '4px', 
                      marginTop: '8px',
                      fontSize: '11px',
                      color: '#94A3B8'
                    }}>
                      <span>🧠 {(clip.scores.semantic * 100).toFixed(0)}%</span>
                      <span>❤️ {(clip.scores.emotional * 100).toFixed(0)}%</span>
                      <span>📖 {(clip.scores.narrative * 100).toFixed(0)}%</span>
                    </div>
                  )}
                </div>

                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  backgroundColor: 'rgba(0,0,0,0.7)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: 0,
                  transition: 'opacity 0.2s',
                  pointerEvents: 'none'
                }}>
                  <span style={{ color: 'white', fontSize: '14px' }}>Clique para pré-visualizar</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal de preview */}
      {previewClip && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(0,0,0,0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}
        onClick={() => setPreviewClip(null)}
        >
          <div style={{
            width: '80%',
            maxWidth: '800px',
            backgroundColor: '#1E293B',
            borderRadius: '16px',
            padding: '24px',
            border: '1px solid #334155'
          }}
          onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ color: '#F1F5F9', marginBottom: '16px' }}>Pré-visualização</h3>
            
            <video 
              src={`video://${previewClip.outputPath}`}
              controls
              style={{ width: '100%', borderRadius: '8px', marginBottom: '16px' }}
            />
            
            <div style={{ color: '#94A3B8', marginBottom: '8px' }}>
              {previewClip.videoName} - {previewClip.start}s a {previewClip.end}s
            </div>
            
            <p style={{ color: '#F1F5F9', marginBottom: '16px' }}>
              {previewClip.reason}
            </p>
            
            <button
              onClick={() => setPreviewClip(null)}
              style={{
                padding: '8px 16px',
                backgroundColor: '#3B82F6',
                border: 'none',
                borderRadius: '6px',
                color: 'white',
                cursor: 'pointer'
              }}
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;