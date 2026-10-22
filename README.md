# millsage · 重逢的间隙

以 BanG Dream! millsage 的泽海奏多与汐见萤为主题的非官方互动网站。仓库包含完整网页源码、Live2D 模型、车库场景、贴图、动作与浏览器运行时，运行时无需访问外部素材服务。

## 互动

- 主页将奏多与萤的半张脸拼合，呼吸与眨眼同步。
- 点击左侧奏多，右侧萤化作白色羽毛向上飘散，然后进入奏多版本的原版车库场景。
- 点击右侧萤，左侧奏多化作玻璃碎片向下消失，然后进入萤版本的原版车库场景。
- 点击车库钢琴前的目标角色、右下角返回按钮，或按 `Escape`，通过时空扭曲动画返回主页。
- 右上角提供暂停动态、全屏与素材说明。

车库播放游戏原始 Spine `home_start` 动作，每轮结束后停留再重播。主页使用原始 Live2D 模型；同步呼吸、眨眼和页面转场由网页控制。

## 本地运行

安装 Node.js 18 或更新版本，在仓库根目录执行：

```sh
node serve.mjs
```

打开 <http://127.0.0.1:8765>。需要支持 WebGL 的现代浏览器。请通过 HTTP 服务访问，直接双击 HTML 文件无法正常加载模块和模型。

无需安装 npm 依赖，也无需构建。首次加载约 33 MB，进入车库后再加载对应场景。

## 文件结构

```text
dist/
  index.html       页面结构
  style.css        布局、视觉样式与动画
  app.js           主页模型、交互状态与转场
  garage.js        车库场景播放与交互
  credits.txt      素材来源与许可证索引
  assets/
    kanata/        奏多 Live2D 模型、贴图与动作
    hotaru/        萤 Live2D 模型、贴图与动作
    immersive/     两套原版车库场景、共享贴图与渲染器
serve.mjs          本地静态服务器
README.txt         离线使用说明
```

## 静态部署

将整个 `dist/` 目录作为网站根目录发布到支持静态文件的托管服务。保留所有文件名、子目录与二进制资源，不需要服务器端代码。

## 素材与许可

游戏角色、美术、模型、贴图与动画归原权利人所有：© BanG Dream! Project © FROMTOKYO © bushiroad。本项目为非官方同人体验。

公开素材整理与网页渲染器来自 [OtoNote](https://ournotes.stonebg.cn/) 及其 [源码仓库](https://github.com/stonesver/otonote)。具体来源和各组件许可证见 [素材说明](dist/credits.txt)、[场景来源](dist/assets/immersive/SOURCES.txt) 与素材目录中的许可证文件。游戏素材与第三方组件遵循各自许可。

萤版车库导出素材的背景可见性由 `garage-loader.js` 根据原始隐藏列表恢复；原始场景 JSON 保持不变。
