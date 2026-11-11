/**
 * lib/ziwei/db-analysis —— 主星 × 宫位论断库的类型与占位实现
 *
 * 当前仅保留知识页框架所需的「类型 + 宫位/主题标签」（紫微斗数通用术语），
 * 论断内容库 STAR_DB 尚未收录 —— 因此知识库详情页会生成 0 条静态路由。
 * 补充内容时须注明古籍出处与许可，不得收录未经授权的第三方断语。
 *
 * 排盘内核（安星算法、四化、格局识别、古籍原文）见 lib/ziwei 下的 algorithm.ts / patterns.ts / sihua.ts 等。
 */

export type TopicKey =
  | 'overview' | 'personality' | 'love' | 'career' | 'wealth' | 'health'
  | 'family' | 'children' | 'move' | 'friends' | 'home' | 'spirit' | 'parents';

// iztro zh-CN 宫位名：命宫保留「宫」字，其余无「宫」字，「交友」在 iztro 里叫「仆役」
export const TOPIC_PALACE_NAME: Record<TopicKey, string> = {
  overview:    '命宫',
  personality: '命宫',
  love:        '夫妻',
  career:      '官禄',
  wealth:      '财帛',
  health:      '疾厄',
  family:      '兄弟',
  children:    '子女',
  move:        '迁移',
  friends:     '仆役',
  home:        '田宅',
  spirit:      '福德',
  parents:     '父母',
};

export const TOPIC_LABEL: Record<TopicKey, string> = {
  overview:    '命格总览',
  personality: '性格特质',
  love:        '感情婚姻',
  career:      '事业职业',
  wealth:      '财富运势',
  health:      '健康状况',
  family:      '兄弟合伙',
  children:    '子女缘分',
  move:        '迁移外出',
  friends:     '人际贵人',
  home:        '田宅不动产',
  spirit:      '精神福德',
  parents:     '父母长辈',
};

/**
 * 论断内容库（14 主星 × 各宫位语境的详细断语）——尚未收录。
 * 此处置空；知识库 SEO 页因 `exists=false` 生成 0 条静态详情路由，但列表框架仍可运行。
 */
export const STAR_DB: Record<string, unknown> = {};
