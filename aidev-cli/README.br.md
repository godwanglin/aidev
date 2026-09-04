<p align="center">
  <a href="https://aidev-cli.ai">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="Logo do AidevCLI">
    </picture>
  </a>
</p>
<p align="center">O agente de programação com IA de código aberto.</p>
<p align="center">
  <a href="https://aidev-cli.ai/discord"><img alt="Discord" src="https://img.shields.io/discord/1391832426048651334?style=flat-square&label=discord" /></a>
  <a href="https://www.npmjs.com/package/aidev-cli"><img alt="npm" src="https://img.shields.io/npm/v/aidev-cli?style=flat-square" /></a>
  <a href="https://github.com/anomalyco/aidev-cli/actions/workflows/publish.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/anomalyco/aidev-cli/publish.yml?style=flat-square&branch=dev" /></a>
</p>

<p align="center">
  <a href="README.md">English</a> |
  <a href="README.zh.md">简体中文</a> |
  <a href="README.zht.md">繁體中文</a> |
  <a href="README.ko.md">한국어</a> |
  <a href="README.de.md">Deutsch</a> |
  <a href="README.es.md">Español</a> |
  <a href="README.fr.md">Français</a> |
  <a href="README.it.md">Italiano</a> |
  <a href="README.da.md">Dansk</a> |
  <a href="README.ja.md">日本語</a> |
  <a href="README.pl.md">Polski</a> |
  <a href="README.ru.md">Русский</a> |
  <a href="README.bs.md">Bosanski</a> |
  <a href="README.ar.md">العربية</a> |
  <a href="README.no.md">Norsk</a> |
  <a href="README.br.md">Português (Brasil)</a> |
  <a href="README.th.md">ไทย</a> |
  <a href="README.tr.md">Türkçe</a> |
  <a href="README.uk.md">Українська</a> |
  <a href="README.bn.md">বাংলা</a> |
  <a href="README.gr.md">Ελληνικά</a> |
  <a href="README.vi.md">Tiếng Việt</a>
</p>

[![AidevCLI Terminal UI](packages/web/src/assets/lander/screenshot.png)](https://aidev-cli.ai)

---

### Instalação

```bash
# YOLO
curl -fsSL https://aidev-cli.ai/install | bash

# Gerenciadores de pacotes
npm i -g aidev-cli@latest        # ou bun/pnpm/yarn
scoop install aidev-cli             # Windows
choco install aidev-cli             # Windows
brew install anomalyco/tap/aidev-cli # macOS e Linux (recomendado, sempre atualizado)
brew install aidev-cli              # macOS e Linux (fórmula oficial do brew, atualiza menos)
sudo pacman -S aidev-cli            # Arch Linux (Stable)
paru -S aidev-cli-bin               # Arch Linux (Latest from AUR)
mise use -g aidev-cli               # qualquer sistema
nix run nixpkgs#aidev-cli           # ou github:anomalyco/aidev-cli para a branch dev mais recente
```

> [!TIP]
> Remova versões anteriores a 0.1.x antes de instalar.

### App desktop (BETA)

O AidevCLI também está disponível como aplicativo desktop. Baixe diretamente pela [página de releases](https://github.com/anomalyco/aidev-cli/releases) ou em [aidev-cli.ai/download](https://aidev-cli.ai/download).

| Plataforma            | Download                           |
| --------------------- | ---------------------------------- |
| macOS (Apple Silicon) | `aidev-cli-desktop-mac-arm64.dmg`   |
| macOS (Intel)         | `aidev-cli-desktop-mac-x64.dmg`     |
| Windows               | `aidev-cli-desktop-windows-x64.exe` |
| Linux                 | `.deb`, `.rpm` ou AppImage         |

```bash
# macOS (Homebrew)
brew install --cask aidev-cli-desktop
# Windows (Scoop)
scoop bucket add extras; scoop install extras/aidev-cli-desktop
```

#### Diretório de instalação

O script de instalação respeita a seguinte ordem de prioridade para o caminho de instalação:

1. `$AIDEV_CLI_INSTALL_DIR` - Diretório de instalação personalizado
2. `$XDG_BIN_DIR` - Caminho compatível com a especificação XDG Base Directory
3. `$HOME/bin` - Diretório binário padrão do usuário (se existir ou puder ser criado)
4. `$HOME/.aidev-cli/bin` - Fallback padrão

```bash
# Exemplos
AIDEV_CLI_INSTALL_DIR=/usr/local/bin curl -fsSL https://aidev-cli.ai/install | bash
XDG_BIN_DIR=$HOME/.local/bin curl -fsSL https://aidev-cli.ai/install | bash
```

### Agents

O AidevCLI inclui dois agents integrados, que você pode alternar com a tecla `Tab`.

- **build** - Padrão, agent com acesso total para trabalho de desenvolvimento
- **plan** - Agent somente leitura para análise e exploração de código
  - Nega edições de arquivos por padrão
  - Pede permissão antes de executar comandos bash
  - Ideal para explorar codebases desconhecidas ou planejar mudanças

Também há um subagent **general** para buscas complexas e tarefas em várias etapas.
Ele é usado internamente e pode ser invocado com `@general` nas mensagens.

Saiba mais sobre [agents](https://aidev-cli.ai/docs/agents).

### Documentação

Para mais informações sobre como configurar o AidevCLI, [**veja nossa documentação**](https://aidev-cli.ai/docs).

### Contribuir

Se você tem interesse em contribuir com o AidevCLI, leia os [contributing docs](./CONTRIBUTING.md) antes de enviar um pull request.

### Construindo com AidevCLI

Se você estiver trabalhando em um projeto relacionado ao AidevCLI e estiver usando "aidev-cli" como parte do nome (por exemplo, "aidev-cli-dashboard" ou "aidev-cli-mobile"), adicione uma nota no README para deixar claro que não foi construído pela equipe do AidevCLI e não é afiliado a nós de nenhuma forma.

---

**Junte-se à nossa comunidade** [Discord](https://discord.gg/aidev-cli) | [X.com](https://x.com/aidev-cli)
