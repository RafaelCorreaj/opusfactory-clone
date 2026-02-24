import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import '../App.css';
import { useApp } from '../contexts/AppContext';
import { OpenAIService } from '../services/openai';
import { useSettings } from '../contexts/SettingsContext';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// ========== INTERFACE UNIFICADA PARA CLIPES ==========
interface ClipToRender {
  start: number;
  end: number;
  reason: string;
  scores: {
    semantic: number;
    emotional: number;
    narrative: number;
  };
  crop?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

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
      getHomeDir: () => Promise<string>;
      fs?: {
        exists: (path: string) => Promise<boolean>;
        stat: (path: string) => Promise<any>;
      };
      ffmpeg: {
        getDuration: (path: string) => Promise<number>;
        extractAudio: (path: string) => Promise<string>;
        getFileSize: (path: string) => Promise<number>;
        getMetadata: (path: string) => Promise<any>;
        cutClip: (path: string, start: number, end: number, outputPath: string) => Promise<string>;
        cutClipWithCrop: (path: string, start: number, end: number, outputPath: string, crop: any) => Promise<string>;
        generateThumbnail: (path: string, time: number, outputPath: string) => Promise<string>;
        onProgress: (callback: (progress: number) => void) => void;
      };
      db: {
        saveVideo: (video: any) => Promise<number>;
        saveClip: (clip: any) => Promise<number>;
        getHistory: () => Promise<any>;
        getClipsByVideo: (videoId: number) => Promise<any[]>;
        getVideoByPath: (path: string) => Promise<any>;
      };
      cache: {
        getTranscriptionCache: (path: string) => Promise<any>;
        saveTranscriptionCache: (path: string, data: any) => Promise<void>;
        getAnalysisCache: (path: string) => Promise<any>;
        saveAnalysisCache: (path: string, data: any) => Promise<void>;
      };
    };
  }
}

// ========== INTERFACES DO CROP MODAL ==========

// CropState guarda coordenadas JÁ EM PIXELS REAIS DO VÍDEO (ex: 1920×1080).
// A escala CSS→real é feita no momento do "Salvar" no modal, enquanto
// renderedWidth/Height ainda estão disponíveis no cropModal state.
interface CropState {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Crop salvo com metadados de escala para debug/auditoria
interface SavedCrop extends CropState {
  // Dimensões do container CSS no momento do save (para referência)
  containerW: number;
  containerH: number;
  // Dimensões reais do vídeo no momento do save
  videoW: number;
  videoH: number;
}

interface CropModalState {
  visible: boolean;
  thumbnailPath: string;
  currentCrop: CropState;
  // Dimensões do elemento <img> renderizado no DOM (pixels CSS)
  // Estas são as dimensões usadas para mapear o crop para o vídeo real
  renderedWidth: number;
  renderedHeight: number;
  // Para clipes
  clipPath?: string;
  clipIndex?: number;
  videoName?: string;
  // Para vídeos
  videoPath?: string;
  videoIndex?: number;
}

// ========== FUNÇÕES UTILITÁRIAS ==========
const normalizePath = (path: string) => {
  if (!path) return '';
  return path.replace(/\\/g, '/');
};

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

const getClipDuration = (clipPath: string): Promise<number> => {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.src = `video://${encodeURIComponent(clipPath)}`;
    video.onloadedmetadata = () => resolve(video.duration);
    video.onerror = () => resolve(60);
  });
};

