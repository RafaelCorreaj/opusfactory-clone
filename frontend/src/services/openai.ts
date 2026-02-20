import OpenAI from 'openai';

export class OpenAIService {
  private openai: OpenAI;

  constructor(apiKey: string) {
    this.openai = new OpenAI({
      apiKey,
      dangerouslyAllowBrowser: true // Necessário para Electron
    });
  }

  /**
   * Transcreve áudio usando Whisper
   */
  async transcribeAudio(audioFile: File): Promise<string> {
    try {
      const response = await this.openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
        language: 'pt',
        response_format: 'text'
      });
      
      return response as string;
    } catch (error) {
      console.error('Erro na transcrição:', error);
      throw error;
    }
  }

  /**
   * Analisa sentimento e encontra melhores momentos
   */
async analyzeTranscript(text: string): Promise<any> {
  try {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4-turbo', // ou 'gpt-3.5-turbo' se quiser economizar
      messages: [
        {
          role: 'system',
          content: `Você é um analisador de vídeos especializado em identificar momentos de alto impacto. 
          Analise a transcrição fornecida e retorne um JSON com a seguinte estrutura:
          {
            "contentType": "podcast" | "gameplay" | "lecture" | "vlog" | "other", // classificação do tipo de conteúdo
            "overallScores": {
              "semantic": number (0-1),   // baseado em palavras-chave, perguntas, frases de impacto
              "emotional": number (0-1),   // intensidade emocional, polaridade
              "narrative": number (0-1)    // detecção de clímax, storytelling
            },
            "highlights": [
              {
                "start": number,
                "end": number,
                "reason": string,
                "scores": {
                  "semantic": number (0-1),
                  "emotional": number (0-1),
                  "narrative": number (0-1)
                }
              }
            ]
          }
          Use a transcrição para identificar os trechos mais relevantes. Para cada highlight, forneça scores específicos.`
        },
        {
          role: 'user',
          content: text
        }
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' }
    });

    return JSON.parse(response.choices[0].message.content || '{}');
  } catch (error) {
    console.error('Erro na análise:', error);
    throw error;
  }
}

  /**
   * Testa se a chave é válida
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.openai.models.list();
      return true;
    } catch {
      return false;
    }
  }
}