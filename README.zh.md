# dsh-sound

[English](README.md) · 中文

为 DSH Web UI 和 Desktop 提供提示音：回合完成、人类排队续跑、停止、审批、提问、计划评审、目标受阻与失败。主会话和子代理分别配置声音与音量，自定义音频保存在浏览器中。

这是 [AI-Galaxy-GPU/dsh-sound](https://github.com/AI-Galaxy-GPU/dsh-sound) 的 [iBobbyTS fork](https://github.com/iBobbyTS/dsh-sound)。以下安装本 checkout；上游 npm 包不包含本 fork 的改动。

## 兼容性

已验证：DSH 0.2.2-rc.1（源码与自动化检查）；尚未完成 Desktop 实测。

## 安装

需要 DSH、Node.js `>=20`，以及 DSH 插件安装所需的 pnpm。仓库已包含运行文件，无需构建。

```sh
git clone https://github.com/iBobbyTS/dsh-sound.git
cd dsh-sound
dsh plugin --profile web add "$PWD"
```

Desktop 请在应用插件管理器中选择此目录；`desktop` profile 由应用管理。Windows cmd 使用完整目录路径。安装后重启 DSH Host 并刷新页面。更新时更新本 checkout，在同一 profile 重新添加同一目录。

## 使用

打开「设置 → 声音通知」，逐事件选择声音与音量。主会话面板为八行，子代理面板为七行及总忽略开关。停止音默认静音。普通 fork 走主会话通道，只有明确标记的子代理会话走子代理通道。

音频文件保存在 IndexedDB，配置保存在 localStorage。浏览器自动播放限制可能影响播放；选择声音时可试听。可导入/导出完整设置与自定义音频。

## 文档

- [事件、设置、存储与兼容](docs/events-and-storage.zh.md)
- [开发](docs/development.md) · [开发规范](https://github.com/iBobbyTS/dsh-sound/blob/main/AGENTS.md)
- [历史](CHANGELOG.md) · [MIT 许可](LICENSE)
