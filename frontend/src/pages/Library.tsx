import React, { useEffect, useState } from 'react';
import '../App.css';

interface VideoRecord {
  id: number;
  name: string;
  duration: number;
  size: number;
  status: string;
  created_at: string;
}

interface ClipRecord {
  id: number;
  video_id: number;
  start_time: number;
  end_time: number;
  reason: string;
  output_path: string;
  thumbnail_path?: string;
  semantic_score: number;
  emotional_score: number;
  narrative_score: number;
  combined_score: number;
}

const Library: React.FC = () => {
  const [videos, setVideos] = useState<VideoRecord[]>([]);
  const [clips, setClips] = useState<ClipRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState<number | null>(null);
  const [filterMinScore, setFilterMinScore] = useState(0);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      if (!window.electron?.db) return;
      
      const history = await window.electron.db.getHistory();
      setVideos(history.videos || []);
      setClips(history.clips || []);
    } catch (error) {
      console.error('Erro ao carregar histórico:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR') + ' ' + date.toLocaleTimeString('pt-BR');
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const videoClips = (videoId: number) => 
    clips.filter(c => c.video_id === videoId && c.combined_score >= filterMinScore);

  const averageScore = (videoId: number) => {
    const vClips = videoClips(videoId);
    if (vClips.length === 0) return 0;
    const sum = vClips.reduce((acc, c) => acc + c.combined_score, 0);
    return (sum / vClips.length).toFixed(2);
  };

  const handleExportClip = async (clipId: number) => {
    try {
      const format = (document.getElementById(`format-${clipId}`) as HTMLSelectElement).value;
      const quality = (document.getElementById(`quality-${clipId}`) as HTMLSelectElement).value;
      
      const clip = clips.find(c => c.id === clipId);
      if (!clip) return;
      
      let resolution = '1920x1080';
      if (quality === 'high') resolution = '1920x1080';
      else if (quality === 'medium') resolution = '1280x720';
      else if (quality === 'low') resolution = '854x480';
      
      if (format === 'vertical') resolution = '1080x1920';
      else if (format === 'square') resolution = '1080x1080';
      
      const outputPath = clip.output_path.replace('.mp4', `_${format}_${quality}.mp4`);
      
      await window.electron.ffmpeg.cutClip(
        clip.output_path, 
        0, 
        clip.end_time - clip.start_time, 
        outputPath,
        resolution
      );
      
      alert(`✅ Clipe exportado: ${outputPath}`);
    } catch (error) {
      console.error('Erro ao exportar:', error);
      alert('Erro ao exportar clipe');
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.8) return '#10B981';
    if (score >= 0.6) return '#F59E0B';
    return '#EF4444';
  };

  if (loading) {
    return (
      <div className="main-card" style={{ textAlign: 'center', padding: '40px' }}>
        <p>Carregando biblioteca...</p>
      </div>
    );
  }

  return (
    <div className="main-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '24px' }}>📚 Biblioteca de Vídeos</h1>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ color: '#94A3B8' }}>Score mínimo:</span>
          <select 
            value={filterMinScore}
            onChange={(e) => setFilterMinScore(Number(e.target.value))}
            style={{
              padding: '6px 12px',
              backgroundColor: '#1E293B',
              border: '1px solid #334155',
              borderRadius: '6px',
              color: '#F1F5F9'
            }}
          >
            <option value={0}>Todos</option>
            <option value={0.5}>0.5+</option>
            <option value={0.6}>0.6+</option>
            <option value={0.7}>0.7+</option>
            <option value={0.8}>0.8+</option>
          </select>
        </div>
      </div>
      
      {videos.length === 0 ? (
        <p style={{ color: '#94A3B8' }}>Nenhum vídeo processado ainda.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {videos.map(video => (
            <div key={video.id} style={{
              backgroundColor: '#1E293B',
              borderRadius: '16px',
              padding: '20px',
              border: '1px solid #334155'
            }}>
              <div 
                onClick={() => setSelectedVideo(selectedVideo === video.id ? null : video.id)}
                style={{ cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ color: '#F1F5F9', marginBottom: '8px', fontSize: '18px' }}>
                      {video.name}
                    </h3>
                    <div style={{ display: 'flex', gap: '20px', color: '#94A3B8', fontSize: '14px' }}>
                      <span>📅 {formatDate(video.created_at)}</span>
                      <span>⏱️ {formatDuration(video.duration)}</span>
                      <span>🎬 {videoClips(video.id).length} clipes</span>
                      <span>📊 Score médio: {averageScore(video.id)}</span>
                    </div>
                  </div>
                  <span style={{ fontSize: '24px', color: '#94A3B8' }}>
                    {selectedVideo === video.id ? '▼' : '▶'}
                  </span>
                </div>
              </div>

              {/* Clipes */}
              {selectedVideo === video.id && (
                <div style={{ marginTop: '20px', borderTop: '1px solid #334155', paddingTop: '20px' }}>
                  <h4 style={{ color: '#F1F5F9', marginBottom: '16px' }}>🎬 Clipes gerados</h4>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '16px' }}>
                    {videoClips(video.id).map(clip => (
                      <div key={clip.id} style={{
                        backgroundColor: '#0F172A',
                        borderRadius: '12px',
                        overflow: 'hidden',
                        border: '1px solid #334155',
                        transition: 'transform 0.2s',
                        cursor: 'pointer'
                      }}
                      onClick={() => window.open(`video://${encodeURIComponent(clip.output_path.replace(/\\/g, '/'))}`)}
                      >
                        {/* Thumbnail */}
                        {clip.thumbnail_path ? (
                        <img 
                          src={`video://${encodeURIComponent(clip.thumbnail_path?.replace(/\\/g, '/') || '')}`}
                          alt="thumbnail"
                          style={{ width: '100%', height: '140px', objectFit: 'cover' }}
                          onError={(e) => {
                            console.error('❌ Erro thumbnail:', clip.thumbnail_path);
                            e.currentTarget.style.display = 'none';
                            const parent = e.currentTarget.parentElement;
                            if (parent) {
                              parent.style.background = 'linear-gradient(135deg, #3B82F6, #1E293B)';
                              parent.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:140px;font-size:48px;">🎬</div>';
                            }
                          }}
                        />
                        ) : (
                          <div style={{
                            height: '140px',
                            background: 'linear-gradient(135deg, #3B82F6, #1E293B)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '48px'
                          }}>
                            🎬
                          </div>
                        )}
                        
                        {/* Informações */}
                        <div style={{ padding: '16px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span style={{ color: '#3B82F6', fontWeight: 600 }}>
                              ⏱️ {formatDuration(clip.start_time)} - {formatDuration(clip.end_time)}
                            </span>
                            <span style={{
                              backgroundColor: getScoreColor(clip.combined_score),
                              color: '#0F172A',
                              padding: '2px 8px',
                              borderRadius: '12px',
                              fontSize: '12px',
                              fontWeight: 600
                            }}>
                              {(clip.combined_score * 100).toFixed(0)}%
                            </span>
                          </div>

                          <p style={{ color: '#94A3B8', fontSize: '13px', marginBottom: '12px' }}>
                            {clip.reason}
                          </p>

                          {/* Scores em barras */}
                          <div style={{ marginBottom: '12px' }}>
                            <div style={{ marginBottom: '4px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748B' }}>
                                <span>🧠 Semântico</span>
                                <span>{(clip.semantic_score * 100).toFixed(0)}%</span>
                              </div>
                              <div style={{ height: '4px', backgroundColor: '#334155', borderRadius: '2px' }}>
                                <div style={{
                                  width: `${clip.semantic_score * 100}%`,
                                  height: '100%',
                                  backgroundColor: '#3B82F6',
                                  borderRadius: '2px'
                                }} />
                              </div>
                            </div>
                            <div style={{ marginBottom: '4px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748B' }}>
                                <span>❤️ Emocional</span>
                                <span>{(clip.emotional_score * 100).toFixed(0)}%</span>
                              </div>
                              <div style={{ height: '4px', backgroundColor: '#334155', borderRadius: '2px' }}>
                                <div style={{
                                  width: `${clip.emotional_score * 100}%`,
                                  height: '100%',
                                  backgroundColor: '#EF4444',
                                  borderRadius: '2px'
                                }} />
                              </div>
                            </div>
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748B' }}>
                                <span>📖 Narrativo</span>
                                <span>{(clip.narrative_score * 100).toFixed(0)}%</span>
                              </div>
                              <div style={{ height: '4px', backgroundColor: '#334155', borderRadius: '2px' }}>
                                <div style={{
                                  width: `${clip.narrative_score * 100}%`,
                                  height: '100%',
                                  backgroundColor: '#10B981',
                                  borderRadius: '2px'
                                }} />
                              </div>
                            </div>
                          </div>

                          {/* Botões */}
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(`video://${encodeURIComponent(clip.output_path.replace(/\\/g, '/'))}`);
                              }}
                              style={{
                                flex: 1,
                                padding: '8px',
                                backgroundColor: '#3B82F6',
                                border: 'none',
                                borderRadius: '6px',
                                color: 'white',
                                fontSize: '13px',
                                cursor: 'pointer'
                              }}
                            >
                              ▶️ Assistir
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleExportClip(clip.id);
                              }}
                              style={{
                                flex: 1,
                                padding: '8px',
                                backgroundColor: '#10B981',
                                border: 'none',
                                borderRadius: '6px',
                                color: 'white',
                                fontSize: '13px',
                                cursor: 'pointer'
                              }}
                            >
                              📤 Exportar
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}



            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Library;