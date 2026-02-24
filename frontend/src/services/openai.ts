import OpenAI from 'openai';

export class OpenAIService {
  private openai: OpenAI;

  constructor(apiKey: string) {
    this.openai = new OpenAI({
      apiKey,
      dangerouslyAllowBrowser: true
    });
  }

  /**
   * Transcreve áudio com timestamps por palavra
   */
  async transcribeAudio(audioFile: File): Promise<any> {
    try {
      const response = await this.openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
        language: 'pt',
        response_format: 'verbose_json',
        timestamp_granularities: ['word']
      });
      
      return response;
    } catch (error) {
      console.error('Erro na transcrição:', error);
      throw error;
    }
  }

  /**
   * Agrupa palavras em frases baseado em pontuação e pausas
   */
  groupWordsIntoSentences(words: any[]): any[] {
    const sentences = [];
    let currentSentence = {
      words: [],
      start: 0,
      end: 0,
      text: ''
    };

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      
      if (currentSentence.words.length === 0) {
        currentSentence.start = word.start;
      }
      
      currentSentence.words.push(word);
      currentSentence.end = word.end;
      currentSentence.text += word.word + ' ';
      
      // Detecta fim de frase por pontuação ou pausa longa
      const nextWord = words[i + 1];
      const pause = nextWord ? nextWord.start - word.end : 0;
      
      if (word.word.includes('.') || word.word.includes('!') || word.word.includes('?') || pause > 0.5) {
        sentences.push({
          start: currentSentence.start,
          end: currentSentence.end,
          text: currentSentence.text.trim()
        });
        currentSentence = { words: [], start: 0, end: 0, text: '' };
      }
    }
    
    // Adiciona última frase
    if (currentSentence.words.length > 0) {
      sentences.push({
        start: currentSentence.start,
        end: currentSentence.end,
        text: currentSentence.text.trim()
      });
    }

    console.log(`📝 ${sentences.length} frases agrupadas`);
    return sentences;
  }

  /**
   * Analisa frases para encontrar micro-narrativas virais
   */
async analyzeViralSentences(sentences: any[]): Promise<any> {
  try {
    const MAX_SENTENCES = 50;
    const limitedSentences = sentences.slice(0, MAX_SENTENCES);
    
    console.log(`📊 Analisando ${limitedSentences.length} frases (limitado a ${MAX_SENTENCES})`);

    const response = await this.openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Você é um especialista em marketing viral para Shorts (YouTube, TikTok, Reels).
                    
                    Analise as frases abaixo e identifique os MELHORES MOMENTOS para cliques virais.
                    
                    REGRAS OBRIGATÓRIAS:
                    - Identifique de 8 a 12 momentos virais em potencial
                    - Cada momento deve conter de 2 a 4 frases consecutivas
                    - Priorize variedade: momentos do início, meio e fim do vídeo
                    - Seja generoso na identificação (depois filtramos)
                    
                    CRITÉRIOS DE PONTUAÇÃO (viralScore):
                    - 90-100: ⭐⭐⭐⭐⭐ viral absoluto (gatilho emocional + surpresa + conclusão)
                    - 70-89:  ⭐⭐⭐⭐ muito bom (engajamento garantido)
                    - 40-69:  ⭐⭐⭐ mediano (pode funcionar com bom título)
                    - Abaixo de 40: ❌ descarte (não retorne estes)
                    
                    Retorne um JSON com:
                    {
                      "viralClips": [
                        {
                          "startSentenceIndex": number,
                          "endSentenceIndex": number,
                          "reason": string (ex: "gancho emocional + virada narrativa"),
                          "viralScore": number (entre 40 e 100)
                        }
                      ]
                    }
                    
                    IMPORTANTE: Retorne APENAS clipes com viralScore >= 40.`
        },
        {
          role: "user",
          content: `Frases do vídeo:
          
          ${limitedSentences.map((s, idx) => `[${idx}] "${s.text}"`).join('\n')}`
        }
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' }
    });

    return JSON.parse(response.choices[0].message.content || '{}');
  } catch (error) {
    console.error('❌ Erro na análise viral:', error);
    return { viralClips: [] };
  }
};

  /**
   * Mantém a análise original para compatibilidade (fallback)
   */
  async analyzeTranscript(text: any): Promise<any> {
    try {
      let contentString = '';
      if (typeof text === 'string') {
        contentString = text;
      } else if (text && typeof text === 'object' && text.text) {
        console.warn('⚠️ analyzeTranscript recebeu um objeto, usando text.text');
        contentString = text.text;
      } else {
        throw new Error('Formato de transcrição inválido para análise.');
      }

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo',
        messages: [
          {
            role: 'system',
            content: `Você é um analisador de vídeos. Retorne um JSON com: contentType, overallScores e highlights (array com start, end, reason, scores).`
          },
          {
            role: 'user',
            content: contentString
          }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });

      return JSON.parse(response.choices[0].message.content || '{}');
    } catch (error) {
      console.error('❌ Erro na análise:', error);
      throw error;
    }
  }
}