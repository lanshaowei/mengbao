# 萌宝成长记 · Android APK 打包指南

把 GitHub Pages 上的网页（https://lanshaowei.github.io/mengbao/）变成 Android 手机可用的 APK 安装包。
老人手机上点图标就直接打开应用，不用记网址、不用打开 Chrome。

---

## 三种方案对比

| 方案 | 难度 | 耗时 | 包大小 | 自定义程度 | 推荐场景 |
|---|---|---|---|---|---|
| **A. PWA Builder（在线工具）** | ⭐ | 3 分钟 | 5-8 MB | ⭐⭐ | 最省事，立刻拿到 APK |
| **B. Capacitor（命令行工具）** | ⭐⭐⭐ | 30 分钟 | 4-6 MB | ⭐⭐⭐⭐ | 想自己掌控构建过程 |
| **C. Android Studio WebView** | ⭐⭐⭐⭐ | 1-2 小时 | 3-5 MB | ⭐⭐⭐⭐⭐ | 想深度定制、加原生功能 |

---

## 方案 A：PWA Builder（最快，强烈推荐 ⭐）

适用：几分钟拿到 APK 给家里老人用。

### 步骤

#### A1. 添加 PWA 清单到网站

仓库根目录新建 `manifest.json`（文件已预生成，详见末尾）：

```json
{
  "name": "萌宝成长记",
  "short_name": "萌宝",
  "start_url": "/mengbao/",
  "scope": "/mengbao/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#FFE5EC",
  "theme_color": "#FFB7C5",
  "icons": [
    {
      "src": "/mengbao/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/mengbao/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

并在 `index.html` 的 `<head>` 内加：

```html
<link rel="manifest" href="manifest.json" />
<meta name="theme-color" content="#FFB7C5" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
```

#### A2. 生成图标

用现有 SVG logo 导出 PNG（512×512 和 192×192 两个尺寸），保存到仓库：
- `icon-192.png`
- `icon-512.png`

可用在线工具：https://realfavicongenerator.net/ 上传 SVG 自动生成全套图标。

#### A3. 用 PWA Builder 生成 APK

1. 打开 <https://www.pwabuilder.com/>
2. 在输入框粘贴：`https://lanshaowei.github.io/mengbao/`
3. 点 **Start** → 等几秒扫描
4. 点击 **Package For Stores** → 选 **Android** → 点 **Generate**
5. 选 **Free** 模式 → 配置：
   - Package ID: `com.lanshaowei.mengbao` （或自取）
   - App name: `萌宝成长记`
   - Display: `Standalone`
   - Orientation: `Portrait`
6. 点 **Generate** → 下载 `.apk` 和 `.aab` 文件

#### A4. 安装到老人手机

把 APK 文件通过微信/QQ 发给家人，下载后：
- 系统设置 → 允许"未知来源"安装
- 点 APK 文件 → 安装
- 桌面上出现「萌宝」图标
- 点图标直接进入应用（无 Chrome 界面）

#### A5. 已签名发布（可选）

PWA Builder 生成的 APK 是 debug 签名，要正式发布需：
- 自己创建 keystore（Java keytool）
- 用 jarsigner / apksigner 重签
- 或上传 Google Play 自动签名

> 家用场景 debug 签名够用，不必折腾正式签名。

---

## 方案 B：Capacitor（命令行工具）

适用：想用 npm 命令自己构建，对构建过程有完全控制。

### 前置环境

1. Node.js 18+ 已安装
2. Java JDK 17+ 已安装
3. Android SDK + Android Studio 已安装
4. 配置环境变量 `ANDROID_HOME` 指向 SDK 路径

### 步骤

#### B1. 安装 Capacitor

```bash
npm init -y
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init "萌宝成长记" "com.lanshaowei.mengbao" --web-dir=dist
```

#### B2. 准备构建目录

把当前网站文件（index.html、styles.css、app.js、vaccines.js、config.js、assets.js）打包到 `dist/` 文件夹。

#### B3. 添加 Android 平台

```bash
npx cap add android
```

这会生成 `android/` 目录。

#### B4. 配置 WebView

编辑 `android/app/src/main/assets/capacitor.config.json`：

```json
{
  "appId": "com.lanshaowei.mengbao",
  "appName": "萌宝成长记",
  "webDir": "dist",
  "android": {
    "allowMixedContent": false,
    "captureInput": true,
    "webContentsDebuggingEnabled": false
  }
}
```

#### B5. 自定义图标与启动屏

把 `icon-192.png` 和 `icon-512.png` 放进 `android/app/src/main/res/` 对应 mipmap 目录（替换默认图标）。

启动屏：编辑 `android/app/src/main/res/values/styles.xml` 的 `windowBackground`。

#### B6. 同步 Web 代码到 Android

```bash
npx cap sync android
```

#### B7. 构建 APK

