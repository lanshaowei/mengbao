// SVG 插画资源库（纯文本，加载快）
window.BABY_ART = {
  // 主 Logo：微笑萌宝（闭眼+腮红）
  logo: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="lgBg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FFE5EC"/>
        <stop offset="100%" stop-color="#F3E8FF"/>
      </linearGradient>
      <linearGradient id="lgFace" x1="50%" y1="0%" x2="50%" y2="100%">
        <stop offset="0%" stop-color="#FFE0E2"/>
        <stop offset="100%" stop-color="#FFC9CE"/>
      </linearGradient>
    </defs>
    <circle cx="60" cy="60" r="58" fill="url(#lgBg)"/>
    <!-- 头发 -->
    <path d="M30 38 Q34 22 45 28 Q50 18 60 26 Q70 18 75 28 Q86 22 90 38 Q80 32 70 34 Q60 30 50 34 Q40 32 30 38 Z" fill="#5D4037" opacity="0.85"/>
    <!-- 脸 -->
    <ellipse cx="60" cy="66" rx="32" ry="34" fill="url(#lgFace)"/>
    <!-- 腮红 -->
    <ellipse cx="40" cy="74" rx="8" ry="6" fill="#FF99AD" opacity="0.55"/>
    <ellipse cx="80" cy="74" rx="8" ry="6" fill="#FF99AD" opacity="0.55"/>
    <!-- 闭眼笑 -->
    <path d="M44 64 Q49 58 54 64" stroke="#3D3D3D" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M66 64 Q71 58 76 64" stroke="#3D3D3D" stroke-width="3" fill="none" stroke-linecap="round"/>
    <!-- 小嘴 -->
    <path d="M55 78 Q60 84 65 78" stroke="#3D3D3D" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <!-- 装饰小星星 -->
    <path d="M18 22 L19 25 L22 25 L20 27 L21 30 L18 28 L15 30 L16 27 L14 25 L17 25 Z" fill="#FFD700" opacity="0.7"/>
    <circle cx="100" cy="20" r="2" fill="#FF99AD"/>
    <circle cx="105" cy="40" r="1.5" fill="#9C7BD9"/>
  </svg>`,

  // 小头像（用于顶部）
  avatar: `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
    <circle cx="20" cy="20" r="20" fill="#FFE5EC"/>
    <ellipse cx="20" cy="22" rx="11" ry="12" fill="#FFD8DC"/>
    <ellipse cx="13" cy="24" rx="3" ry="2" fill="#FF99AD" opacity="0.55"/>
    <ellipse cx="27" cy="24" rx="3" ry="2" fill="#FF99AD" opacity="0.55"/>
    <path d="M15 21 Q17 19 19 21" stroke="#3D3D3D" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    <path d="M21 21 Q23 19 25 21" stroke="#3D3D3D" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    <path d="M18 26 Q20 28 22 26" stroke="#3D3D3D" stroke-width="1.2" fill="none" stroke-linecap="round"/>
  </svg>`,

  // 空状态：暂无宝宝
  emptyBaby: `<svg viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="ebBg" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#FFF5F7"/>
        <stop offset="100%" stop-color="#F3E8FF"/>
      </linearGradient>
    </defs>
    <ellipse cx="100" cy="140" rx="70" ry="6" fill="#FFE0E5" opacity="0.5"/>
    <!-- 婴儿床轮廓 -->
    <path d="M40 110 Q40 95 50 95 L150 95 Q160 95 160 110 L160 125 L40 125 Z" fill="#FFB7C5" opacity="0.3"/>
    <!-- 宝宝 -->
    <circle cx="100" cy="85" r="25" fill="url(#ebBg)"/>
    <ellipse cx="100" cy="88" rx="20" ry="22" fill="#FFD8DC"/>
    <ellipse cx="86" cy="93" rx="4" ry="3" fill="#FF99AD" opacity="0.55"/>
    <ellipse cx="114" cy="93" rx="4" ry="3" fill="#FF99AD" opacity="0.55"/>
    <path d="M92 88 Q95 85 98 88" stroke="#3D3D3D" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M102 88 Q105 85 108 88" stroke="#3D3D3D" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M95 96 Q100 100 105 96" stroke="#3D3D3D" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <!-- 装饰 -->
    <path d="M30 40 L32 45 L37 45 L33 49 L34 54 L30 51 L26 54 L27 49 L23 45 L28 45 Z" fill="#FFD700" opacity="0.5"/>
    <path d="M170 50 L171 53 L174 53 L172 55 L173 58 L170 56 L167 58 L168 55 L166 53 L169 53 Z" fill="#FFB7C5" opacity="0.6"/>
  </svg>`,

  // 空状态：暂无记录
  emptyRecord: `<svg viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="erBg" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#E3F2FD"/>
        <stop offset="100%" stop-color="#F3E8FF"/>
      </linearGradient>
    </defs>
    <ellipse cx="100" cy="140" rx="60" ry="5" fill="#E0E0F0" opacity="0.5"/>
    <!-- 笔记本 -->
    <rect x="60" y="50" width="80" height="80" rx="6" fill="#FFB7C5" opacity="0.4"/>
    <rect x="68" y="60" width="64" height="6" rx="3" fill="white" opacity="0.8"/>
    <rect x="68" y="72" width="50" height="6" rx="3" fill="white" opacity="0.8"/>
    <rect x="68" y="84" width="58" height="6" rx="3" fill="white" opacity="0.8"/>
    <!-- 装饰 -->
    <circle cx="160" cy="55" r="8" fill="#FFD700" opacity="0.5"/>
    <path d="M30 80 L40 75 L40 85 Z" fill="#9C7BD9" opacity="0.5"/>
  </svg>`,

  // 空状态：暂无提醒
  emptyReminder: `<svg viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="ermBg" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#FFF8DC"/>
        <stop offset="100%" stop-color="#FFE5EC"/>
      </linearGradient>
    </defs>
    <!-- 铃铛 -->
    <path d="M100 30 Q75 30 75 60 L75 90 L65 110 L135 110 L125 90 L125 60 Q125 30 100 30 Z" fill="url(#ermBg)" stroke="#FFB7C5" stroke-width="2"/>
    <circle cx="100" cy="120" r="8" fill="#FFD700"/>
    <circle cx="100" cy="30" r="3" fill="#FFD700"/>
    <!-- 装饰 -->
    <path d="M40 50 L41 53 L44 53 L42 55 L43 58 L40 56 L37 58 L38 55 L36 53 L39 53 Z" fill="#FF99AD" opacity="0.6"/>
    <path d="M165 90 L166 93 L169 93 L167 95 L168 98 L165 96 L162 98 L163 95 L161 93 L164 93 Z" fill="#9C7BD9" opacity="0.5"/>
  </svg>`,

  // 庆祝插画（已接种等场景）
  celebrate: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
    <circle cx="40" cy="40" r="35" fill="#E8F5E9"/>
    <path d="M25 40 L37 52 L57 30" stroke="#66BB6A" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`
};