// ========== COMPONENTE PRINCIPAL ==========
const Dashboard: React.FC = () => {
  const { settings } = useSettings();
  const { videos, setVideos, clips, setClips, isProcessing, setIsProcessing } = useApp();

  // Estados gerais
  const [videosPath, setVideosPath] = useState('');
  const [thumbnailsPath, setThumbnailsPath] = useState('');
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [scoreDistribution, setScoreDistribution] = useState<any[]>([]);
  const [previewClip, setPreviewClip] = useState<ClipInfo | null>(null);
  const [videoCrop, setVideoCrop] = useState<{ [videoPath: string]: SavedCrop }>({});
  const [cropModal, setCropModal] = useState<CropModalState | null>(null);

  // Refs
  const cropImageRef = useRef<HTMLImageElement>(null);
  const videosPathRef = useRef<string>('');

  // =====================================================================
  // BUG 1 CORRIGIDO — DRAG
  //
  // Problema original: dragRef.current.isDragging era setado como true,
  // mas o useEffect dependia de [cropModal] que não mudava no mouseDown.
  // Logo os listeners de mousemove/mouseup NUNCA eram registrados no window.
  //
  // Solução: usar um estado React (isDraggingActive) como gatilho do
  // useEffect. O dragRef ainda guarda os valores numéricos do início do
  // arrasto para evitar re-renders desnecessários durante o movimento.
  // =====================================================================
  const [isDraggingActive, setIsDraggingActive] = useState(false);

  const dragRef = useRef({
    startX: 0,       // clientX do mousedown
    startY: 0,       // clientY do mousedown
    startCropX: 0,   // crop.x no momento do mousedown
    startCropY: 0,   // crop.y no momento do mousedown
  });

  // mouseDown — inicia o arrasto
  const startCropDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!cropModal) return;

    // Salva o ponto de início e a posição inicial do crop
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startCropX: cropModal.currentCrop.x,
      startCropY: cropModal.currentCrop.y,
    };

    setIsDraggingActive(true);
  }, [cropModal]);

  // useEffect registra/remove listeners baseado no estado isDraggingActive
  // Agora funciona corretamente pois isDraggingActive É um estado React
  useEffect(() => {
    if (!isDraggingActive) return;

    const onMouseMove = (e: MouseEvent) => {
      e.preventDefault();

      const deltaX = e.clientX - dragRef.current.startX;
      const deltaY = e.clientY - dragRef.current.startY;

      setCropModal((prev) => {
        if (!prev) return prev;

        const containerW = cropImageRef.current?.clientWidth ?? 800;
        const containerH = cropImageRef.current?.clientHeight ?? 600;
        const cropW = prev.currentCrop.width;
        const cropH = prev.currentCrop.height;

        const newX = dragRef.current.startCropX + deltaX;
        const newY = dragRef.current.startCropY + deltaY;

        const clampedX = Math.max(0, Math.min(newX, containerW - cropW));
        const clampedY = Math.max(0, Math.min(newY, containerH - cropH));

        return {
          ...prev,
          currentCrop: {
            ...prev.currentCrop,
            x: clampedX,
            y: clampedY,
          },
        };
      });
    };

    const onMouseUp = () => {
      setIsDraggingActive(false);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDraggingActive]); // ← depende do ESTADO, não do ref

  // =====================================================================
  // BUG 2 CORRIGIDO — COORDENADAS DO FFMPEG
  //
  // Problema original: applyCropToClip usava cropModal.imageWidth que
  // eram as dimensões naturais da thumbnail (ex: 1280×720), mas o crop
  // era calculado em pixels CSS do elemento renderizado (clientWidth/Height).
  // Isso gerava um fator de escala errado, resultando em crop deslocado.
  //
  // Solução: salvar renderedWidth/renderedHeight no CropModalState no
  // momento do onLoad, e usar ESSAS dimensões para calcular a escala.
  // =====================================================================
  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const renderedW = img.clientWidth;
    const renderedH = img.clientHeight;

    setCropModal((prev) => {
      if (!prev) return prev;

      // Atualiza as dimensões renderizadas no modal
      const updated: CropModalState = {
        ...prev,
        renderedWidth: renderedW,
        renderedHeight: renderedH,
      };

      // Se ainda não tiver crop definido, calcula o padrão 9:16 centralizado
      if (!videoCrop[prev.videoPath ?? '']) {
        const cropH = renderedH * 0.95;
        const cropW = cropH * (9 / 16);
        const x = (renderedW - cropW) / 2;
        const y = (renderedH - cropH) / 2;

        updated.currentCrop = {
          x: Math.max(0, Math.round(x)),
          y: Math.max(0, Math.round(y)),
          width: Math.round(cropW),
          height: Math.round(cropH),
        };
      }

      return updated;
    });
  }, [videoCrop]);

  // =====================================================================
  // BUG 3 CORRIGIDO — PREVIEW 9:16 (transform invertido)
  //
  // Problema original: o CSS transform aplicava scale() e depois translate()
  // mas como translate() vem depois no string, ele é aplicado NO ESPAÇO
  // já escalado — o que desloca a imagem de forma errada.
  //
  // Solução: usar translate() ANTES do scale() no string de transform,
  // ou melhor ainda: calcular left/top diretamente com JS e usar scale
  // apenas para o zoom, evitando ambiguidade.
  // =====================================================================
  const getPreviewTransform = useCallback(() => {
    if (!cropModal || !cropImageRef.current) return {};

    const containerW = cropImageRef.current.clientWidth || 800;
    const containerH = cropImageRef.current.clientHeight || 600;
    const cropW = cropModal.currentCrop.width || 400;
    const cropX = cropModal.currentCrop.x || 0;
    const cropY = cropModal.currentCrop.y || 0;

    // Scale = quanto precisamos ampliar para o crop preencher o preview
    const scale = containerW / cropW;

    // Após o scale, o ponto (cropX, cropY) precisa estar em (0,0)
    // Translate é aplicado ANTES do scale (ordem CSS: direita pra esquerda)
    // então dividimos pelo scale para compensar
    return {
      position: 'absolute' as const,
      top: 0,
      left: 0,
      width: containerW,
      height: containerH,
      transformOrigin: 'top left',
      // ORDEM CORRETA: translate primeiro, scale depois
      // Em CSS isso significa: scale() translate() — scale é aplicado por último
      transform: `scale(${scale}) translate(${-cropX}px, ${-cropY}px)`,
      maxWidth: 'none',
    };
  }, [cropModal]);

  // =====================================================================
  // FUNÇÕES DO MODAL
  // =====================================================================

  const openCropModal = useCallback((clip: any, index: number) => {
    const img = new Image();
    img.src = `video://${encodeURIComponent(clip.thumbnailPath)}`;

    img.onload = () => {
      setCropModal({
        visible: true,
        clipPath: clip.outputPath,
        thumbnailPath: clip.thumbnailPath,
        clipIndex: index,
        videoName: clip.videoName,
        renderedWidth: 0,   // será preenchido no onLoad do <img>
        renderedHeight: 0,
        currentCrop: clip.crop ?? {
          x: Math.round(img.width * 0.25),
          y: Math.round(img.height * 0.15),
          width: Math.round(img.width * 0.5),
          height: Math.round(img.height * 0.7),
        },
      });
    };
  }, []);

  const openVideoCropModal = useCallback((video: any) => {
    const defaultCrop: CropState = { x: 100, y: 50, width: 600, height: 400 };

    setCropModal({
      visible: true,
      videoPath: video.path,
      thumbnailPath: video.thumbnailPath ?? '',
      videoIndex: videos.findIndex((v) => v.path === video.path),
      renderedWidth: 0,
      renderedHeight: 0,
      currentCrop: videoCrop[video.path] ?? defaultCrop,
    });
  }, [videos, videoCrop]);

  // Aplica crop ao clipe (usa renderedWidth/Height para escala correta)
  const applyCropToClip = async () => {
    if (!cropModal?.clipPath) return;

    try {
      const metadata = await window.electron!.ffmpeg.getMetadata(cropModal.clipPath);
      const videoStream = metadata.streams.find((s: any) => s.codec_type === 'video');
      const videoWidth: number = videoStream.width;
      const videoHeight: number = videoStream.height;

      // ✅ USA renderedWidth/Height (pixels CSS) — não mais imageWidth/imageHeight (natural)
      const refW = cropModal.renderedWidth || cropImageRef.current?.clientWidth || 800;
      const refH = cropModal.renderedHeight || cropImageRef.current?.clientHeight || 600;

      const scaleX = videoWidth / refW;
      const scaleY = videoHeight / refH;

      const scaledCrop = {
        x: Math.round(cropModal.currentCrop.x * scaleX),
        y: Math.round(cropModal.currentCrop.y * scaleY),
        width: Math.round(cropModal.currentCrop.width * scaleX),
        height: Math.round(cropModal.currentCrop.height * scaleY),
      };

      console.log('🎯 Crop (pixels CSS):', cropModal.currentCrop);
      console.log('🎯 Crop (pixels vídeo):', scaledCrop);
      console.log('📊 Vídeo real:', videoWidth, '×', videoHeight, '| Container:', refW, '×', refH);

      const newClipPath = cropModal.clipPath.replace('.mp4', '_ajustado.mp4');
      const duration = await getClipDuration(cropModal.clipPath);

      await window.electron!.ffmpeg.cutClipWithCrop(
        cropModal.clipPath, 0, duration, newClipPath, scaledCrop
      );

      const newThumbnailPath = cropModal.thumbnailPath.replace('.jpg', '_ajustado.jpg');
      await window.electron!.ffmpeg.generateThumbnail(newClipPath, 1, newThumbnailPath);

      setClips((prev) =>
        prev.map((clip, idx) =>
          idx === cropModal.clipIndex
            ? { ...clip, outputPath: newClipPath, thumbnailPath: newThumbnailPath, crop: scaledCrop }
            : clip
        )
      );

      setCropModal(null);
      alert('✅ Enquadramento ajustado com sucesso!');
    } catch (error: any) {
      console.error('Erro ao aplicar crop:', error);
      alert('Erro ao ajustar enquadramento: ' + error.message);
    }
  };

  // =====================================================================
  // DEMAIS USEEFFECTS
  // =====================================================================

  useEffect(() => {
    const loadPaths = async () => {
      try {
        const basePath = await window.electron!.getVideosPath();
        setVideosPath(basePath);
        videosPathRef.current = basePath;
        setThumbnailsPath(`${basePath}/thumbnails`);
      } catch {
        try {
          const homeDir = await window.electron!.getHomeDir();
          const fallback = `${homeDir.replace(/\\/g, '/')}/Videos`;
          setVideosPath(fallback);
          setThumbnailsPath(`${fallback}/thumbnails`);
          videosPathRef.current = fallback;
        } catch {
          setVideosPath('C:/Users/Rafael/Videos');
          setThumbnailsPath('C:/Users/Rafael/Videos/thumbnails');
        }
      }
    };
    loadPaths();
  }, []);

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const history = await window.electron!.db.getHistory();
        if (!history?.videos) return;

        const loadedVideos = history.videos
          .filter((v: any) => v.status === 'queued' || v.status === 'processing')
          .map((v: any) => ({
            path: v.path,
            name: v.name,
            duration: v.duration,
            size: v.size,
            status: v.status,
            progress: v.status === 'processing' ? 50 : 0,
          }));

        const loadedClips = (history.clips || []).map((c: any) => ({
          videoName: history.videos?.find((v: any) => v.id === c.video_id)?.name ?? 'Desconhecido',
          start: c.start_time,
          end: c.end_time,
          reason: c.reason ?? '',
          outputPath: c.output_path,
          thumbnailPath: c.thumbnail_path?.replace(/\\/g, '/'),
          scores: {
            semantic: c.semantic_score ?? 0,
            emotional: c.emotional_score ?? 0,
            narrative: c.narrative_score ?? 0,
          },
        }));

        setVideos(loadedVideos);
        setClips(loadedClips);
      } catch (error) {
        console.error('❌ Erro ao carregar dados iniciais:', error);
      }
    };
    loadInitialData();
  }, [setVideos, setClips]);

  // =====================================================================
  // ESTATÍSTICAS
  // =====================================================================
  const stats = {
    totalVideos: videos.length,
    processedVideos: videos.filter((v) => v.status === 'processed').length,
    totalClips: clips.length,
    avgScore:
      clips.length > 0
        ? (
            clips.reduce((acc, c) => {
              const avg = c.scores
                ? (c.scores.semantic + c.scores.emotional + c.scores.narrative) / 3
                : 0;
              return acc + avg;
            }, 0) / clips.length
          ).toFixed(2)
        : '0.00',
  };

  // =====================================================================
  // SERVIÇO OPENAI
  // =====================================================================
  const openAIService = useMemo(() => {
    if (settings.openAIKey && !settings.useMock) {
      return new OpenAIService(settings.openAIKey);
    }
    return null;
  }, [settings.openAIKey, settings.useMock]);

  // =====================================================================
  // SALVAR CLIPES NO BANCO
  // =====================================================================
  const saveClipsToDB = async (clipsToSave: any[], videoId: number) => {
    try {
      for (const clip of clipsToSave) {
        await window.electron!.db.saveClip({
          video_id: videoId,
          start_time: clip.start,
          end_time: clip.end,
          reason: clip.reason,
          output_path: clip.outputPath,
          thumbnail_path: clip.thumbnailPath,
          semantic_score: clip.scores?.semantic ?? 0,
          emotional_score: clip.scores?.emotional ?? 0,
          narrative_score: clip.scores?.narrative ?? 0,
          combined_score:
            ((clip.scores?.semantic ?? 0) +
              (clip.scores?.emotional ?? 0) +
              (clip.scores?.narrative ?? 0)) /
            3,
        });
      }
      console.log('💾 Dados salvos no banco!');
    } catch (dbError) {
      console.error('❌ Erro ao salvar no banco:', dbError);
    }
  };

  // =====================================================================
  // RENDERIZAR CLIPES
  // videoCropRef garante que o valor mais recente de videoCrop
  // esteja sempre disponível dentro de funções assíncronas,
  // evitando closure stale do estado React.
  // =====================================================================
  const videoCropRef = useRef(videoCrop);
  useEffect(() => { videoCropRef.current = videoCrop; }, [videoCrop]);

  const renderClips = async (
    clipsToRender: ClipToRender[],
    video: VideoInfo,
    videoId: number,
    minDuration: number,
    maxDuration: number
  ) => {
    const novosClips = [];

    // ─── Buscar metadados REAIS do vídeo uma única vez ───────────────────
    // Necessário para escalar corretamente o crop do modal (pixels CSS)
    // para pixels do vídeo real (ex: 1920×1080).
    let videoRealWidth = 0;
    let videoRealHeight = 0;
    try {
      const meta = await window.electron!.ffmpeg.getMetadata(video.path);
      const vStream = meta?.streams?.find((s: any) => s.codec_type === 'video');
      videoRealWidth  = vStream?.width  ?? 0;
      videoRealHeight = vStream?.height ?? 0;
      console.log(`📐 Dimensões reais do vídeo: ${videoRealWidth}×${videoRealHeight}`);
    } catch (metaErr) {
      console.warn('⚠️ Não foi possível obter metadados do vídeo:', metaErr);
    }

    // ─── Crop definido pelo usuário no modal ──────────────────────────────
    // O crop já foi salvo em PIXELS REAIS DO VÍDEO no momento do "Salvar"
    // (veja botão Salvar no modal — doSave() faz a escala CSS→real na hora).
    // Aqui apenas lemos o valor pronto, sem nenhuma escala adicional.
    const savedCrop = videoCropRef.current[video.path] ?? null;

    if (savedCrop) {
      console.log(`🎯 Crop do modal (pixels reais): x=${savedCrop.x} y=${savedCrop.y} w=${savedCrop.width} h=${savedCrop.height}`);
      console.log(`   (salvo com container=${savedCrop.containerW}×${savedCrop.containerH} | vídeo=${savedCrop.videoW}×${savedCrop.videoH})`);
    } else {
      console.log('ℹ️ Nenhum crop definido — FFmpeg usará resize padrão 9:16');
    }

    const scaledVideoCrop = savedCrop;

    for (let j = 0; j < clipsToRender.length; j++) {
      const clip = clipsToRender[j];
      const start = Math.round(clip.start);
      const end = Math.round(clip.end);
      const duration = end - start;

      if (duration < minDuration || duration > maxDuration) {
        console.warn(`⚠️ Duração inválida: ${duration}s — ignorando clipe ${j + 1}`);
        continue;
      }

      const safeName = (video.name || 'video').replace(/\.[^/.]+$/, '');
      const clipPath = `${videosPath}/${safeName}_clip_${j + 1}.mp4`;
      const thumbnailPath = normalizePath(
        `${videosPath}/thumbnails/${safeName}_clip_${j + 1}.jpg`
      );

      // Prioridade do crop (usuário sempre vence):
      // 1. crop do modal — definido pelo usuário, já em pixels reais do vídeo
      // 2. crop embutido no clipe — vem do modo REAL (IA com detecção de rosto)
      // 3. nenhum → FFmpeg aplica resize+pad padrão para 9:16
      const effectiveCrop = scaledVideoCrop ?? clip.crop ?? null;

      console.log(`✂️ Clipe ${j + 1} [${start}s→${end}s] | crop: ${effectiveCrop ? `${effectiveCrop.x},${effectiveCrop.y} ${effectiveCrop.width}×${effectiveCrop.height}` : 'nenhum (padrão 9:16)'}`);

      try {
        if (effectiveCrop) {
          await window.electron!.ffmpeg.cutClipWithCrop(video.path, start, end, clipPath, effectiveCrop);
        } else {
          await window.electron!.ffmpeg.cutClip(video.path, start, end, clipPath);
        }

        const thumbnailTime = Math.min((start + end) / 2, video.duration - 0.1);
        await window.electron!.ffmpeg.generateThumbnail(video.path, thumbnailTime, thumbnailPath);

        const clipData = {
          videoName: video.name,
          start,
          end,
          reason: clip.reason,
          outputPath: clipPath,
          thumbnailPath,
          scores: clip.scores,
        };

        setClips((prev) => [...prev, clipData]);
        novosClips.push(clipData);
      } catch (clipError) {
        console.error(`❌ Erro ao processar clipe ${j + 1}:`, clipError);
      }
    }

    return novosClips;
  };

  // =====================================================================
  // HANDLERS PRINCIPAIS
  // =====================================================================
  const handleSelectVideos = async () => {
    if (!window.electron) { alert('Electron não disponível'); return; }

    try {
      const selected = await window.electron.selectVideos();
      if (!selected?.length) return;

      const videoDetails = await Promise.all(
        selected.map(async (path: string) => {
          try {
            const metadata = await window.electron!.ffmpeg.getMetadata(path);
            const [duration, fileSize] = await Promise.all([
              window.electron!.ffmpeg.getDuration(path),
              window.electron!.ffmpeg.getFileSize(path),
            ]);

            const safeName = path.split('\\').pop()?.replace(/\.[^/.]+$/, '') ?? 'video';
            const currentPath = videosPathRef.current || videosPath || 'C:/Users/Rafael/Videos';
            const thumbPath = normalizePath(`${currentPath}/thumbnails/${safeName}_thumb.jpg`);

            await window.electron!.ffmpeg.generateThumbnail(path, duration / 2, thumbPath);

            return {
              path,
              name: path.split('\\').pop() ?? path,
              duration: duration ?? 0,
              size: fileSize ?? 0,
              status: 'queued' as const,
              progress: 0,
              thumbnailPath: thumbPath,
              width: metadata.width ?? 1920,
              height: metadata.height ?? 1080,
            };
          } catch {
            return {
              path,
              name: path.split('\\').pop() ?? path,
              duration: 0,
              size: 0,
              status: 'error' as const,
              error: 'Falha ao ler vídeo',
            };
          }
        })
      );

      setVideos((prev) => [...prev, ...videoDetails]);
    } catch (error) {
      console.error('Erro geral:', error);
    }
  };

  const handleProcessVideos = async () => {
    try {
      if (videos.length === 0) return;

      if (settings.selectedMode === 'openai' && !settings.useMock && !openAIService) {
        alert('Chave da OpenAI não configurada. Vá para Configurações.');
        return;
      }

      setIsProcessing(true);
      setClips([]);

      const MIN_CLIP_DURATION = 30;
      const MAX_CLIP_DURATION = 60;
      let totalGeneratedClips = 0;

      for (let i = 0; i < videos.length; i++) {
        const video = videos[i];

        setVideos((prev) =>
          prev.map((v, idx) => (idx === i ? { ...v, status: 'processing' } : v))
        );

        try {
          if (settings.useMock) {
            const audioPath = await window.electron!.ffmpeg.extractAudio(video.path);
            console.log('✅ Áudio extraído (mock):', audioPath);

            // Crops REMOVIDOS dos mockClips — o mock não conhece a resolução do
            // vídeo real. O crop do usuário (salvo no modal) será aplicado via
            // scaledVideoCrop dentro de renderClips com prioridade máxima.
            const mockClips: ClipToRender[] = [
              { start: 5,   end: 35,  reason: '🎯 Introdução impactante', scores: { semantic: 0.85, emotional: 0.8,  narrative: 0.75 } },
              { start: 45,  end: 80,  reason: '💡 Insight revelador',     scores: { semantic: 0.9,  emotional: 0.7,  narrative: 0.85 } },
              { start: 90,  end: 125, reason: '⚡ Momento de virada',     scores: { semantic: 0.8,  emotional: 0.9,  narrative: 0.7  } },
              { start: 130, end: 165, reason: '🎤 Frase de impacto',      scores: { semantic: 0.95, emotional: 0.85, narrative: 0.8  } },
              { start: 170, end: 200, reason: '🔚 Conclusão poderosa',    scores: { semantic: 0.88, emotional: 0.82, narrative: 0.9  } },
            ];

            let videoId: number;
            const existingVideo = await window.electron!.db.getVideoByPath(video.path);
            videoId = existingVideo
              ? existingVideo.id
              : await window.electron!.db.saveVideo({ path: video.path, name: video.name, duration: video.duration, size: video.size, status: 'processed' });

            const novosClips = await renderClips(mockClips, video, videoId, MIN_CLIP_DURATION, MAX_CLIP_DURATION);
            if (novosClips.length > 0) await saveClipsToDB(novosClips, videoId);
            totalGeneratedClips += novosClips.length;

            setVideos((prev) => prev.map((v, idx) => (idx === i ? { ...v, status: 'processed' } : v)));

          } else {
            if (!openAIService) throw new Error('OpenAI não configurado');

            const audioPath = await window.electron!.ffmpeg.extractAudio(video.path);
            const audioBuffer = await window.electron!.readFile(audioPath);
            const audioFile = new File([audioBuffer], 'audio.mp3', { type: 'audio/mp3' });

            const cachedTranscription = await window.electron!.cache.getTranscriptionCache(video.path);
            let transcriptionResult = cachedTranscription;
            if (!transcriptionResult) {
              transcriptionResult = await openAIService.transcribeAudio(audioFile);
              await window.electron!.cache.saveTranscriptionCache(video.path, transcriptionResult);
            }

            const allSentences = openAIService.groupWordsIntoSentences(transcriptionResult.words);
            const limitedSentences = allSentences.slice(0, 30);

            const cachedAnalysis = await window.electron!.cache.getAnalysisCache(video.path);
            let viralAnalysisResult = cachedAnalysis;
            if (!viralAnalysisResult) {
              viralAnalysisResult = await openAIService.analyzeViralSentences(limitedSentences);
              await window.electron!.cache.saveAnalysisCache(video.path, viralAnalysisResult);
            }

            const viralClipsFromAnalysis = viralAnalysisResult.viralClips || [];

            const enforceNarrativeMinimum = (
              startIdx: number, endIdx: number, sentences: any[], minDur: number
            ) => {
              let s = startIdx, e = endIdx;
              while (sentences[e].end - sentences[s].start < minDur && e + 1 < sentences.length) e++;
              while (sentences[e].end - sentences[s].start < minDur && s > 0) s--;
              return { startIndex: s, endIndex: e };
            };

            const clipsWithTimestamps = viralClipsFromAnalysis
              .map((clip: any) => {
                const { startSentenceIndex: si, endSentenceIndex: ei } = clip;
                if (si == null || ei == null || si < 0 || ei >= allSentences.length) return null;
                const safeS = Math.min(si, ei), safeE = Math.max(si, ei);
                const { startIndex: expS, endIndex: expE } = enforceNarrativeMinimum(safeS, safeE, allSentences, MIN_CLIP_DURATION);
                return {
                  start: allSentences[expS].start,
                  end: allSentences[expE].end,
                  reason: clip.reason ?? 'Momento viral',
                  viralScore: clip.viralScore ?? 70,
                  duration: allSentences[expE].end - allSentences[expS].start,
                  startIdx: expS,
                  endIdx: expE,
                };
              })
              .filter(Boolean);

            const processedClips: ClipToRender[] = [];
            for (const clip of clipsWithTimestamps) {
              if (clip.duration > MAX_CLIP_DURATION) {
                let currentStart = clip.startIdx;
                for (let k = clip.startIdx; k <= clip.endIdx; k++) {
                  const tempDuration = allSentences[k].end - allSentences[currentStart].start;
                  if (tempDuration >= 45 || k === clip.endIdx) {
                    processedClips.push({
                      start: allSentences[currentStart].start,
                      end: allSentences[k].end,
                      reason: clip.reason,
                      scores: { semantic: clip.viralScore / 100, emotional: 0.6, narrative: 0.5 },
                    });
                    currentStart = k + 1;
                  }
                }
              } else {
                processedClips.push({
                  start: clip.start, end: clip.end, reason: clip.reason,
                  scores: { semantic: clip.viralScore / 100, emotional: 0.6, narrative: 0.5 },
                });
              }
            }

            const validClips = processedClips
              .filter((c) => c.end - c.start >= MIN_CLIP_DURATION && c.end - c.start <= MAX_CLIP_DURATION)
              .sort((a, b) => b.scores.semantic - a.scores.semantic);

            const highQuality = validClips.filter((c) => c.scores.semantic * 100 >= 50);
            const finalClips = highQuality.length >= 2 ? highQuality : validClips.slice(0, 3);

            let videoId: number;
            const existingVideo = await window.electron!.db.getVideoByPath(video.path);
            videoId = existingVideo
              ? existingVideo.id
              : await window.electron!.db.saveVideo({ path: video.path, name: video.name, duration: video.duration, size: video.size, status: 'processed' });

            // ✅ renderClips UNIFICADO — lê videoCropRef, escala CSS→pixels reais, passa ao FFmpeg
            const novosClips = await renderClips(finalClips, video, videoId, MIN_CLIP_DURATION, MAX_CLIP_DURATION);
            totalGeneratedClips += novosClips.length;

            if (novosClips.length > 0) await saveClipsToDB(novosClips, videoId);
            setVideos((prev) => prev.map((v, idx) => (idx === i ? { ...v, status: 'processed' } : v)));
          }
        } catch (videoError) {
          console.error(`❌ Erro no vídeo ${video.name}:`, videoError);
          setVideos((prev) => prev.map((v, idx) => (idx === i ? { ...v, status: 'error' } : v)));
        }
      }

      setIsProcessing(false);
      alert(`✅ Processamento ${settings.useMock ? 'MOCK' : 'REAL'} concluído! ${totalGeneratedClips} clipe(s) gerado(s).`);
    } catch (error) {
      console.error('❌ Erro geral:', error);
      setIsProcessing(false);
    }
  };

  const handleRemoveVideo = (indexToRemove: number) => {
    setVideos(videos.filter((_, i) => i !== indexToRemove));
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'processed': return '✅';
      case 'processing': return '⚙️';
      case 'queued': return '⏳';
      case 'error': return '❌';
      default: return '⏳';
    }
  };

  // =====================================================================
  // RENDER
  // =====================================================================
  return (
    <div className="main-card">
      <header className="app-header">
        <h1 className="app-title">OpusFactory</h1>
        <p className="app-subtitle">Clone do OpusClip com IA</p>
      </header>

      {/* Cards de estatísticas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Total de vídeos', value: stats.totalVideos },
          { label: 'Processados', value: stats.processedVideos },
          { label: 'Clipes gerados', value: stats.totalClips },
          { label: 'Score médio', value: stats.avgScore },
        ].map(({ label, value }) => (
          <div key={label} style={{ backgroundColor: '#1E293B', padding: '16px', borderRadius: '12px', border: '1px solid #334155' }}>
            <div style={{ color: '#94A3B8', fontSize: '14px' }}>{label}</div>
            <div style={{ color: '#F1F5F9', fontSize: '28px', fontWeight: 600 }}>{value}</div>
          </div>
        ))}
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

      {/* Botão Selecionar Vídeos */}
      <button className="primary-button" onClick={handleSelectVideos} style={{ marginBottom: '24px' }}>
        <span>📂</span> Selecionar Vídeos
      </button>

      {/* Fila de processamento */}
      {videos.length > 0 && (
        <>
          <h3 style={{ color: '#F1F5F9', marginBottom: '16px' }}>📋 Fila de processamento</h3>
          <div style={{ backgroundColor: '#0F172A', borderRadius: '16px', padding: '16px', border: '1px solid #334155', marginBottom: '24px' }}>
            {videos.map((video, index) => (
              <div key={index}>
                <div style={{ backgroundColor: '#1E293B', borderRadius: '8px', padding: '16px', marginBottom: '8px', border: '1px solid #334155', display: 'flex', gap: '16px' }}>
                  {/* Thumbnail */}
                  <div style={{ position: 'relative', width: '120px', height: '68px' }}>
                    {(video as any).thumbnailPath ? (
                      <img
                        src={`video://${encodeURIComponent((video as any).thumbnailPath)}`}
                        alt="thumbnail"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '4px' }}
                      />
                    ) : (
                      <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #3B82F6, #1E293B)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🎬</div>
                    )}
                    <button
                      onClick={() => openVideoCropModal(video)}
                      style={{ position: 'absolute', bottom: '4px', right: '4px', background: '#3B82F6', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '12px', cursor: 'pointer' }}
                      title="Ajustar enquadramento"
                    >
                      ✂️ Ajustar
                    </button>
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#F1F5F9', fontWeight: 500 }}>{video.name}</div>
                    <div style={{ display: 'flex', gap: '20px', color: '#94A3B8', fontSize: '13px' }}>
                      <span>📦 {formatFileSize(video.size)}</span>
                      <span>⏱️ {formatDuration(video.duration)}</span>
                    </div>
                    {videoCrop[video.path] && (
                      <div style={{ color: '#10B981', fontSize: '12px', marginTop: '4px' }}>✅ Corte personalizado definido</div>
                    )}
                  </div>

                  {/* Remover */}
                  <button
                    onClick={() => handleRemoveVideo(index)}
                    disabled={video.status === 'processing'}
                    style={{ background: 'transparent', border: 'none', color: video.status === 'processing' ? '#4B5563' : '#EF4444', fontSize: '20px', cursor: video.status === 'processing' ? 'not-allowed' : 'pointer' }}
                  >
                    🗑️
                  </button>
                </div>

                {video.status === 'processing' && (
                  <div style={{ marginTop: '12px', marginBottom: '8px' }}>
                    <div style={{ height: '6px', backgroundColor: '#0F172A', borderRadius: '3px' }}>
                      <div style={{ width: `${video.progress || 0}%`, height: '100%', backgroundColor: '#3B82F6', borderRadius: '3px', transition: 'width 0.3s' }} />
                    </div>
                  </div>
                )}

                {video.error && (
                  <div style={{ marginTop: '8px', marginBottom: '8px', color: '#EF4444', fontSize: '13px' }}>❌ {video.error}</div>
                )}
              </div>
            ))}

            <button
              onClick={handleProcessVideos}
              disabled={isProcessing || videos.length === 0}
              style={{ width: '100%', height: '48px', backgroundColor: isProcessing ? '#4B5563' : '#10B981', border: 'none', borderRadius: '8px', color: 'white', fontSize: '15px', fontWeight: 600, marginTop: '16px', cursor: isProcessing ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <span>{isProcessing ? '⚙️' : '▶️'}</span>
              {isProcessing ? 'Processando...' : 'Iniciar Processamento'}
            </button>
          </div>
        </>
      )}

      {/* Últimos clipes */}
      {clips.length > 0 && (
        <div>
          <h3 style={{ color: '#F1F5F9', marginBottom: '16px' }}>🔥 Últimos clipes gerados</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
            {clips.slice(0, 6).map((clip, index) => (
              <div
                key={index}
                onClick={() => setPreviewClip(clip)}
                style={{ backgroundColor: '#1E293B', borderRadius: '8px', overflow: 'hidden', border: '1px solid #334155', position: 'relative', transition: 'transform 0.2s', cursor: 'pointer' }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.zIndex = '10'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.zIndex = '1'; }}
              >
                {clip.thumbnailPath ? (
                  <img
                    src={`video://${encodeURIComponent(clip.thumbnailPath)}`}
                    alt="thumbnail"
                    style={{ width: '100%', height: '112px', objectFit: 'cover' }}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      const p = e.currentTarget.parentElement;
                      if (p) { p.style.background = 'linear-gradient(135deg, #3B82F6, #1E293B)'; p.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:112px;font-size:48px;">🎬</div>'; }
                    }}
                  />
                ) : (
                  <div style={{ height: '112px', background: 'linear-gradient(135deg, #3B82F6, #1E293B)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px' }}>🎬</div>
                )}

                <div style={{ padding: '12px' }}>
                  <div style={{ color: '#94A3B8', fontSize: '12px' }}>{clip.videoName.substring(0, 30)}...</div>
                  <div style={{ color: '#F1F5F9', fontSize: '13px', marginTop: '4px' }}>{clip.start}s - {clip.end}s</div>
                  {clip.scores && (
                    <div style={{ display: 'flex', gap: '4px', marginTop: '8px', fontSize: '11px', color: '#94A3B8' }}>
                      <span>🧠 {(clip.scores.semantic * 100).toFixed(0)}%</span>
                      <span>❤️ {(clip.scores.emotional * 100).toFixed(0)}%</span>
                      <span>📖 {(clip.scores.narrative * 100).toFixed(0)}%</span>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); openCropModal(clip, index); }}
                  style={{ position: 'absolute', bottom: 8, right: 8, backgroundColor: '#3B82F6', color: '#FFF', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5 }}
                  title="Ajustar enquadramento 9:16"
                >
                  ✂️
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal de preview */}
      {previewClip && (
        <div
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setPreviewClip(null)}
        >
          <div
            style={{ width: '80%', maxWidth: '800px', backgroundColor: '#1E293B', borderRadius: '16px', padding: '24px', border: '1px solid #334155' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ color: '#F1F5F9', marginBottom: '16px' }}>Pré-visualização</h3>
            <video src={`video://${previewClip.outputPath}`} controls style={{ width: '100%', borderRadius: '8px', marginBottom: '16px' }} />
            <div style={{ color: '#94A3B8', marginBottom: '8px' }}>{previewClip.videoName} — {previewClip.start}s a {previewClip.end}s</div>
            <p style={{ color: '#F1F5F9', marginBottom: '16px' }}>{previewClip.reason}</p>
            <button onClick={() => setPreviewClip(null)} style={{ padding: '8px 16px', backgroundColor: '#3B82F6', border: 'none', borderRadius: '6px', color: 'white', cursor: 'pointer' }}>Fechar</button>
          </div>
        </div>
      )}

      {/* ===================== MODAL DE CROP ===================== */}
      {cropModal?.visible && (
        <div
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}
          onClick={() => setCropModal(null)}
        >
          <div
            style={{ width: '95%', maxWidth: '1400px', maxHeight: '90vh', backgroundColor: '#0F172A', borderRadius: '24px', border: '1px solid rgba(148,163,184,0.15)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.6)', animation: 'fadeIn 0.2s ease-out' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(148,163,184,0.15)', background: '#111827' }}>
              <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: 20, fontWeight: 600 }}>✂️ Ajustar enquadramento 9:16</h2>
            </div>

            {/* Body */}
            <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1fr 320px', gap: 32, overflow: 'auto' }}>

              {/* Área principal — imagem + overlay de crop */}
              <div>
                <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', border: '2px solid #3B82F6', backgroundColor: '#1E293B', aspectRatio: '16/9' }}>
                  
                  {/* Imagem de fundo */}
                  <img
                    ref={cropImageRef}
                    src={cropModal.thumbnailPath ? `video://${encodeURIComponent(cropModal.thumbnailPath)}` : ''}
                    alt="Frame"
                    draggable={false}
                    style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none', backgroundColor: '#1E293B', userSelect: 'none' }}
                    onLoad={handleImageLoad}
                    onError={(e) => {
                      const canvas = document.createElement('canvas');
                      canvas.width = 400; canvas.height = 225;
                      const ctx = canvas.getContext('2d');
                      if (ctx) {
                        const g = ctx.createLinearGradient(0, 0, 400, 0);
                        g.addColorStop(0, '#3B82F6'); g.addColorStop(1, '#1E293B');
                        ctx.fillStyle = g; ctx.fillRect(0, 0, 400, 225);
                        ctx.fillStyle = '#FFF'; ctx.font = 'bold 40px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                        ctx.fillText('🎬', 200, 112);
                      }
                      e.currentTarget.src = canvas.toDataURL();
                    }}
                  />

                  {/* Overlay escuro */}
                  <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', pointerEvents: 'none' }} />

                  {/* Caixa de crop arrastável */}
                  <div
                    onMouseDown={startCropDrag}
                    style={{
                      position: 'absolute',
                      left: `${cropModal.currentCrop.x}px`,
                      top: `${cropModal.currentCrop.y}px`,
                      width: `${cropModal.currentCrop.width}px`,
                      height: `${cropModal.currentCrop.height}px`,
                      border: '3px solid #10B981',
                      borderRadius: 12,
                      boxShadow: '0 0 0 9999px rgba(0,0,0,0.75)',
                      // ✅ cursor muda em tempo real via isDraggingActive (estado)
                      cursor: isDraggingActive ? 'grabbing' : 'grab',
                      zIndex: 50,
                    }}
                  >
                    {/* Grid 3x3 */}
                    <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gridTemplateRows: '1fr 1fr 1fr', pointerEvents: 'none' }}>
                      {[...Array(9)].map((_, i) => (
                        <div key={i} style={{ border: '1px solid rgba(255,255,255,0.15)' }} />
                      ))}
                    </div>

                    {/* Coordenadas debug */}
                    <div style={{ position: 'absolute', top: -24, left: 0, backgroundColor: '#1E293B', color: '#10B981', padding: '2px 6px', borderRadius: 4, fontSize: 10, whiteSpace: 'nowrap' }}>
                      x:{Math.round(cropModal.currentCrop.x)} y:{Math.round(cropModal.currentCrop.y)}
                    </div>

                    {/* Tamanho */}
                    <div style={{ position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.6)', padding: '4px 8px', borderRadius: 6, fontSize: 11, color: '#fff' }}>
                      {Math.round(cropModal.currentCrop.width)} × {Math.round(cropModal.currentCrop.height)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Painel direito */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

                {/* Preview 9:16 */}
                <div style={{ backgroundColor: '#111827', borderRadius: 20, padding: 16, border: '1px solid rgba(148,163,184,0.15)' }}>
                  <h4 style={{ color: '#F1F5F9', marginBottom: 12 }}>📱 Preview 9:16</h4>

                  <div style={{ width: '100%', aspectRatio: '9/16', backgroundColor: '#0F172A', borderRadius: 28, overflow: 'hidden', position: 'relative', boxShadow: 'inset 0 0 0 2px #334155', marginBottom: 12 }}>
                    {/* Notch */}
                    <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 60, height: 6, backgroundColor: '#0F172A', borderRadius: 10, zIndex: 10 }} />

                    {/* ✅ BUG 3 CORRIGIDO — transform com ordem correta */}
                    <div style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}>
                      <img
                        src={cropModal.thumbnailPath ? `video://${encodeURIComponent(cropModal.thumbnailPath)}` : ''}
                        alt="Preview"
                        style={getPreviewTransform()}
                      />
                    </div>
                  </div>

                  {/* Info */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', backgroundColor: '#1E293B', padding: '8px 12px', borderRadius: 12, fontSize: 13 }}>
                    <span style={{ color: '#94A3B8' }}>🎯 {Math.round(cropModal.currentCrop.x)}, {Math.round(cropModal.currentCrop.y)}</span>
                    <span style={{ color: '#10B981', fontWeight: 600 }}>{Math.round(cropModal.currentCrop.width)}×{Math.round(cropModal.currentCrop.height)}</span>
                  </div>
                </div>

                {/* Botão salvar */}
                <button
                  onClick={() => {
                    if (!cropModal.videoPath && cropModal.clipPath) {
                      // Salvar para clipe
                      applyCropToClip();
                      return;
                    }

                    if (!cropModal.videoPath) { alert('Erro: vídeo não identificado'); return; }

                    // ─── Escalar crop CSS → pixels reais do vídeo ────────────────
                    // renderedWidth/Height do cropModal = dimensões do <img> no DOM agora.
                    // Precisamos buscar as dimensões reais do vídeo para calcular a escala.
                    const doSave = async () => {
                      let videoW = 0;
                      let videoH = 0;
                      try {
                        const meta = await window.electron!.ffmpeg.getMetadata(cropModal.videoPath!);
                        const vs = meta?.streams?.find((s: any) => s.codec_type === 'video');
                        videoW = vs?.width  ?? 0;
                        videoH = vs?.height ?? 0;
                      } catch (e) {
                        console.warn('⚠️ Não foi possível obter metadados para escalar crop:', e);
                      }

                      const containerW = cropModal.renderedWidth  || cropImageRef.current?.clientWidth  || 800;
                      const containerH = cropModal.renderedHeight || cropImageRef.current?.clientHeight || 450;

                      let scaledCrop: SavedCrop;

                      if (videoW > 0 && containerW > 0) {
                        const scaleX = videoW / containerW;
                        const scaleY = videoH / containerH;

                        scaledCrop = {
                          x:      Math.round(cropModal.currentCrop.x      * scaleX),
                          y:      Math.round(cropModal.currentCrop.y      * scaleY),
                          width:  Math.round(cropModal.currentCrop.width  * scaleX),
                          height: Math.round(cropModal.currentCrop.height * scaleY),
                          containerW,
                          containerH,
                          videoW,
                          videoH,
                        };

                        console.log('💾 Salvando crop (pixels reais do vídeo):');
                        console.log(`   CSS:  x=${cropModal.currentCrop.x} y=${cropModal.currentCrop.y} w=${cropModal.currentCrop.width} h=${cropModal.currentCrop.height}`);
                        console.log(`   Real: x=${scaledCrop.x} y=${scaledCrop.y} w=${scaledCrop.width} h=${scaledCrop.height}`);
                        console.log(`   scaleX=${scaleX.toFixed(3)} scaleY=${scaleY.toFixed(3)} container=${containerW}×${containerH} vídeo=${videoW}×${videoH}`);
                      } else {
                        // Fallback: salvar sem escala com aviso
                        console.warn('⚠️ Salvando crop sem escala (metadados indisponíveis). Container:', containerW, containerH);
                        scaledCrop = {
                          ...cropModal.currentCrop,
                          containerW,
                          containerH,
                          videoW: containerW,
                          videoH: containerH,
                        };
                      }

                      setVideoCrop((prev) => ({ ...prev, [cropModal.videoPath!]: scaledCrop }));
                      setCropModal(null);
                      alert('✅ Enquadramento salvo! Todos os clipes usarão este corte.');
                    };
                    doSave();
                  }}
                  style={{ padding: '14px 20px', background: 'linear-gradient(135deg, #10B981, #059669)', border: 'none', borderRadius: 12, color: 'white', fontSize: 15, fontWeight: 600, cursor: 'pointer', boxShadow: '0 10px 20px rgba(16,185,129,0.25)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-2px)')}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
                >
                  ✅ Salvar e aplicar ao vídeo
                </button>

                {/* Dicas */}
                <div style={{ backgroundColor: '#111827', borderRadius: 16, padding: 16, border: '1px solid rgba(148,163,184,0.15)' }}>
                  <h4 style={{ color: '#F1F5F9', marginBottom: 10 }}>💡 Dicas</h4>
                  <div style={{ fontSize: 13, color: '#94A3B8' }}>
                    • Mantenha o rosto centralizado na caixa verde<br />
                    • Use a grade 3×3 como guia (regra dos terços)<br />
                    • O corte será aplicado a TODOS os clipes deste vídeo
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(148,163,184,0.15)', display: 'flex', justifyContent: 'flex-end', backgroundColor: '#0B1220' }}>
              <button
                onClick={() => setCropModal(null)}
                style={{ padding: '10px 18px', backgroundColor: 'transparent', border: '1px solid #475569', borderRadius: 8, color: '#F1F5F9', cursor: 'pointer' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1E293B')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                Cancelar
              </button>
            </div>
          </div>

          <style>{`
            @keyframes fadeIn {
              from { opacity: 0; transform: scale(0.96); }
              to   { opacity: 1; transform: scale(1); }
            }
          `}</style>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
