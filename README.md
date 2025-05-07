# Live Video Player

<div align="center">
  <img src="frontend/public/logo192.png" alt="Live Video Player Logo" width="120">
  <h3>A Decentralized Open-Source Streaming Solution</h3>
  <p>Own your content. Stream freely. Build community.</p>
</div>

<div align="center">
  
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![GitHub Stars](https://img.shields.io/github/stars/idl3o/live-video-player?style=social)](https://github.com/idl3o/live-video-player/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/idl3o/live-video-player?style=social)](https://github.com/idl3o/live-video-player/network/members)
[![GitHub Issues](https://img.shields.io/github/issues/idl3o/live-video-player)](https://github.com/idl3o/live-video-player/issues)
[![Contributions welcome](https://img.shields.io/badge/contributions-welcome-brightgreen.svg)](CONTRIBUTING.md)

</div>

## 🌐 Decentralized Live Streaming for Everyone

Live Video Player is a fully open-source, self-hosted streaming platform that empowers content creators, communities, and organizations to control their own media ecosystem. Unlike centralized streaming platforms that control your content, dictate terms, and monetize your audience, Live Video Player puts the power back in your hands.

### 🔄 Why Decentralization Matters

In a world where content creators are increasingly at the mercy of platform algorithms and moderation policies, decentralization offers:

- **Content Freedom**: No algorithmic suppression or unpredictable moderation
- **Revenue Control**: Keep 100% of your earnings without platform commissions
- **Data Ownership**: Your community's data stays with you, not on corporate servers
- **Resilience**: No single point of failure that can take down all streams
- **Customization**: Tailor the platform to your specific needs and branding
- **True Ownership**: Blockchain integration ensures your content remains yours (coming soon)

## ✨ Features

- **OBS Integration**: Stream directly from OBS Studio to your own server
- **Low-Latency Streaming**: Optimized for real-time interaction using RTMP and HTTP-FLV
- **Audio Visualization**: See live audio levels with responsive visualizer
- **Volume Controls**: Fine-tuned audio controls for viewers
- **Responsive UI**: Modern interface that works across devices
- **Stream Discovery**: Browse active streams on your network
- **Screen Sharing**: Share your screen directly within the platform
- **Federation-Ready**: Architecture designed to connect with other instances (coming soon)
- **Blockchain Integration**: Support for content verification and tokenized contributions (coming soon)

## 🧩 Technology Stack

This project embraces open-source technologies throughout:

- **Backend**: Node.js server with Express and Node-Media-Server (FOSS RTMP server)
- **Frontend**: React application with TypeScript for a responsive viewer
- **Streaming**: Native RTMP protocol with HTTP-FLV for playback
- **Packaging**: Docker support for easy deployment anywhere (coming soon)
- **Blockchain**: Decentralized content verification and monetization layer (in development)

## 🚀 Quick Start

### Self-Host in Minutes

```bash
# Clone the repository
git clone https://github.com/idl3o/live-video-player.git
cd live-video-player

# Start all services (backend + frontend)
npm start
```

Open your browser to `http://localhost:3000` and you're ready to go!

See the [Installation Guide](docs/installation.md) for detailed setup instructions and customization options.

## 🔨 Build Your Own Network

### Stream Without Limits

Live Video Player is designed to be:

1. **Self-Hosted**: Install on your own server, VPS, or even a home computer
2. **Network-Capable**: Connect multiple instances to form content networks (coming soon)
3. **Extendable**: Add plugins and extend functionality with your own code
4. **Community-Driven**: Built by streamers, for streamers

### Deployment Options

- **Single-Server**: Perfect for personal streaming or small communities
- **Multi-Node**: Distribute load across multiple servers for larger audiences (coming soon)
- **Edge Network**: Deploy close to your viewers for optimal performance (coming soon)
- **P2P Enhancement**: Hybrid delivery to reduce server bandwidth costs (on roadmap)

## 🛠️ For Developers

### Architecture

The project consists of two main components:

1. **Backend**: RTMP ingestion server and API for stream management
2. **Frontend**: Viewer interface with real-time playback capabilities

### Extend and Customize

- Add custom themes
- Build plugins
- Implement monetization
- Create your own interface

See our [Developer Guide](docs/developers.md) to start contributing.

### Blockchain Integration (Coming Soon)

Our roadmap includes integration with blockchain technologies to enable:

- **Content Verification**: Cryptographic proofs of content authenticity
- **Creator Tokens**: Issue creator-specific tokens for your community
- **Microtransactions**: Direct support from viewers without intermediaries
- **Smart Contracts**: Programmable interactions between creators and viewers
- **Decentralized Storage**: Optional IPFS-based content archiving

## 🤝 Join the Movement

### The Future is Open

We believe that open-source, decentralized solutions are the future of content creation and distribution. Join us in building that future:

- **[Star this Repository](https://github.com/idl3o/live-video-player)**: Show your support
- **[Fork the Project](https://github.com/idl3o/live-video-player/fork)**: Create your own version
- **[Report Issues](https://github.com/idl3o/live-video-player/issues)**: Help us improve
- **[Contribute Code](https://github.com/idl3o/live-video-player/pulls)**: Add features and fix bugs

### Support the Project

If you find this project useful, please consider:

- Contributing code or documentation
- Reporting bugs and suggesting features
- Sharing with your network

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details. This means you can use, modify, and distribute it freely, even for commercial purposes.

## 💡 Inspiration and Thanks

This project stands on the shoulders of giants in the open-source community:

- [Node-Media-Server](https://github.com/illuspas/Node-Media-Server) for the RTMP engine
- [flv.js](https://github.com/bilibili/flv.js) for the Flash Video playback
- [React](https://reactjs.org/) for the frontend framework
- [Express](https://expressjs.com/) for the API layer
- All [contributors and supporters](CONTRIBUTORS.md) who help make this project better

---

<div align="center">
  <p><strong>Live Video Player</strong> • Free Your Content • Own Your Platform</p>
  <p>Made with ❤️ by the open-source community</p>
</div>