用 Android Studio 打开 `android/` 目录：
1. 等待 Gradle 同步
2. **Build → Build Bundle(s)/APK(s) → Build APK(s)**
3. APK 输出在 `android/app/build/outputs/apk/debug/app-debug.apk`

或者命令行：

```bash
cd android
./gradlew assembleDebug
```

生成的 APK 通过微信传给老人安装。

---

## 方案 C：Android Studio WebView 模板

适用：想完全自己写 Android 项目，集成 WebView。

### 步骤

#### C1. Android Studio 新建项目

- File → New → New Project
- 选 **Empty Activity**
- Name: `Mengbao`
- Package name: `com.lanshaowei.mengbao`
- Language: **Kotlin**
- Min SDK: **24** (Android 7.0)
- Target SDK: **34** (Android 14)

#### C2. 添加网络权限

编辑 `app/src/main/AndroidManifest.xml`：

```xml
<uses-permission android:name="android.permission.INTERNET" />
```

#### C3. 修改主 Activity

编辑 `app/src/main/java/com/lanshaowei/mengbao/MainActivity.kt`：

```kotlin
package com.lanshaowei.mengbao

import android.os.Bundle
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val webView = WebView(this)
        setContentView(webView)

        webView.webViewClient = WebViewClient()

        val settings: WebSettings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true    // 关键：启用 localStorage
        settings.databaseEnabled = true
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.setSupportZoom(false)
        settings.builtInZoomControls = false

        webView.loadUrl("https://lanshaowei.github.io/mengbao/")
    }
}
```

#### C4. 替换图标

右键 `app/src/main/res/` → New → Image Asset → 选 Foreground Source 为 SVG/PNG → 生成 launcher icons。

#### C5. 构建

Build → Build Bundle(s)/APK(s) → Build APK(s)

---

## 三种方案通用：APK 安装到老人手机

### 准备

**手机端**：
1. 设置 → 应用 → 特殊权限 → 安装未知应用
2. 找到「文件管理器 / 微信 / QQ」 → 允许
4. **下载** APK 文件
5. **打开** APK → 系统提示安装
6. 允许 → 安装完成

**第一次打开**会看到 Supabase 登录页，输入：
- 用户名：`mama` / `yeye` / `nainai` 等
- 密码：（管理员告诉家人的密码）

### 老人日常使用

- 桌面找到「萌宝」图标
- 点开直接进入应用
- 顶部快捷按钮 → 喂奶 / 换尿布 / 睡眠 一次到位
- 看到「已同步 ✓」= 数据已上传云端，家人也能看到

---

## 推荐做法

### 短期（今天）

用 PWA Builder 生成 debug APK → 微信发给老人装 → **老人先试用一周**

### 中期（1 周内）

如果老人用得习惯：
1. 决定是继续用 PWA Builder 升级版本
2. 还是升级到方案 B（Capacitor）做正式签名
3. 是否要加推送通知、声音提醒等原生功能

### 长期（可选）

上架应用市场（华为、小米、OPPO、Vivo）：
- 需要正式签名（¥700/年开发者认证）
- 需要应用商店审核
- 适合公开分发

家用场景不需要，**PWA + 微信传 APK** 已经够用。

---

## 故障排查

| 现象 | 解决 |
|---|---|
| 安装时提示"未知来源被禁止" | 设置 → 应用 → 特殊权限 → 安装未知应用 → 允许文件管理器 |
| 打开 APP 后白屏 | 网络问题，检查 https://lanshaowei.github.io/mengbao/ 是否能访问 |
| 提示"无法连接服务器" | Supabase 配置问题，检查 config.js 里的 URL 和 key |
| 数据没同步 | 检查 APP 右上角状态指示器，应显示"✓ 已同步" |
| 老人忘记密码 | 在 SUPABASE Dashboard 重置或重新创建账号 |

---

## 附：完整 manifest.json 文件

```json
{
  "name": "萌宝成长记",
  "short_name": "萌宝",
  "description": "全家一起记录宝宝成长",
  "start_url": "/mengbao/",
  "scope": "/mengbao/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#FFE5EC",
  "theme_color": "#FFB7C5",
  "lang": "zh-CN",
  "icons": [
    {
      "src": "/mengbao/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/mengbao/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

---

## 附：service-worker.js（可选，让 APP 离线可用）

新建 `sw.js`：

```javascript
const CACHE = 'mengbao-v1';
const ASSETS = [
  '/mengbao/',
  '/mengbao/index.html',
  '/mengbao/styles.css',
  '/mengbao/app.js',
  '/mengbao/vaccines.js',
  '/mengbao/assets.js',
  '/mengbao/config.js',
  '/mengbao/manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
```

在 `index.html` 末尾加：

```html
<script>
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/mengbao/sw.js');
  }
</script>
```

这样 APP 在网络不好的情况下也能打开查看最近缓存的数据。

---

**有任何疑问可以继续问我。推荐先用 PWA Builder 试试，3 分钟就能拿到 APK。**