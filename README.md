# OpusFactory Clone

Um clone do OpusClip, estilo Format Factory, desenvolvido com Electron, React e TypeScript. O objetivo é criar uma aplicação desktop que automatiza cortes de vídeo usando IA (local ou via API da OpenAI), gerando clipes prontos para redes sociais.

## 🚀 Funcionalidades

- Seleção de múltiplos vídeos
- Processamento local (Whisper/Transformers.js) ou via OpenAI (Whisper API)
- Detecção automática dos melhores momentos (com pontuação de viralidade)
- Corte e redimensionamento para formato vertical (9:16)
- Geração de clipes com legendas animadas (futuro)
- Banco de dados local (SQLite) para histórico e configurações

## 🛠️ Tecnologias

- **Front-end**: React 18, TypeScript, HTML5, CSS3 (Flexbox/Grid, variáveis CSS)
- **Back-end**: Node.js, Electron
- **Processamento**: FFmpeg, Whisper (via Transformers.js ou OpenAI API)
- **Banco de dados**: SQLite (better-sqlite3)
- **Versionamento**: Git, GitHub

## 📦 Como executar (em desenvolvimento)

1. Clone o repositório:
   ```bash
   git clone https://github.com/seu-usuario/opusfactory-clone.git
   cd opusfactory-clone